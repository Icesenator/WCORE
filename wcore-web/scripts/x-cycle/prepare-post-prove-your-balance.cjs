const { existsSync, readdirSync } = require("node:fs");
const { basename, resolve } = require("node:path");

const ROOT = resolve(__dirname, "../..");
const CDP_URL = "http://127.0.0.1:9224";
const IMAGE = resolve(ROOT, "apps/web/public/wcore-post-prove-your-balance.png");
const TEXT = [
  "Your balance is a claim. Prove it.",
  "",
  "Public blockchain data can disagree across RPCs and price sources.",
  "",
  "WCORE cross-checks the signals before showing one clean, read-only view.",
  "",
  "Read first. Act later.",
  "wcore.xyz",
];

const FORBIDDEN = [
  { re: /\u2014/, name: "em dash" },
  { re: /\u2013/, name: "en dash" },
  { re: /\u00A0/, name: "non-breaking space" },
  { re: /\.\.\./, name: "ellipsis" },
];

const joined = TEXT.join("\n");
const issues = FORBIDDEN.filter((item) => item.re.test(joined)).map((item) => item.name);
if (issues.length > 0) {
  console.error("REFUSED: forbidden text patterns:", issues.join(", "));
  process.exit(1);
}

function loadChromium() {
  const candidates = ["playwright", resolve(ROOT, "node_modules/playwright")];
  const pnpmRoot = resolve(ROOT, "node_modules/.pnpm");
  if (existsSync(pnpmRoot)) {
    for (const entry of readdirSync(pnpmRoot)) {
      if (entry.startsWith("playwright@")) candidates.push(resolve(pnpmRoot, entry, "node_modules/playwright"));
    }
  }
  candidates.push("K:/ProjetIA/WCORE/wcore-web/node_modules/.pnpm/playwright@1.59.1/node_modules/playwright");

  for (const candidate of candidates) {
    try {
      return require(candidate).chromium;
    } catch (_error) {}
  }
  throw new Error("Playwright was not found");
}

function normalizeDraft(text) {
  return String(text || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n+$/g, "");
}

(async () => {
  if (!existsSync(IMAGE)) throw new Error(`Image not found: ${IMAGE}`);

  const chromium = loadChromium();
  const browser = await chromium.connectOverCDP(CDP_URL);
  const contexts = browser.contexts();
  if (contexts.length === 0) throw new Error("CDP browser has no usable context");

  const page = await contexts[0].newPage();
  let keepPage = false;
  const abort = async (message) => {
    if (!page.isClosed()) await page.close();
    throw new Error(message);
  };

  try {
    await page.goto("https://x.com/compose/post", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(3500);
    await page.bringToFront();

    const composer = await page.evaluate(() => {
      const visible = (element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      };
      const editors = Array.from(document.querySelectorAll('[data-testid="tweetTextarea_0"]'));
      const editor = editors.find(visible);
      if (!editor) return null;
      const allInputs = Array.from(document.querySelectorAll('input[data-testid="fileInput"], input[type="file"]'));
      let scope = editor.closest('[role="dialog"]');
      let matchingInputs = scope ? allInputs.filter((input) => scope.contains(input)) : [];
      if (matchingInputs.length === 0) scope = editor;
      while (scope && matchingInputs.length === 0) {
        matchingInputs = allInputs.filter((input) => scope.contains(input));
        scope = matchingInputs.length === 0 ? scope.parentElement : scope;
      }
      if (!scope || matchingInputs.length !== 1) return null;
      const attachments = scope.querySelectorAll('[data-testid="attachments"] img, [data-testid="tweetPhoto"] img');
      const input = matchingInputs[0];
      return {
        editorIndex: editors.indexOf(editor),
        inputIndex: allInputs.indexOf(input),
        text: editor.innerText,
        attachmentCount: attachments.length,
        fileCount: input.files ? input.files.length : 0,
      };
    });

    if (!composer) await abort("No unambiguous visible composer and matching file input found");
    if (normalizeDraft(composer.text) !== "" || composer.attachmentCount !== 0 || composer.fileCount !== 0) {
      await abort("Fresh composer is not clean");
    }

    const selected = await page.evaluate(({ editorIndex }) => {
      const editor = document.querySelectorAll('[data-testid="tweetTextarea_0"]')[editorIndex];
      if (!editor) return false;
      editor.focus();
      const range = document.createRange();
      range.selectNodeContents(editor);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      return true;
    }, composer);
    if (!selected) await abort("Visible composer disappeared before draft entry");

    await page.keyboard.press("Control+A");
    await page.keyboard.press("Delete");
    for (let index = 0; index < TEXT.length; index += 1) {
      if (TEXT[index]) await page.keyboard.type(TEXT[index], { delay: 20 });
      if (index < TEXT.length - 1) await page.keyboard.press("Shift+Enter");
    }

    const actual = await page.evaluate(({ editorIndex }) => {
      const editor = document.querySelectorAll('[data-testid="tweetTextarea_0"]')[editorIndex];
      if (!editor) return "";
      const blocks = Array.from(editor.querySelectorAll('[data-block="true"]'));
      return blocks.length ? blocks.map((block) => block.textContent || "").join("\n") : editor.innerText;
    }, composer);
    if (normalizeDraft(actual) !== normalizeDraft(joined)) await abort("Draft text mismatch");

    const fileInputs = page.locator('input[data-testid="fileInput"], input[type="file"]');
    await fileInputs.nth(composer.inputIndex).setInputFiles(IMAGE);
    await page.waitForTimeout(4500);

    const finalState = await page.evaluate(({ editorIndex, inputIndex }) => {
      const editor = document.querySelectorAll('[data-testid="tweetTextarea_0"]')[editorIndex];
      const input = document.querySelectorAll('input[data-testid="fileInput"], input[type="file"]')[inputIndex];
      if (!editor || !input) return { text: "", textLen: 0, imageCount: 0, imageName: "" };
      const blocks = Array.from(editor.querySelectorAll('[data-block="true"]'));
      const text = blocks.length ? blocks.map((block) => block.textContent || "").join("\n") : editor.innerText;
      const files = input.files ? Array.from(input.files) : [];
      return { text, textLen: text.length, imageCount: files.length, imageName: files.length === 1 ? files[0].name : "" };
    }, composer);

    if (!finalState.textLen) await abort("Final draft text is empty");
    if (finalState.imageCount !== 1) await abort(`Expected exactly one image; found ${finalState.imageCount}`);
    if (normalizeDraft(finalState.text) !== normalizeDraft(joined)) await abort("Final draft changed after image attachment");
    if (finalState.imageName !== basename(IMAGE)) await abort(`Unexpected attached image: ${finalState.imageName}`);

    keepPage = true;
    console.log("Verified copy:\n" + finalState.text);
    console.log("Image:", finalState.imageName);
    console.log("DRAFT ONLY - NOT PUBLISHED");
  } finally {
    if (!keepPage && !page.isClosed()) await page.close();
  }

  await new Promise(() => {});
})().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});

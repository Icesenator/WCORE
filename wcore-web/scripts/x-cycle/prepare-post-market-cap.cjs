// Draft-only X preparation. This script has no publication action.
const { existsSync, readdirSync } = require("node:fs");
const { basename, resolve } = require("node:path");

const ROOT = resolve(__dirname, "../..");
const CDP_URL = "http://127.0.0.1:9224";
const IMAGE = resolve(ROOT, "apps/web/public/wcore-post-market-cap.png");
const TEXT = [
  "Today's WCORE update.",
  "",
  "Market Cap Crypto and Market Cap Stock are live.",
  "",
  "Explore 5,000 crypto assets and 5,000 public companies with search, rankings, logos and clear data freshness.",
  "",
  "Two markets. One clean view.",
  "",
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
      if (entry.startsWith("playwright@")) {
        candidates.push(resolve(pnpmRoot, entry, "node_modules/playwright"));
      }
    }
  }

  for (const candidate of candidates) {
    try {
      return require(candidate).chromium;
    } catch (_error) {
      // Try the next portable installation location.
    }
  }
  throw new Error("Playwright was not found under the project dependency tree");
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

  // Own a new page so an existing draft can never be overwritten.
  const page = await contexts[0].newPage();
  let keepPage = false;
  const abort = async (message) => {
    if (!page.isClosed()) await page.close();
    throw new Error(message);
  };

  try {
    await page.goto("https://x.com/compose/post", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
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
      await abort("Fresh composer is not clean; refusing to alter a stale draft or attachment");
    }

    const selected = await page.evaluate(({ editorIndex }) => {
      const editors = document.querySelectorAll('[data-testid="tweetTextarea_0"]');
      const editor = editors[editorIndex];
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
    await page.waitForTimeout(700);

    const actual = await page.evaluate(({ editorIndex }) => {
      const editors = document.querySelectorAll('[data-testid="tweetTextarea_0"]');
      const editor = editors[editorIndex];
      if (!editor) return "";
      const blocks = Array.from(editor.querySelectorAll('[data-block="true"]'));
      return blocks.length ? blocks.map((block) => block.textContent || "").join("\n") : editor.innerText;
    }, composer);
    if (normalizeDraft(actual) !== normalizeDraft(joined)) {
      await abort(`Draft text mismatch\nEXPECTED:\n${joined}\nACTUAL:\n${actual}`);
    }

    const fileInputs = page.locator('input[data-testid="fileInput"], input[type="file"]');
    await fileInputs.nth(composer.inputIndex).setInputFiles(IMAGE);
    await page.waitForTimeout(4500);

    const finalState = await page.evaluate(({ editorIndex, inputIndex }) => {
      const editors = Array.from(document.querySelectorAll('[data-testid="tweetTextarea_0"]'));
      const inputs = Array.from(document.querySelectorAll('input[data-testid="fileInput"], input[type="file"]'));
      const editor = editors[editorIndex];
      const input = inputs[inputIndex];
      if (!editor || !input) return { text: "", textLen: 0, hasImage: false, imageCount: 0, imageName: "" };

      const blocks = Array.from(editor.querySelectorAll('[data-block="true"]'));
      const text = blocks.length ? blocks.map((block) => block.textContent || "").join("\n") : editor.innerText;

      let scope = editor.closest('[role="dialog"]');
      if (!scope || !scope.contains(input)) {
        scope = editor;
        while (scope && !scope.contains(input)) scope = scope.parentElement;
      }
      const media = scope
        ? scope.querySelectorAll('[data-testid="attachments"] img, [data-testid="tweetPhoto"] img')
        : [];
      const files = input.files ? Array.from(input.files) : [];
      const imageCount = Math.max(media.length, files.length);
      return {
        text,
        textLen: text.length,
        hasImage: imageCount === 1,
        imageCount,
        imageName: files.length === 1 ? files[0].name : "",
      };
    }, composer);

    if (!finalState.textLen) await abort("Final draft text is empty");
    if (!finalState.hasImage) await abort(`Expected exactly one image; found ${finalState.imageCount}`);
    if (normalizeDraft(finalState.text) !== normalizeDraft(joined)) {
      await abort("Final draft changed after image attachment");
    }
    if (finalState.imageName && finalState.imageName !== basename(IMAGE)) {
      await abort(`Unexpected attached image: ${finalState.imageName}`);
    }

    keepPage = true;
    console.log("Text length:", finalState.textLen);
    console.log("Verified copy:\n" + finalState.text);
    console.log("Image count/name:", finalState.imageCount, finalState.imageName || basename(IMAGE));
    console.log("DRAFT ONLY - NOT PUBLISHED");
    console.log("Page remains open for user review:", page.url());
  } finally {
    if (!keepPage && !page.isClosed()) await page.close();
  }

  // Keep the CDP client alive so X retains the uploaded media during user review.
  await new Promise(() => {});
})().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});

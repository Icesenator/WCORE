import { chromium } from "playwright";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(__dirname, "..", "apps", "web", "public");
const name = process.argv[2];

if (!name || !/^[a-zA-Z0-9._-]+$/.test(name)) {
  console.error("Usage: node scripts/render-public-svg.mjs <public-svg-basename>");
  process.exit(1);
}

const svgPath = join(publicDir, `${name}.svg`);
const pngPath = join(publicDir, `${name}.png`);

if (!existsSync(svgPath)) {
  console.error(`Missing SVG: ${svgPath}`);
  process.exit(1);
}

const svg = readFileSync(svgPath, "utf8");
const viewBox = svg.match(/viewBox="\s*0\s+0\s+(\d+)\s+(\d+)\s*"/);
const widthAttr = svg.match(/width="(\d+)"/);
const heightAttr = svg.match(/height="(\d+)"/);
const width = viewBox ? Number(viewBox[1]) : widthAttr ? Number(widthAttr[1]) : 1200;
const height = viewBox ? Number(viewBox[2]) : heightAttr ? Number(heightAttr[1]) : 675;
const baseHref = pathToFileURL(publicDir + "/").href;
const html = `<!doctype html><html><head><base href="${baseHref}"><style>
  *{box-sizing:border-box}
  body{margin:0;background:#060708;width:${width}px;height:${height}px;overflow:hidden}
</style></head><body>${svg}</body></html>`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width, height } });
await page.setContent(html, { waitUntil: "networkidle" });
await page.screenshot({ path: pngPath, type: "png", omitBackground: false });
await browser.close();

console.log(`Generated ${pngPath} (${width}x${height})`);

// Capture README screenshots with Playwright.
// Usage: npm run build && npm start (in another terminal), then:
//   node scripts/screenshots.mjs [baseUrl]
// Requires the `playwright` package and a Chromium install (npx playwright install chromium).
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://localhost:3000";
const out = new URL("../docs/screenshots/", import.meta.url);
await mkdir(out, { recursive: true });

const shots = [
  { path: "/", file: "overview.png", viewport: { width: 1280, height: 860 } },
  { path: "/financials", file: "financials.png", viewport: { width: 1280, height: 900 } },
  { path: "/valuation", file: "valuation.png", viewport: { width: 1280, height: 1100 }, scrollTo: "text=Implied value per share" },
  { path: "/pitch", file: "pitch.png", viewport: { width: 1280, height: 1000 } },
  { path: "/news", file: "mobile-news.png", viewport: { width: 390, height: 844 }, mobile: true, scheme: "dark" },
];

const browser = await chromium.launch();
for (const s of shots) {
  const page = await browser.newPage({
    viewport: s.viewport,
    deviceScaleFactor: 2,
    colorScheme: s.scheme ?? "light",
    isMobile: !!s.mobile,
    hasTouch: !!s.mobile,
  });
  await page.goto(base + s.path, { waitUntil: "networkidle", timeout: 120_000 });
  await page.waitForTimeout(1500);
  if (s.scrollTo) {
    await page.locator(s.scrollTo).first().scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, -140));
    await page.waitForTimeout(300);
  }
  await page.screenshot({ path: new URL(s.file, out).pathname });
  console.log("saved", s.file);
  await page.close();
}
await browser.close();

/**
 * Cross-browser smoke test against the built folder (file:// and http://).
 *   npx tsx scripts/e2e.ts <export.zip> [more.zip ...]
 * For each of Chromium, Firefox and WebKit: open dist/index.html, upload the zip,
 * confirm races, click every tab, and fail on any console error. Screenshots go to .scratch/shots.
 */
import { chromium, firefox, webkit, type Browser, type Page } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';

const dist = path.resolve('dist');
const zips = process.argv.slice(2);
if (!zips.length) { console.error('usage: e2e.ts <export.zip> ...'); process.exit(2); }

const MIME: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff' };
const server = http.createServer(async (req, res) => {
  const p = path.join(dist, decodeURIComponent((req.url ?? '/').split('?')[0]).replace(/^\/$/, '/index.html'));
  try { const b = await fs.readFile(p); res.writeHead(200, { 'content-type': MIME[path.extname(p)] ?? 'application/octet-stream' }); res.end(b); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise<void>((r) => server.listen(0, r));
const port = (server.address() as { port: number }).port;

await fs.mkdir('.scratch/shots', { recursive: true });
let failures = 0;

async function run(name: string, browser: Browser, url: string, zip: string) {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const page: Page = await ctx.newPage();
  const errors: string[] = [];
  const warnings: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); else if (m.type() === 'warning') warnings.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  const tag = `${name}-${url.startsWith('file') ? 'file' : 'http'}-${path.basename(zip, '.zip')}`;
  const t0 = Date.now();
  try {
    await page.goto(url);
    await page.waitForSelector('#file', { state: 'attached', timeout: 15000 });
    await page.setInputFiles('#file', zip);
    await page.waitForSelector('#race-done, #h-title', { timeout: 240000 });
    const parseMs = Date.now() - t0;
    if (await page.$('#race-done')) {
      await page.screenshot({ path: `.scratch/shots/${tag}-races.png` });
      await page.click('#race-done');
      await page.waitForSelector('#h-title', { timeout: 30000 });
    }
    const tabs = await page.$$eval('nav [role=tab]', (els) => els.map((e) => (e as HTMLElement).dataset.tab!));
    for (const t of tabs) {
      await page.click(`nav [data-tab=${t}]`);
      await page.waitForTimeout(700);
      await page.screenshot({ path: `.scratch/shots/${tag}-${t}.png`, fullPage: true });
    }
    if (name === 'chromium' && zip === zips[0] && url.startsWith('file')) { // keep one share image for eyeballing
      await page.click('nav [data-tab=overview]');
      const png = await page.evaluate(async () => new Promise<string>((res) => { const o = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { HTMLAnchorElement.prototype.click = o; res(this.href); }; (document.getElementById('share-img') as HTMLElement).click(); }));
      await fs.writeFile('.scratch/shots/share.png', Buffer.from(png.split(',')[1], 'base64'));
    }
    const title = await page.textContent('#h-title');
    const foot = (await page.textContent('#foot'))?.replace(/\s+/g, ' ').trim() ?? '';
    const parsed = /(\d[\d,]*) activity files? parsed/.exec(foot)?.[1] ?? (foot.includes('no activity files') ? 'none needed' : '0');
    const fonts = await page.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').length);
    // WebKit refuses blob: workers on file:// and Vite's inline helper falls back to a data: URL; the parse still runs.
    const blobWarn = errors.filter((e) => /Cannot load blob:null/.test(e) && parsed !== '0');
    const real = errors.filter((e) => !blobWarn.includes(e));
    const ok = real.length === 0;
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${tag}: "${title?.trim()}" · ${tabs.length} tabs · files parsed ${parsed} · parse+build ${(parseMs / 1000).toFixed(1)}s · ${fonts} fonts${blobWarn.length ? ` · ${blobWarn.length} blob-worker errors tolerated` : ''}${warnings.length ? '\n   warn: ' + warnings.slice(0, 3).join('\n   warn: ') : ''}${real.length ? '\n   ' + real.slice(0, 5).join('\n   ') : ''}`);
  } catch (e) {
    failures++;
    console.log(`FAIL ${tag}: ${(e as Error).message.split('\n')[0]}${errors.length ? '\n   ' + errors.slice(0, 5).join('\n   ') : ''}`);
    await page.screenshot({ path: `.scratch/shots/${tag}-error.png` }).catch(() => {});
  }
  await ctx.close();
}

const want = (process.env.BROWSERS ?? 'chromium,firefox,webkit').split(',');
for (const [name, type] of ([['chromium', chromium], ['firefox', firefox], ['webkit', webkit]] as const).filter(([n]) => want.includes(n))) {
  const browser = await type.launch();
  for (const zip of zips) {
    await run(name, browser, 'file://' + path.join(dist, 'index.html'), zip);
    if (zip === zips[0]) await run(name, browser, `http://localhost:${port}/`, zip);
  }
  await browser.close();
}
server.close();
console.log(failures ? `${failures} failure(s)` : 'all passed');
process.exit(failures ? 1 : 0);

#!/usr/bin/env node
// Screenshot an HTML page with headless Chrome (CDP).
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { launchChrome, openPage, setViewport, navigate, screenshotJpeg, sleep } from './lib/cdp.mjs';

const HELP = `Usage: node tools/screenshot-page.mjs <url-or-file-path> <out.jpg> [--width 1280] [--height 720] [--wait 1500] [--quality 82]

Screenshots an HTML page to JPEG using headless Chrome (no npm deps).
  <url-or-file-path>  http(s)/file URL, or a local path. A query string may follow a local path,
                      e.g. templates/x/index.html?target_url=https://samsung.com
  --width/--height    viewport in px (default 1280x720)
  --wait              ms to wait after load before capture (default 1500)
  --quality           JPEG quality 1-100 (default 82)
Set CHROME_PATH to override the Chrome executable.`;

const args = process.argv.slice(2);
const pos = []; const opt = { width: 1280, height: 720, wait: 1500, quality: 82 };
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--help' || args[i] === '-h') { console.log(HELP); process.exit(0); }
  if (args[i].startsWith('--')) opt[args[i].slice(2)] = Number(args[++i]); else pos.push(args[i]);
}
if (pos.length < 2) { console.error(HELP); process.exit(1); }

let [src, out] = pos;
if (!/^(https?|file):/i.test(src)) {
  const [p, ...q] = src.split('?');
  src = pathToFileURL(path.resolve(p)).href + (q.length ? '?' + q.join('?') : '');
}
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });

const chrome = await launchChrome();
try {
  const page = await openPage(chrome.port);
  await setViewport(page, opt.width, opt.height, 1);
  await navigate(page, src);
  await sleep(opt.wait);
  fs.writeFileSync(out, await screenshotJpeg(page, opt.quality));
  console.log(`${out} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);

} finally { await chrome.kill(); }

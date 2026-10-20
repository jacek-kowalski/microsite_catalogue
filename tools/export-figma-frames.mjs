#!/usr/bin/env node
// Render frames (crops) of a Figma SVG export to JPEG using headless Chrome (CDP). Node built-ins only.
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { launchChrome, openPage, setViewport, navigate, screenshotJpeg, evaluate, sleep, TMP_DIR } from './lib/cdp.mjs';

const HELP = `Usage: node tools/export-figma-frames.mjs <input.svg> <outDir> [options]

Renders crops of an SVG (typically a Figma export) to JPEG files <outDir>/<prefix>-01.jpg, -02.jpg, ...
Height follows the frame aspect ratio (16:9 for 1920x1080 screens).

Options:
  --prefix name        output file prefix (default: input file name without extension)
  --width 1280         output width in px (default 1280)
  --quality 82         JPEG quality 1-100 (default 82)
  --frames "x,y,w,h;x,y,w,h"  explicit crops in SVG user units (viewBox coordinates)
  --auto               detect 1920x1080 artboards (<rect width=1920 height=1080 transform=translate(x y)>),
                       dedupe, sort row-major (top->bottom, left->right), one image per frame
  --list               with --auto: only print detected frames, do not render
  (none of --frames/--auto) the whole viewBox becomes a single image

Notes:
  * Files can be 10-30 MB (base64 PNGs); they are scanned as strings, never printed.
  * If the file holds a second <svg> root after the first </svg> (malformed XML, seen in
    input/polls_and_surveys/variant1.svg) only the first document is kept; a cleaned copy is written to
    tools/.tmp/ and the tool reports whether the second root was a byte-identical duplicate.
  * Set CHROME_PATH to override the Chrome executable. Temp files live in tools/.tmp/ (gitignored).

Examples:
  node tools/export-figma-frames.mjs input/click_to_email/figma_step_1.svg templates/click-to-email/mocks --prefix step
  node tools/export-figma-frames.mjs input/polls_and_surveys/variant2.svg templates/polls-surveys/mocks --prefix variant2 --auto`;

const args = process.argv.slice(2);
const pos = []; const opt = { width: 1280, quality: 82 };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--help' || a === '-h') { console.log(HELP); process.exit(0); }
  if (a === '--auto') opt.auto = true;
  else if (a === '--list') opt.list = true;
  else if (a.startsWith('--')) opt[a.slice(2)] = args[++i];
  else pos.push(a);
}
if (pos.length < 2) { console.error(HELP); process.exit(1); }
opt.width = Number(opt.width); opt.quality = Number(opt.quality);
const [input, outDir] = pos.map((p) => path.resolve(p));
const prefix = opt.prefix || path.basename(input, path.extname(input));
fs.mkdirSync(TMP_DIR, { recursive: true });
fs.mkdirSync(outDir, { recursive: true });

let svg = fs.readFileSync(input, 'latin1'); // latin1: 1 byte/char, safe for slicing big base64 files
let svgPath = input;
const firstEnd = svg.indexOf('</svg>');
if (firstEnd >= 0) {
  const tailStart = firstEnd + 6;
  const second = svg.indexOf('<svg', tailStart);
  if (second >= 0) {
    const first = svg.slice(0, tailStart);
    const rest = svg.slice(second);
    const dup = rest.trimEnd() === first.trimEnd();
    console.log(`WARNING: second <svg> root found at char ${second} (line ${svg.slice(0, second).split('\n').length}). ` +
      `Second document is ${dup ? 'a byte-identical DUPLICATE of the first' : 'DIFFERENT content (ignored)'}; rendering the first only.`);
    svgPath = path.join(TMP_DIR, 'clean-' + path.basename(input));
    fs.writeFileSync(svgPath, first, 'latin1');
    svg = first;
  }
}

const vb = /viewBox="([\d.\s-]+)"/.exec(svg.slice(0, 2000));
const [vbx, vby, vbw, vbh] = vb ? vb[1].trim().split(/\s+/).map(Number) : [0, 0, 1920, 1080];

let frames = [];
if (opt.frames) {
  frames = String(opt.frames).split(';').filter(Boolean).map((s) => s.split(',').map(Number));
} else if (opt.auto) {
  const seen = new Map(); let m;
  const re = /<rect\b[^>]*>/g;
  while ((m = re.exec(svg))) {
    const t = m[0];
    if (!/\bwidth="1920"/.test(t) || !/\bheight="1080"/.test(t)) continue;
    const tr = /transform="translate\(\s*([-\d.]+)[ ,]+([-\d.]+)\s*\)"/.exec(t);
    if (!tr) continue; // image-fill rects with x/y are inner content, not artboards
    seen.set(tr[1] + ',' + tr[2], [Number(tr[1]), Number(tr[2]), 1920, 1080]);
  }
  if (!seen.size) { // fallback: rects with plain x/y
    const re2 = /<rect\b[^>]*>/g;
    while ((m = re2.exec(svg))) {
      const t = m[0];
      if (!/\bwidth="1920"/.test(t) || !/\bheight="1080"/.test(t)) continue;
      const x = /\bx="([-\d.]+)"/.exec(t), y = /\by="([-\d.]+)"/.exec(t);
      seen.set(`${x ? x[1] : 0},${y ? y[1] : 0}`, [x ? +x[1] : 0, y ? +y[1] : 0, 1920, 1080]);
    }
  }
  frames = [...seen.values()].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  console.log(`Auto-detected ${frames.length} frame(s):`);
  frames.forEach((f, i) => console.log(`  ${String(i + 1).padStart(2, '0')}: ${f.join(',')}`));
  if (!frames.length) { console.error('No 1920x1080 frames found'); process.exit(2); }
} else {
  frames = [[vbx, vby, vbw, vbh]];
}
if (opt.list) process.exit(0);
svg = null; // free memory

const wrapper = path.join(TMP_DIR, `wrap-${process.pid}.html`);
fs.writeFileSync(wrapper, `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#fff;overflow:hidden}
img{position:absolute;left:0;top:0;transform-origin:0 0;max-width:none}</style>
<img id="i" src="${pathToFileURL(svgPath).href}">`);

let chrome = null;
try {
  // A fresh Chrome per frame: huge multi-frame SVGs make a reused browser stall (observed after ~6 frames).
  for (let n = 0; n < frames.length; n++) {
    const [x, y, w, h] = frames[n];
    const outW = opt.width, outH = Math.round(outW * h / w);
    const file = path.join(outDir, `${prefix}-${String(n + 1).padStart(2, '0')}.jpg`);
    let ok = false;
    for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
      if (chrome) await chrome.kill();
      chrome = await launchChrome();
      const page = await openPage(chrome.port);
      try {
        await setViewport(page, Math.round(w), Math.round(h), outW / w);
        await navigate(page, pathToFileURL(wrapper).href, 120000);
        await evaluate(page, `new Promise((res, rej) => { const i = document.getElementById('i');
          (i.complete && i.naturalWidth ? Promise.resolve() : new Promise((a, b) => { i.onload = a; i.onerror = () => b(new Error('SVG failed to load')); }))
          .then(() => i.decode ? i.decode().catch(() => {}) : 0).then(() => {
            i.style.width = '${vbw}px'; i.style.height = '${vbh}px';
            i.style.transform = 'translate(${-(x - vbx)}px, ${-(y - vby)}px)'; res(1); }, rej); })`);
        await sleep(500);
        fs.writeFileSync(file, await screenshotJpeg(page, opt.quality, 60000));
        ok = true;
        console.log(`${file}  ${outW}x${outH}  ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
      } catch (e) { console.log(`frame ${n + 1} attempt ${attempt} failed: ${e.message}`); }
      finally { await page.close(); }
    }
    if (!ok) throw new Error('frame ' + (n + 1) + ' failed');
  }
} finally {
  if (chrome) await chrome.kill();
  try { fs.rmSync(wrapper); } catch {}
  if (svgPath !== input) try { fs.rmSync(svgPath); } catch {}
}

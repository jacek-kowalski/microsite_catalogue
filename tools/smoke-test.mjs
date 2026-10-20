#!/usr/bin/env node
// End-to-end smoke test of the catalogue in headless Chrome.
// Needs the site served over http (default http://localhost:8000):
//   python -m http.server 8000      (in another terminal)
//   node tools/smoke-test.mjs [baseUrl] [--shots]
// --shots saves screenshots to tools/.tmp/smoke-*.jpg for visual review.

import fs from 'node:fs';
import path from 'node:path';
import { launchChrome, openPage, sleep, TMP_DIR } from './lib/cdp.mjs';

const args = process.argv.slice(2);
const BASE = (args.find(a => !a.startsWith('--')) || 'http://localhost:8000').replace(/\/$/, '');
const SHOTS = args.includes('--shots');
let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? '  ✓' : '  ✗'} ${msg}`); if (!cond) { failures++; } };

// 1×1 red PNG used as "user upload".
const RED_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';

// Headless Chrome renderers on some managed Windows machines get killed
// after a few seconds ("Render process gone"), so every section runs in a
// fresh tab and is retried once if its tab dies.
async function withPage(chrome, fn) {
    for (let attempt = 1; attempt <= 3; attempt++) {
        const page = await openPage(chrome.port);
        let dead = false;
        const deadP = page.waitEvent('Inspector.detached', 600000).then(() => { dead = true; throw new Error('renderer crashed'); });
        deadP.catch(() => {});
        try {
            await page.send('Inspector.enable');
            await page.send('Runtime.enable');
            await page.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
            await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__errs=[];addEventListener('error',e=>__errs.push(String(e.message)));` });
            const timeout = (p) => Promise.race([p, deadP, sleep(15000).then(() => { throw new Error('CDP timeout'); })]);
            const evalJs = async (expr) => {
                const r = await timeout(page.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }));
                if (r.exceptionDetails) { throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); }
                return r.result.value;
            };
            const nav = async (url, wait = 2500) => { await timeout(page.send('Page.navigate', { url })); await sleep(wait); };
            const shot = async (name) => {
                if (!SHOTS) { return; }
                const { data } = await timeout(page.send('Page.captureScreenshot', { format: 'jpeg', quality: 75 }));
                fs.mkdirSync(TMP_DIR, { recursive: true });
                fs.writeFileSync(path.join(TMP_DIR, `smoke-${name}.jpg`), Buffer.from(data, 'base64'));
            };
            const buffered = [];
            const check = (cond, msg) => buffered.push([cond, msg]);
            await fn({ evalJs, nav, shot, check });
            buffered.forEach(([c, m]) => ok(c, m));
            return;
        } catch (e) {
            if (!dead && !/CDP timeout|renderer crashed/.test(e.message)) { ok(false, 'section threw: ' + e.message); return; }
            console.log(`  … tab died (${e.message}), retrying (${attempt}/3)`);
        } finally {
            await page.close();
        }
    }
    ok(false, 'section failed 3 times because the headless renderer kept crashing');
}

const load = (bin) => `(() => { const b = atob('${RED_PNG}'); const u8 = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u8[i] = b.charCodeAt(i); return new File([u8], 'red.png', { type: 'image/png' }); })()`;
const upload = (slotId) => `(() => { const input = document.querySelector('[data-slot="${slotId}"] input[type=file]');
    const dt = new DataTransfer(); dt.items.add(${load()}); input.files = dt.files; input.dispatchEvent(new Event('change')); })()`;
const inFrame = (expr) => `(() => { const d = document.getElementById('preview-frame').contentDocument; return ${expr}; })()`;
const externalRequests = `[...performance.getEntriesByType('resource'), ...(document.getElementById('preview-frame')?.contentWindow?.performance.getEntriesByType('resource') || [])]
    .map(e => e.name).filter(n => !n.startsWith(location.origin) && !n.startsWith('blob:') && !n.startsWith('data:'))`;

async function run() {
    const chrome = await launchChrome();
    try {
        console.log('Catalogue index');
        await withPage(chrome, async ({ evalJs, nav, shot, check }) => {
            await nav(`${BASE}/index.html`);
            const cards = await evalJs('document.querySelectorAll("#card-grid .card").length');
            check(cards >= 4, `renders ${cards} template cards`);
            const broken = await evalJs('[...document.querySelectorAll(".card img")].filter(i => !i.naturalWidth).length');
            check(broken === 0, `all card thumbnails load (${broken} broken)`);
            await shot('index');
            await evalJs(`document.querySelector('[data-category="gaming"]').click()`);
            await sleep(300);
            const badges = await evalJs('[...document.querySelectorAll("#card-grid .card .badge")].map(b => b.textContent)');
            check(badges.length > 0 && badges.every(b => b === 'Gaming'), `Gaming filter shows only gaming cards (${badges.length})`);
        });

        const { templates } = await (await fetch(`${BASE}/data/catalogue.json`)).json();
        for (const id of templates) {
            const m = await (await fetch(`${BASE}/templates/${id}/manifest.json`)).json();
            console.log(`Template ${id}`);
            await withPage(chrome, async ({ evalJs, nav, shot, check }) => {
                await nav(`${BASE}/microsite.html?id=${id}`, 3000);
                check(await evalJs('document.getElementById("tpl-name").textContent') === m.name, 'detail page shows template name');
                if (!m.interactive) {
                    // Strip thumbnails are lazy-loaded, so only the main image must be decoded.
                    check(await evalJs('document.querySelector(".gallery-main img").naturalWidth > 0'), 'main mock image loads');
                    const strip = await evalJs('document.querySelectorAll(".gallery-strip button").length');
                    check(strip === m.mocks.length, `gallery strip lists all ${m.mocks.length} mocks (${strip})`);
                    const missing = (await Promise.all(m.mocks.map(mk => fetch(`${BASE}/templates/${id}/${mk.src}`, { method: 'HEAD' }).then(r => r.ok)))).filter(x => !x).length;
                    check(missing === 0, `all mock files are served (${missing} missing)`);
                    await shot(id);
                    return;
                }
                const img = m.slots.find(s => s.type === 'image');
                if (img) {
                    await evalJs(upload(img.id));
                    await sleep(400);
                    const sel = JSON.stringify(img.targets[0].selector);
                    const applied = await evalJs(inFrame(`(() => { const el = d.querySelector(${sel}); if (!el) return false;
                        const v = el.tagName === 'IMG' ? el.getAttribute('src') : (el.querySelector('img.catalogue-injected-img')?.getAttribute('src') || el.style.backgroundImage);
                        return String(v).includes('blob:'); })()`));
                    check(applied, `upload replaces image slot "${img.id}"`);
                }
                const txt = m.slots.find(s => s.type === 'text');
                if (txt) {
                    await evalJs(`(() => { const i = document.querySelector('[data-slot="${txt.id}"] input'); i.value = 'SMOKE TEST'; i.dispatchEvent(new Event('input')); })()`);
                    await sleep(200);
                    check(await evalJs(inFrame(`d.querySelector(${JSON.stringify(txt.targets[0].selector)}).textContent`)) === 'SMOKE TEST', `text slot "${txt.id}" edits copy live`);
                }
                if (id === 'standard') {
                    // Upload video 2, select thumbnail 2 with the remote → player shows the upload.
                    await evalJs(upload('video2'));
                    await sleep(300);
                    for (const k of ['down', 'right', 'ok']) { await evalJs(`document.querySelector('#remote [data-key="${k}"]').click()`); await sleep(250); }
                    check(await evalJs(inFrame(`d.getElementById('videoPlayer').getAttribute('src').startsWith('blob:')`)), 'standard: thumbnail 2 plays the uploaded video 2 image');
                    for (const k of ['down', 'ok']) { await evalJs(`document.querySelector('#remote [data-key="${k}"]').click()`); await sleep(250); }
                    check(/Opening/.test(await evalJs(inFrame(`d.getElementById('toast').textContent`))), 'standard: OK on an app tile triggers app launch');
                }
                for (const opt of m.options || []) {
                    // Pick the first value (usually 0) and confirm the example reloads with it.
                    const v = opt.values[0];
                    await evalJs(`[...document.querySelectorAll('#option-groups [aria-label="${opt.label}"] .pill')].find(p => p.textContent === '${v}').click()`);
                    await sleep(1500);
                    const src = await evalJs(`document.getElementById('preview-frame').contentWindow.location.search`);
                    check(new URLSearchParams(src).get(opt.param) === String(v), `option "${opt.id}" = ${v} reloads example (${src})`);
                }
                if (id === 'qr-video') {
                    check(await evalJs(inFrame(`d.getElementById('stage').classList.contains('layout-none') && !!d.querySelector('#qrCode canvas')`)),
                        'qr-video: videos=0 switches to the no-video QR layout and renders a QR code');
                }
                if (id === 'standard') {
                    check(await evalJs(inFrame(`d.querySelectorAll('.app-tile').length === 0 && getComputedStyle(d.getElementById('videoArea')).display === 'none'`)),
                        'standard: videos=0 & apps=0 hides video and tiles');
                }
                if (id === 'ps-store-game') {
                    await evalJs(upload('background'));
                    await sleep(300);
                    await evalJs(`document.querySelector('#remote [data-key="right"]').click()`);
                    await sleep(900);
                    check(await evalJs(inFrame(`d.querySelector('#keyartHero').getAttribute('src').startsWith('blob:')`)), 'COD edition switch keeps uploaded key art');
                    check(await evalJs(inFrame(`!!d.querySelector('.edition-tile.is-focused:not(#editionStandard)')`)), 'remote ▶ moves focus inside the microsite');
                }
                if (id === 'click-to-email') {
                    // 3-video variant: video focused first, ▼▼ reaches the CTA, then the normal send flow.
                    await evalJs(`[...document.querySelectorAll('#option-groups .pill')].find(p => p.textContent === '3').click()`);
                    await sleep(2500);
                    check(await evalJs(inFrame(`d.getElementById('stage').classList.contains('layout-multi') && d.querySelectorAll('.thumb').length === 3 && d.getElementById('videoArea').classList.contains('is-focused')`)),
                        'click-to-email: videos=3 shows video + 3 thumbnails, video focused first');
                    for (const k of ['down', 'down']) { await evalJs(`document.querySelector('#remote [data-key="${k}"]').click()`); await sleep(250); }
                    check(await evalJs(inFrame(`d.getElementById('sendToEmailBtn').classList.contains('is-focused')`)), 'click-to-email: ▼▼ moves focus to Send to Email');
                    check(await evalJs(inFrame(`getComputedStyle(d.getElementById('ctaGroup')).display !== 'none'`)), 'host mock answers SSO → CTA visible (step 1)');
                    await evalJs(`document.querySelector('#remote [data-key="ok"]').click()`); await sleep(500);
                    await evalJs(`document.querySelector('#remote [data-key="ok"]').click()`); await sleep(2000);
                    const toast = await evalJs(inFrame(`d.getElementById('notifTitle')?.textContent || ''`));
                    check(/sent/i.test(toast), `OK → OK sends offer, toast says "${toast}"`);
                }
                await shot(id + '-' + m.examples[0].id);
                const errs = await evalJs('[...(window.__errs || []), ...(document.getElementById("preview-frame").contentWindow.__errs || [])]');
                check(errs.length === 0, `no uncaught JS errors ${errs.length ? JSON.stringify(errs) : ''}`);
                const ext = await evalJs(externalRequests);
                check(ext.length === 0, `no external network requests ${ext.length ? JSON.stringify(ext) : ''}`);
            });
            for (const ex of m.examples.slice(1)) {
                await withPage(chrome, async ({ evalJs, nav, shot, check }) => {
                    await nav(`${BASE}/microsite.html?id=${id}`, 2000);
                    await evalJs(`document.querySelector('#example-pills [data-id="${ex.id}"]').click()`);
                    await sleep(2000);
                    const present = await evalJs(inFrame(`${JSON.stringify(m.slots)}.map(s => s.targets.filter(t => !t.examples || t.examples.includes('${ex.id}')).every(t => d.querySelector(t.selector)))`));
                    check(present.every(Boolean), `example ${ex.id}: slot selectors resolve (${present.filter(Boolean).length}/${present.length})`);
                    await shot(id + '-' + ex.id);
                });
            }
        }
    } finally {
        await chrome.kill();
    }
    console.log(failures ? `\n✗ ${failures} check(s) failed` : '\n✓ all smoke checks passed');
    process.exit(failures ? 1 : 0);
}

run().catch(e => { console.error(e); process.exit(1); });

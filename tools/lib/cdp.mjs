// Minimal Chrome DevTools Protocol helper (Node built-ins only; Node 22+ for global WebSocket/fetch).
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const TOOLS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const TMP_DIR = path.join(TOOLS_DIR, '.tmp');

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].filter(Boolean);

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
    s.on('error', reject);
  });
}

/** Launch headless Chrome. Returns { port, proc, kill() }. Always call kill() in finally. */
export async function launchChrome() {
  const exe = CHROME_CANDIDATES.find((p) => fs.existsSync(p));
  if (!exe) throw new Error('Chrome not found. Set CHROME_PATH env var.');
  const port = await freePort();
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const profile = path.join(TMP_DIR, 'chrome-profile-' + port);
  const proc = spawn(exe, [
    `--remote-debugging-port=${port}`, '--headless=new', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
    '--allow-file-access-from-files', '--force-color-profile=srgb', 'about:blank',
  ], { stdio: 'ignore' });
  const kill = async () => {
    try { proc.kill(); } catch {}
    await sleep(800);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  };
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) return { port, proc, kill, version: await r.json() };
    } catch {}
    await sleep(150);
  }
  await kill();
  throw new Error('Chrome did not start');
}

/** Open a new page target and return a client { send(method, params), waitEvent(name), close() }. */
export async function openPage(port) {
  const r = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' });
  const target = await r.json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('WS error')); });
  let id = 0; const pending = new Map(); const listeners = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id); pending.delete(m.id);
      m.error ? rej(new Error(m.error.message)) : res(m.result);
    } else if (m.method) listeners.slice().forEach((l) => l(m));
  };
  const send = (method, params = {}) => new Promise((res, rej) => {
    const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params }));
  });
  const waitEvent = (name, timeout = 180000) => new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('timeout waiting ' + name)), timeout);
    const l = (m) => { if (m.method === name) { clearTimeout(t); listeners.splice(listeners.indexOf(l), 1); res(m.params); } };
    listeners.push(l);
  });
  await send('Page.enable');
  return { send, waitEvent, close: async () => { try { ws.close(); } catch {} try { await fetch(`http://127.0.0.1:${port}/json/close/${target.id}`); } catch {} } };
}

/** Evaluate an expression (awaits promises); throws on exception. */
export async function evaluate(page, expression) {
  const r = await page.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('eval failed: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
}

/** Set viewport. scale = deviceScaleFactor. */
export function setViewport(page, width, height, scale = 1) {
  return page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: false });
}

/** Navigate and wait for the load event. */
export async function navigate(page, url, timeout = 180000) {
  const loaded = page.waitEvent('Page.loadEventFired', timeout);
  await page.send('Page.navigate', { url });
  await loaded;
}

/** Capture JPEG; returns Buffer. */
export async function screenshotJpeg(page, quality = 82, timeout = 60000) {
  const r = await Promise.race([
    page.send('Page.captureScreenshot', { format: 'jpeg', quality }),
    sleep(timeout).then(() => { throw new Error('screenshot timeout'); }),
  ]);
  return Buffer.from(r.data, 'base64');
}

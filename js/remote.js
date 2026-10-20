// On-screen TV remote. Sends the same keyCodes a Tizen remote produces into
// the preview iframe, so microsites behave as on a TV (see CLAUDE.md for the
// key contract: arrows 37-40, ENTER 13, RETURN 10009, EXIT 10182).

export const KEYS = {
    up: { keyCode: 38, key: 'ArrowUp', label: '▲' },
    down: { keyCode: 40, key: 'ArrowDown', label: '▼' },
    left: { keyCode: 37, key: 'ArrowLeft', label: '◀' },
    right: { keyCode: 39, key: 'ArrowRight', label: '▶' },
    ok: { keyCode: 13, key: 'Enter', label: 'OK' },
    back: { keyCode: 10009, key: 'XF86Back', label: '↩' },
    exit: { keyCode: 10182, key: 'XF86Exit', label: 'EXIT' }
};

// Microsites listen on document 'keydown' (and some also expose
// $SAMSUNG.onKeyDown). Dispatching a real KeyboardEvent covers both paths
// without double-handling; keyCode is read-only on synthetic events, so it
// is patched in via defineProperty.
export function sendKey(iframe, name) {
    const k = KEYS[name];
    const win = iframe && iframe.contentWindow;
    if (!k || !win || !win.document) { return; }
    const ev = new win.KeyboardEvent('keydown', { key: k.key, bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'keyCode', { get: () => k.keyCode });
    Object.defineProperty(ev, 'which', { get: () => k.keyCode });
    (win.document.activeElement || win.document.body || win.document).dispatchEvent(ev);
}

export function renderRemote(container, getIframe, onKey) {
    container.className = 'remote pulse';
    container.innerHTML = `
        <span class="mic"></span>
        <div class="dpad">
            <button type="button" class="k-up" data-key="up" aria-label="Up">${KEYS.up.label}</button>
            <button type="button" class="k-left" data-key="left" aria-label="Left">${KEYS.left.label}</button>
            <button type="button" class="k-ok" data-key="ok" aria-label="OK">OK</button>
            <button type="button" class="k-right" data-key="right" aria-label="Right">${KEYS.right.label}</button>
            <button type="button" class="k-down" data-key="down" aria-label="Down">${KEYS.down.label}</button>
        </div>
        <button type="button" class="k-back" data-key="back" aria-label="Back" title="Back (RETURN)">${KEYS.back.label}</button>
        <button type="button" class="k-exit" data-key="exit" aria-label="Exit" title="Exit">EXIT</button>
        <span class="brand">SAMSUNG</span>`;
    container.addEventListener('click', e => {
        const btn = e.target.closest('button[data-key]');
        if (!btn) { return; }
        container.classList.remove('pulse');
        sendKey(getIframe(), btn.dataset.key);
        if (onKey) { onKey(btn.dataset.key); }
    });
}

// Flash the matching remote button when a physical key is pressed.
export function flashKey(container, keyCode) {
    const name = Object.keys(KEYS).find(n => KEYS[n].keyCode === keyCode ||
        (n === 'back' && keyCode === 88) || (n === 'exit' && keyCode === 45));
    const btn = name && container.querySelector(`[data-key="${name}"]`);
    if (!btn) { return; }
    container.classList.remove('pulse');
    btn.classList.add('is-pressed');
    setTimeout(() => btn.classList.remove('is-pressed'), 160);
}

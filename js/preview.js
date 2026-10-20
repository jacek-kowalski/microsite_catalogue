// Detail page: template info, example switcher, TV preview with remote,
// asset/copy editor, layout overlay and mock gallery.
//
// The example runs in a same-origin iframe, so overrides are applied
// directly to its DOM (js/slots.js). Uploaded files become blob: URLs and
// never leave the browser. Templates whose microsite needs a host
// (e.g. postMessage replies the TV ad player would send) declare
// "host": "<name>" and get js/hosts/<name>.js attached to the iframe.

import { loadTemplate } from './data.js?v=4';
import { renderChrome, icons, esc, h } from './ui.js?v=4';
import { applyOverrides, applyOne, readText, slotPresent, slotRects } from './slots.js?v=4';
import { renderRemote, flashKey } from './remote.js?v=4';
import { applyLayout } from './layout.js?v=4';

renderChrome();

// Pseudo-example: the first example rendered as a grey, asset-free layout.
const LAYOUT_ID = '__layout';
const $ = id => document.getElementById(id);

const state = {
    template: null,
    exampleId: null,
    overrides: new Map(),   // slotId -> value (blob URL / text); null = restore default
    blobUrls: new Map(),    // slotId -> blob URL to revoke
    host: null,
    detachHost: null,
    overlayTimer: null,
    options: {},            // option id -> selected value (URL param for the example)
    mockIndex: 0
};

const frame = $('preview-frame');
const screen = $('tv-screen');
const overlay = $('slot-overlay');
const remoteEl = $('remote');

function doc() {
    try { return frame.contentDocument; } catch (e) { return null; }
}

function realExampleId() {
    const t = state.template;
    return state.exampleId === LAYOUT_ID ? t.examples[0].id : state.exampleId;
}

function inLayout() {
    return state.exampleId === LAYOUT_ID;
}

function effectiveOverrides() {
    return inLayout() ? new Map() : state.overrides;
}

// ---------- iframe lifecycle ----------

function loadExample(exampleId) {
    const t = state.template;
    state.exampleId = exampleId;
    const ex = t.examples.find(e => e.id === realExampleId());
    document.querySelectorAll('#example-pills .pill').forEach(p => p.setAttribute('aria-pressed', String(p.dataset.id === exampleId)));
    if (state.detachHost) { state.detachHost(); state.detachHost = null; }
    if (state.host) { state.detachHost = state.host.attach(frame); }
    frame.src = exampleUrl(ex);
}

// Template options (manifest "options") are passed to the example as URL
// params, e.g. ?videos=2&apps=1 — the microsite reads them itself.
function exampleUrl(ex) {
    const url = new URL(ex.url, location.href);
    for (const opt of state.template.options) {
        url.searchParams.set(opt.param, state.options[opt.id]);
    }
    return url.pathname + url.search;
}

function renderOptions() {
    const t = state.template;
    const wrap = $('option-groups');
    wrap.hidden = !t.options.length;
    wrap.innerHTML = '';
    for (const opt of t.options) {
        state.options[opt.id] = opt.default ?? opt.values[0];
        const group = h(`<div class="option-group" role="group" aria-label="${esc(opt.label)}"><span class="option-label">${esc(opt.label)}</span></div>`);
        for (const v of opt.values) {
            const pill = h(`<button class="pill pill-sm" type="button" aria-pressed="${v === state.options[opt.id]}">${esc(v)}</button>`);
            pill.addEventListener('click', () => {
                if (state.options[opt.id] === v) { return; }
                state.options[opt.id] = v;
                group.querySelectorAll('.pill').forEach(p => p.setAttribute('aria-pressed', String(p === pill)));
                loadExample(state.exampleId);
            });
            group.appendChild(pill);
        }
        wrap.appendChild(group);
    }
}

frame.addEventListener('load', () => {
    const d = doc();
    if (!d) { return; }
    syncTextDefaults();
    if (inLayout()) {
        applyLayout(d, state.template.slots, realExampleId());
    } else {
        applyOverrides(d, state.template.slots, effectiveOverrides(), realExampleId());
    }
    syncSlotAvailability();
    // Some microsites swap images themselves (e.g. COD changes key art per
    // edition); re-assert the user's overrides whenever an image src changes.
    new frame.contentWindow.MutationObserver(() => {
        if (inLayout()) { return; }
        applyOverrides(d, state.template.slots, effectiveOverrides(), realExampleId());
    }).observe(d.body, { subtree: true, attributes: true, attributeFilter: ['src'] });
    d.addEventListener('keydown', e => flashKey(remoteEl, e.keyCode), true);
    d.addEventListener('focusin', () => screen.classList.add('is-focused'));
    frame.contentWindow.addEventListener('blur', () => screen.classList.remove('is-focused'));
    refreshOverlay();
});

// Clicking the TV gives the microsite keyboard focus.
screen.addEventListener('mousedown', () => {
    setTimeout(() => { frame.contentWindow && frame.contentWindow.focus(); screen.classList.add('is-focused'); }, 0);
});
window.addEventListener('focus', () => screen.classList.remove('is-focused'));

// ---------- examples ----------

function renderExamples() {
    const t = state.template;
    const wrap = $('example-pills');
    wrap.innerHTML = '';
    const items = [
        { id: LAYOUT_ID, name: 'Layout', title: 'Template layout without assets — every field labelled with its size' },
        ...t.examples.map(e => ({ id: e.id, name: e.name }))
    ];
    for (const it of items) {
        const pill = h(`<button class="pill" type="button" data-id="${esc(it.id)}" aria-pressed="false" ${it.title ? `title="${esc(it.title)}"` : ''}>${esc(it.name)}</button>`);
        pill.addEventListener('click', () => { if (state.exampleId !== it.id) { loadExample(it.id); } });
        wrap.appendChild(pill);
    }
}

// ---------- image slots ----------

function setOverride(slot, value) {
    if (value == null) { state.overrides.delete(slot.id); } else { state.overrides.set(slot.id, value); }
    // Your own assets need a real page: leave the layout view for the first example.
    if (inLayout()) {
        if (value != null) { loadExample(state.template.examples[0].id); }
        return;
    }
    const d = doc();
    if (!d) { return; }
    applyOne(d, slot, value, realExampleId());
    refreshOverlay();
}

function setImage(slot, file, zone) {
    if (!file || !file.type.startsWith('image/')) {
        zone.querySelector('.hint').textContent = 'Please choose an image file (JPG, PNG, WebP, SVG).';
        return;
    }
    const old = state.blobUrls.get(slot.id);
    if (old) { URL.revokeObjectURL(old); }
    const url = URL.createObjectURL(file);
    state.blobUrls.set(slot.id, url);
    setOverride(slot, url);
    zone.classList.add('has-file');
    zone.querySelector('.thumb').style.backgroundImage = `url("${url}")`;
    zone.querySelector('.thumb').innerHTML = '';
    zone.querySelector('.hint').textContent = file.name;
    zone.querySelector('.remove').hidden = false;
}

function clearImage(slot, zone) {
    const old = state.blobUrls.get(slot.id);
    if (old) { URL.revokeObjectURL(old); state.blobUrls.delete(slot.id); }
    setOverride(slot, null);
    zone.classList.remove('has-file');
    zone.querySelector('.thumb').style.backgroundImage = '';
    zone.querySelector('.thumb').innerHTML = icons.upload;
    zone.querySelector('.hint').textContent = slot.hint || '';
    zone.querySelector('.remove').hidden = true;
}

function renderImageSlots() {
    const list = $('image-slots');
    list.innerHTML = '';
    const slots = state.template.slots.filter(s => s.type === 'image');
    $('assets-panel').hidden = !slots.length;
    for (const slot of slots) {
        const zone = h(`
            <label class="dropzone" data-slot="${esc(slot.id)}">
                <span class="thumb">${icons.upload}</span>
                <span class="meta"><span class="name">${esc(slot.label)}</span><span class="hint" title="${esc(slot.hint || '')}">${esc(slot.hint || '')}</span></span>
                <input type="file" accept="image/*" aria-label="Upload ${esc(slot.label)}">
                <button class="remove" type="button" title="Remove" aria-label="Remove ${esc(slot.label)}" hidden>${icons.close}</button>
            </label>`);
        const input = zone.querySelector('input');
        input.addEventListener('change', () => { setImage(slot, input.files[0], zone); input.value = ''; });
        zone.querySelector('.remove').addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); clearImage(slot, zone); });
        zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('is-over'); });
        zone.addEventListener('dragleave', () => zone.classList.remove('is-over'));
        zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('is-over'); setImage(slot, e.dataTransfer.files[0], zone); });
        zone.addEventListener('mouseenter', () => highlight(slot.id, true));
        zone.addEventListener('mouseleave', () => highlight(slot.id, false));
        list.appendChild(zone);
    }
}

// ---------- text slots ----------

function renderTextSlots() {
    const list = $('text-slots');
    list.innerHTML = '';
    const slots = state.template.slots.filter(s => s.type === 'text');
    $('copy-panel').hidden = !slots.length;
    for (const slot of slots) {
        const id = 'txt-' + slot.id;
        const field = h(`
            <div class="field" data-slot="${esc(slot.id)}">
                <label for="${id}">${esc(slot.label)} ${slot.maxLength ? `<span class="count"></span>` : ''}</label>
                <input class="input" id="${id}" type="text" ${slot.maxLength ? `maxlength="${slot.maxLength}"` : ''}>
            </div>`);
        const input = field.querySelector('input');
        const count = field.querySelector('.count');
        const updateCount = () => { if (count) { count.textContent = `${input.value.length}/${slot.maxLength}`; } };
        input.addEventListener('input', () => {
            input.dataset.dirty = '1';
            setOverride(slot, input.value === '' ? null : input.value);
            updateCount();
        });
        input.addEventListener('focus', () => highlight(slot.id, true));
        input.addEventListener('blur', () => highlight(slot.id, false));
        field.updateCount = updateCount;
        list.appendChild(field);
    }
}

// Untouched text inputs show the example's current copy as their value.
function syncTextDefaults() {
    const d = doc();
    for (const slot of state.template.slots.filter(s => s.type === 'text')) {
        const field = document.querySelector(`#text-slots [data-slot="${CSS.escape(slot.id)}"]`);
        const input = field && field.querySelector('input');
        if (!input || input.dataset.dirty) { continue; }
        if (inLayout()) { continue; }
        const text = readText(d, slot, realExampleId());
        input.value = text || '';
        input.placeholder = text || '';
        field.updateCount();
    }
}

// Slots whose selectors don't exist in the loaded example are disabled.
function syncSlotAvailability() {
    const d = doc();
    for (const slot of state.template.slots) {
        const el = document.querySelector(`[data-slot="${CSS.escape(slot.id)}"]`);
        if (!el) { continue; }
        const present = slotPresent(d, slot, realExampleId());
        el.style.opacity = present ? '' : '0.45';
        el.title = present ? '' : 'Not used in this example';
        el.querySelectorAll('input').forEach(i => { i.disabled = !present; });
    }
}

// ---------- "Show layout" overlay ----------

let hotSlot = null;

function highlight(slotId, on) {
    hotSlot = on ? slotId : (hotSlot === slotId ? null : hotSlot);
    if (on && overlay.hidden) { overlay.dataset.temp = '1'; overlay.hidden = false; }
    if (!on && overlay.dataset.temp && !$('toggle-layout').checked) { overlay.hidden = true; delete overlay.dataset.temp; }
    refreshOverlay();
}

function refreshOverlay() {
    if (overlay.hidden) { return; }
    const d = doc();
    overlay.innerHTML = '';
    if (!d || !frame.contentWindow) { return; }
    const showAll = $('toggle-layout').checked;
    for (const { slot, rect } of slotRects(d, state.template.slots, realExampleId())) {
        if (!showAll && slot.id !== hotSlot) { continue; }
        const box = h(`<div class="slot-box ${slot.type === 'text' ? 'is-text' : ''} ${slot.id === hotSlot ? 'is-hot' : ''}"><span>${esc(slot.label)}</span></div>`);
        Object.assign(box.style, { left: rect.left + 'px', top: rect.top + 'px', width: rect.width + 'px', height: rect.height + 'px' });
        overlay.appendChild(box);
    }
}

$('toggle-layout').addEventListener('change', e => {
    overlay.hidden = !e.target.checked;
    delete overlay.dataset.temp;
    clearInterval(state.overlayTimer);
    if (e.target.checked) { state.overlayTimer = setInterval(refreshOverlay, 400); }
    refreshOverlay();
});

// ---------- toolbar ----------

$('btn-reset').addEventListener('click', () => {
    for (const url of state.blobUrls.values()) { URL.revokeObjectURL(url); }
    state.blobUrls.clear();
    state.overrides.clear();
    renderImageSlots();
    renderTextSlots();
    loadExample(state.exampleId);
});

// Fullscreen re-positions the existing screen element (moving an iframe in
// the DOM would reload it and lose the microsite state).
const backdrop = $('fullscreen-backdrop');
function setFullscreen(on) {
    backdrop.classList.toggle('is-open', on);
    screen.classList.toggle('is-fullscreen', on);
    if (on) { frame.contentWindow && frame.contentWindow.focus(); }
    setTimeout(refreshOverlay, 50);
}
$('btn-fullscreen').addEventListener('click', () => setFullscreen(true));
$('btn-fullscreen-close').addEventListener('click', () => setFullscreen(false));
backdrop.addEventListener('click', e => { if (e.target === backdrop) { setFullscreen(false); } });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { setFullscreen(false); } });
window.addEventListener('resize', refreshOverlay);

// ---------- tabs + mock gallery ----------

function selectTab(name) {
    const live = name === 'live';
    $('tab-live').setAttribute('aria-selected', String(live));
    $('tab-mocks').setAttribute('aria-selected', String(!live));
    $('view-live').hidden = !live;
    $('view-mocks').hidden = live;
}
$('tab-live').addEventListener('click', () => selectTab('live'));
$('tab-mocks').addEventListener('click', () => selectTab('mocks'));

function renderGallery() {
    const mocks = state.template.mocks;
    const g = $('gallery');
    if (!mocks.length) { g.innerHTML = '<div class="empty">No layout mocks for this template.</div>'; return; }
    const i = state.mockIndex;
    g.innerHTML = `
        <div class="gallery-main">
            <img src="${esc(mocks[i].url)}" alt="${esc(mocks[i].caption || '')}">
            ${mocks.length > 1 ? `<button class="gallery-nav prev" type="button" aria-label="Previous">${icons.chevronLeft}</button>
            <button class="gallery-nav next" type="button" aria-label="Next">${icons.chevronRight}</button>` : ''}
        </div>
        <div class="gallery-caption"><span class="body-bold">${esc(mocks[i].caption || '')}</span><span class="muted">${i + 1} / ${mocks.length}</span></div>
        ${mocks.length > 1 ? `<div class="gallery-strip">${mocks.map((m, j) =>
            `<button type="button" data-i="${j}" aria-current="${j === i}" title="${esc(m.caption || '')}"><img src="${esc(m.url)}" alt="" loading="lazy"></button>`).join('')}</div>` : ''}`;
    const go = j => { state.mockIndex = (j + mocks.length) % mocks.length; renderGallery(); };
    g.querySelector('.prev')?.addEventListener('click', () => go(i - 1));
    g.querySelector('.next')?.addEventListener('click', () => go(i + 1));
    g.querySelectorAll('.gallery-strip button').forEach(b => b.addEventListener('click', () => go(+b.dataset.i)));
    g.querySelector(`.gallery-strip button[data-i="${i}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

document.addEventListener('keydown', e => {
    if ($('view-mocks').hidden || state.template.mocks.length < 2) { return; }
    if (e.key === 'ArrowLeft') { state.mockIndex = (state.mockIndex - 1 + state.template.mocks.length) % state.template.mocks.length; renderGallery(); }
    if (e.key === 'ArrowRight') { state.mockIndex = (state.mockIndex + 1) % state.template.mocks.length; renderGallery(); }
});

// ---------- boot ----------

async function init() {
    const id = new URLSearchParams(location.search).get('id');
    let { template: t, category } = await loadTemplate(id);
    if (!t) {
        $('detail').innerHTML = `<div class="panel empty">Template “${esc(id)}” not found. <a href="index.html">Back to catalogue</a></div>`;
        return;
    }
    state.template = t = { ...t, options: t.options || [], slots: t.slots || [], mocks: t.mocks || [], examples: t.examples || [], features: t.features || [], remoteHints: t.remoteHints || [] };
    document.title = `${t.name} — Samsung Ads Microsites`;
    $('breadcrumb').innerHTML = `<a href="index.html">Catalogue</a><span>/</span>
        <a href="index.html?category=${encodeURIComponent(t.category)}">${esc(category ? category.name : t.category)}</a><span>/</span><span>${esc(t.name)}</span>`;
    $('tpl-name').textContent = t.name;
    $('tpl-description').textContent = t.description || t.summary || '';
    $('tpl-features').innerHTML = t.features.map(f => `<span class="chip">${esc(f)}</span>`).join('');

    $("tab-mocks").hidden = !t.mocks.length;
    $("tabs").hidden = !t.mocks.length;
    renderGallery();

    if (!t.interactive || !t.examples.length) {
        $('tabs').hidden = true;
        selectTab('mocks');
        return;
    }

    $('remote-hints').innerHTML = t.remoteHints.map(r => `<span class="chip chip-blue">${esc(r)}</span>`).join('');
    renderRemote(remoteEl, () => frame);
    if (t.host) {
        try {
            state.host = await import(`./hosts/${t.host}.js?v=4`);
        } catch (err) {
            console.error('[preview] host module failed to load', t.host, err);
        }
    }
    renderExamples();
    renderOptions();
    renderImageSlots();
    renderTextSlots();
    loadExample(LAYOUT_ID);
}

init().catch(err => {
    console.error(err);
    $('detail').innerHTML = `<div class="panel empty">Could not load this template (${esc(err.message)}).</div>`;
});

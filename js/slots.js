// Applies user overrides (uploaded images, edited copy) into the microsite
// running in the same-origin preview iframe. A slot declares one or more
// targets (CSS selector + mode); see docs/ADDING_A_TEMPLATE.md.
//
// Modes:
//   src         <img>.src = value
//   background  element.style.backgroundImage = url(value)
//   inject-img  put a child <img> covering the element (created on demand)
//   text        element.textContent = value
// Optional per-target "style" object is applied alongside an override
// (e.g. {"transform": "none"} to drop a CSS mirror). Optional
// per-target "examples" restricts it to the listed example ids.

const ORIGINAL = '__catalogueOriginal';
const INJECTED_CLASS = 'catalogue-injected-img';

function targetsFor(slot, exampleId) {
    return (slot.targets || []).filter(t => !t.examples || t.examples.includes(exampleId));
}

function query(doc, selector) {
    try {
        return Array.from(doc.querySelectorAll(selector));
    } catch (err) {
        console.warn('[slots] bad selector', selector, err);
        return [];
    }
}

function remember(el, key, value) {
    el[ORIGINAL] = el[ORIGINAL] || {};
    if (!(key in el[ORIGINAL])) { el[ORIGINAL][key] = value; }
}

function applyStyle(el, style) {
    if (!style) { return; }
    for (const [prop, val] of Object.entries(style)) {
        remember(el, 'style:' + prop, el.style.getPropertyValue(prop));
        el.style.setProperty(prop, val, 'important');
    }
}

function restore(el) {
    const orig = el[ORIGINAL];
    if (!orig) { return; }
    for (const [key, val] of Object.entries(orig)) {
        if (key === 'src') { el.src = val; }
        else if (key === 'text') { el.textContent = val; }
        else if (key === 'background') { el.style.backgroundImage = val; }
        else if (key.startsWith('style:')) { el.style.removeProperty(key.slice(6)); if (val) { el.style.setProperty(key.slice(6), val); } }
    }
    el.querySelectorAll(':scope > .' + INJECTED_CLASS).forEach(n => n.remove());
    delete el[ORIGINAL];
}

function applyTarget(doc, target, value) {
    for (const el of query(doc, target.selector)) {
        if (value == null) { restore(el); continue; }
        switch (target.mode) {
            case 'src':
                remember(el, 'src', el.getAttribute('src') || '');
                if (el.getAttribute('src') !== value) { el.setAttribute('src', value); }
                break;
            case 'background':
                remember(el, 'background', el.style.backgroundImage);
                el.style.setProperty('background-image', `url("${value}")`, 'important');
                break;
            case 'inject-img': {
                remember(el, 'inject', true);
                let img = el.querySelector(':scope > .' + INJECTED_CLASS);
                if (!img) {
                    img = doc.createElement('img');
                    img.className = INJECTED_CLASS;
                    img.alt = '';
                    img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;z-index:5;border-radius:inherit;';
                    if (doc.defaultView.getComputedStyle(el).position === 'static') { el.style.position = 'relative'; }
                    el.appendChild(img);
                }
                if (img.getAttribute('src') !== value) { img.setAttribute('src', value); }
                break;
            }
            case 'text':
            default:
                remember(el, 'text', el.textContent);
                el.textContent = value;
                break;
        }
        applyStyle(el, target.style);
    }
}

// overrides: Map<slotId, string|null>
export function applyOverrides(doc, slots, overrides, exampleId) {
    if (!doc) { return; }
    for (const slot of slots) {
        if (!overrides.has(slot.id)) { continue; }
        const value = overrides.get(slot.id);
        for (const target of targetsFor(slot, exampleId)) { applyTarget(doc, target, value); }
    }
}

export function applyOne(doc, slot, value, exampleId) {
    if (!doc) { return; }
    for (const target of targetsFor(slot, exampleId)) { applyTarget(doc, target, value); }
}

// Reads the current default text of a text slot in the loaded example.
export function readText(doc, slot, exampleId) {
    for (const target of targetsFor(slot, exampleId)) {
        const el = query(doc, target.selector)[0];
        if (el) { return (el[ORIGINAL] && el[ORIGINAL].text != null ? el[ORIGINAL].text : el.textContent).trim(); }
    }
    return null;
}

// Whether a slot has any target present in the loaded example.
export function slotPresent(doc, slot, exampleId) {
    return targetsFor(slot, exampleId).some(t => query(doc, t.selector).length > 0);
}

// Rectangles (in iframe CSS px) of visible slot elements, for "Show layout".
export function slotRects(doc, slots, exampleId) {
    const out = [];
    for (const slot of slots) {
        for (const target of targetsFor(slot, exampleId)) {
            for (const el of query(doc, target.selector)) {
                const r = el.getBoundingClientRect();
                if (r.width < 2 || r.height < 2) { continue; }
                const cs = doc.defaultView.getComputedStyle(el);
                if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) === 0) { continue; }
                out.push({ slot, rect: r });
                break;
            }
        }
    }
    return out;
}

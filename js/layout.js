// "Layout" mode: renders a live microsite as a flat grey wireframe (the
// style of input/standard/image.png) — no advertiser assets, every slot
// labelled with its name and recommended size. Built from the manifest's
// slots, so it works for every live template without per-template mocks.
//
// The background/full-screen slot is recognised by id "background"; it turns
// the whole stage grey and puts its label in the top-left corner.
// Elements matching the manifest's "layoutKeep" selectors (e.g. a fixed CTA
// button) keep their real styling instead of fading into the grey.
// Optional slot.layoutLabel / slot.layoutSize override the label and size
// shown here (e.g. "Thumbnail" instead of the upload field's name).
// Slots of type "layout" exist only for this view (e.g. a generated QR code):
// they're labelled here but get no upload/edit field.

const STYLE_ID = 'catalogue-layout-style';
const BOX_CLASS = 'catalogue-layout-box';

// "3840×2160 JPG · subject on the right" → "3840 × 2160 px"
export function sizeOf(slot) {
    const m = (slot.hint || '').match(/(\d{2,4})\s*[×x]\s*(\d{2,4})/);
    return m ? `${m[1]} × ${m[2]} px` : '';
}

function textLabel(slot) {
    return `[ ${slot.label} ]`;
}

const CSS = `
    html, body { background: #646464 !important; }
    /* hide everything visual that isn't a labelled slot */
    img:not(.${BOX_CLASS}-keep), video, canvas, picture, svg image { visibility: hidden !important; }
    * { background-image: none !important; text-shadow: none !important; }
    #stage, .microsite, body > div:first-child { background-color: #646464 !important; }
    .${BOX_CLASS} {
        position: absolute; inset: 0; z-index: 50;
        background: #dadada; color: #000;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        text-align: center; border-radius: inherit; overflow: hidden;
        font-family: SamsungOne, Arial, Helvetica, sans-serif; line-height: 1.15;
        box-shadow: 0 2px 4px rgba(0,0,0,.25);
        pointer-events: none;
    }
    .${BOX_CLASS} b { font-weight: 700; }
    .${BOX_CLASS}.is-bg { background: transparent; box-shadow: none; color: #fff; align-items: flex-end; justify-content: flex-start; padding: 28px 0 0 88px; align-items: flex-start; text-align: left; z-index: 0; }
    /* non-slot copy and chrome fade back so the labelled slots read first */
    #stage *:not([data-catalogue-layout-keep]), .microsite *:not([data-catalogue-layout-keep]) { color: rgba(255,255,255,.35) !important; border-color: rgba(255,255,255,.2) !important; background-color: transparent !important; box-shadow: none !important; }
    [data-catalogue-layout-slot]:not(#x) { opacity: 1 !important; visibility: visible !important; }
    [data-catalogue-layout-text] { color: #e6e6e6 !important; -webkit-text-fill-color: #e6e6e6 !important; }
    /* boxes must beat the "#stage *" fade above: repeat an id-level selector */
    html body div.${BOX_CLASS}, html body div.${BOX_CLASS} * { color: #000 !important; }
    html body div.${BOX_CLASS}:not(#x) { background-color: #dadada !important; box-shadow: 0 2px 4px rgba(0,0,0,.25) !important; visibility: visible !important; opacity: 1 !important; }
    html body div.${BOX_CLASS}.is-bg:not(#x) { background-color: transparent !important; box-shadow: none !important; }
    html body div.${BOX_CLASS}.is-bg:not(#x), html body div.${BOX_CLASS}.is-bg:not(#x) * { color: #fff !important; }
    html body div.${BOX_CLASS}:not(#x) * { color: inherit !important; }
`;

function targetsFor(slot, exampleId) {
    return (slot.targets || []).filter(t => !t.examples || t.examples.includes(exampleId));
}

function q(doc, sel) {
    try { return Array.from(doc.querySelectorAll(sel)); } catch (e) { return []; }
}

// Put a labelled grey box over an element. <img> can't hold children, so the
// box goes into its parent, positioned over the image's own box.
function boxFor(doc, el, slot, isBg) {
    const host = el.tagName === 'IMG' || el.tagName === 'VIDEO' ? el.parentElement : el;
    if (!host || host.querySelector(`:scope > .${BOX_CLASS}[data-slot="${slot.id}"]`)) { return; }
    const box = doc.createElement('div');
    box.className = BOX_CLASS + (isBg ? ' is-bg' : '');
    box.dataset.slot = slot.id;
    if (host !== el) {
        // cover just the image inside its parent
        Object.assign(box.style, {
            inset: 'auto',
            left: el.offsetLeft + 'px', top: el.offsetTop + 'px',
            width: el.offsetWidth + 'px', height: el.offsetHeight + 'px'
        });
    }
    const w = isBg ? 1920 : (host === el ? el.offsetWidth : el.offsetWidth);
    const big = isBg ? 26 : Math.max(14, Math.min(48, Math.round(w / 9)));
    // Inline !important colour: beats the page-wide fade rule (#stage *) which outranks any class selector.
    const ink = isBg ? '#fff' : '#000';
    box.style.setProperty('color', ink, 'important');
    box.innerHTML = `<b style="font-size:${big}px;color:${ink} !important">${slot.layoutLabel || slot.label}</b><span style="font-size:${Math.round(big * 0.85)}px;color:${ink} !important">${slot.layoutSize || sizeOf(slot)}</span>`;
    if (doc.defaultView.getComputedStyle(host).position === 'static') { host.style.position = 'relative'; }
    host.setAttribute('data-catalogue-layout-slot', '');
    host.appendChild(box);
}

export function applyLayout(doc, slots, exampleId, keep = []) {
    if (!doc || !doc.head) { return; }
    for (const sel of keep) {
        for (const el of q(doc, sel)) {
            [el, ...el.querySelectorAll('*')].forEach(n => n.setAttribute('data-catalogue-layout-keep', ''));
        }
    }
    if (!doc.getElementById(STYLE_ID)) {
        const style = doc.createElement('style');
        style.id = STYLE_ID;
        style.textContent = CSS;
        doc.head.appendChild(style);
    }
    for (const slot of slots) {
        for (const t of targetsFor(slot, exampleId)) {
            for (const el of q(doc, t.selector)) {
                if (slot.type === 'text') {
                    if (!el.hasAttribute('data-catalogue-layout-text')) {
                        el.setAttribute('data-catalogue-layout-text', el.textContent);
                        el.textContent = textLabel(slot);
                    }
                } else if (slot.id === 'background') {
                    const stage = doc.getElementById('stage') || doc.querySelector('.microsite') || doc.body;
                    boxFor(doc, stage, slot, true);
                } else {
                    boxFor(doc, el, slot, false);
                }
            }
        }
    }
}

export function removeLayout(doc) {
    if (!doc) { return; }
    doc.getElementById(STYLE_ID)?.remove();
    doc.querySelectorAll('.' + BOX_CLASS).forEach(b => b.remove());
    doc.querySelectorAll('[data-catalogue-layout-text]').forEach(el => {
        el.textContent = el.getAttribute('data-catalogue-layout-text');
        el.removeAttribute('data-catalogue-layout-text');
    });
}

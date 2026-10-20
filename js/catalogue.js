// Catalogue (index) page: category tiles + template cards.
// The selected category is kept in ?category= so links are shareable.

import { loadCatalogue } from './data.js?v=8';
import { renderChrome, icons, esc, h } from './ui.js?v=8';
import { applyLayout } from './layout.js?v=8';

renderChrome();

const tilesEl = document.getElementById('category-tiles');
const gridEl = document.getElementById('card-grid');

function currentCategory() {
    return new URLSearchParams(location.search).get('category') || 'all';
}

function renderTiles(categories, templates, active) {
    const all = [{ id: 'all', name: 'All' }, ...categories];
    tilesEl.innerHTML = '';
    for (const c of all) {
        const count = c.id === 'all' ? templates.length : templates.filter(t => t.category === c.id).length;
        const tile = h(`
            <button class="type-tile" type="button" aria-pressed="${c.id === active}" data-category="${esc(c.id)}">
                ${icons[c.id] || icons.general}
                <span>${esc(c.name)}</span>
                <span class="count">${count} template${count === 1 ? '' : 's'}</span>
            </button>`);
        tile.addEventListener('click', () => {
            const url = new URL(location.href);
            if (c.id === 'all') { url.searchParams.delete('category'); } else { url.searchParams.set('category', c.id); }
            history.replaceState(null, '', url);
            render();
        });
        tilesEl.appendChild(tile);
    }
}

function renderCards(categories, templates, active) {
    const list = active === 'all' ? templates : templates.filter(t => t.category === active);
    gridEl.innerHTML = '';
    if (!list.length) {
        gridEl.appendChild(h('<div class="panel empty" style="grid-column:1/-1">No templates in this category yet.</div>'));
        return;
    }
    for (const t of list) {
        const cat = categories.find(c => c.id === t.category);
        const kind = t.interactive
            ? `${t.examples.length} example${t.examples.length === 1 ? '' : 's'} · live preview`
            : `${t.mocks.length} mock screen${t.mocks.length === 1 ? '' : 's'}`;
        gridEl.appendChild(h(`
            <a class="card" href="microsite.html?id=${encodeURIComponent(t.id)}">
                <div class="card-media">
                    ${t.interactive && t.examples.length
                        ? `<iframe class="card-layout" tabindex="-1" aria-hidden="true" data-template="${esc(t.id)}" data-src="${esc(t.examples[0].url)}"></iframe>`
                        : (t.thumbnailUrl ? `<img src="${esc(t.thumbnailUrl)}" alt="" loading="lazy" onerror="this.remove()">` : '')}
                    <span class="badge">${esc(cat ? cat.name : t.category)}</span>
                </div>
                <div class="card-body">
                    <h3 class="h3">${esc(t.name)}</h3>
                    <div class="small muted">${esc(t.summary)}</div>
                    <div class="caption muted">${esc(kind)}</div>
                    <div class="chips">${t.features.map(f => `<span class="chip">${esc(f)}</span>`).join('')}</div>
                </div>
            </a>`));
    }
}

// Cards show the template as a grey labelled layout (no advertiser assets),
// rendered from the live microsite in a small, non-interactive iframe.
// Templates with a host mock get it here too, so they reach their main
// screen (click-to-email only shows its CTA once the "TV" replies).
const hostModules = {};

async function wireLayoutCards(templates) {
    for (const frame of gridEl.querySelectorAll('iframe.card-layout')) {
        const t = templates.find(x => x.id === frame.dataset.template);
        if (!t) { continue; }
        if (t.host) {
            try {
                hostModules[t.host] = hostModules[t.host] || await import(`./hosts/${t.host}.js?v=8`);
                hostModules[t.host].attach(frame);
            } catch (err) {
                console.error('[catalogue] host module failed', t.host, err);
            }
        }
        const layout = () => applyLayout(frame.contentDocument, t.slots || [], t.examples[0].id, t.layoutKeep || []);
        // The frame stays invisible (grey card behind it) until the layout has
        // been applied, so the sample assets never flash. Microsites that build
        // their DOM after load, or wait for a host reply, get more passes
        // before the frame is revealed.
        frame.addEventListener('load', () => {
            if (!frame.contentDocument) { return; }
            layout();
            setTimeout(layout, 600);
            setTimeout(() => { layout(); frame.classList.add('is-ready'); }, 1200);
        });
        // a host attached after the iframe started loading must be in place before its first message
        frame.src = frame.dataset.src;
    }
}

async function render() {
    try {
        const { categories, templates } = await loadCatalogue();
        const active = currentCategory();
        renderTiles(categories, templates, active);
        renderCards(categories, templates, active);
        wireLayoutCards(templates);
    } catch (err) {
        console.error(err);
        gridEl.innerHTML = `<div class="panel empty" style="grid-column:1/-1">Could not load the catalogue (${esc(err.message)}).<br>
            Serve the folder over http, e.g. <code>python -m http.server 8000</code>.</div>`;
    }
}

render();

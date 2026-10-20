// Catalogue data access. All content lives in static JSON:
//   data/catalogue.json            — category list + ordered template ids
//   templates/<id>/manifest.json   — one per template (schema: docs/ADDING_A_TEMPLATE.md)
// Paths inside a manifest are relative to its template folder; they are
// resolved here so the rest of the UI only ever sees site-relative URLs.

let cache = null;

export function templateBase(id) {
    return `templates/${id}/`;
}

function resolveManifest(m) {
    const base = templateBase(m.id);
    return {
        ...m,
        base,
        thumbnailUrl: m.thumbnail ? base + m.thumbnail : null,
        examples: (m.examples || []).map(ex => ({ ...ex, url: base + ex.entry + (ex.query || '') })),
        options: m.options || [],
        mocks: (m.mocks || []).map(mk => ({ ...mk, url: base + mk.src })),
        slots: m.slots || [],
        features: m.features || [],
        remoteHints: m.remoteHints || []
    };
}

async function getJson(url) {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) { throw new Error(`${url}: HTTP ${res.status}`); }
    return res.json();
}

export async function loadCatalogue() {
    if (cache) { return cache; }
    const index = await getJson('data/catalogue.json');
    const templates = await Promise.all(index.templates.map(async id => {
        try {
            return resolveManifest(await getJson(templateBase(id) + 'manifest.json'));
        } catch (err) {
            console.error('[catalogue] skipping template', id, err);
            return null;
        }
    }));
    cache = { categories: index.categories, templates: templates.filter(Boolean) };
    return cache;
}

export async function loadTemplate(id) {
    const { categories, templates } = await loadCatalogue();
    const template = templates.find(t => t.id === id) || null;
    const category = template ? categories.find(c => c.id === template.category) : null;
    return { template, category };
}

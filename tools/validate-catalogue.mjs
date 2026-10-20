#!/usr/bin/env node
// Validates data/catalogue.json and every templates/<id>/manifest.json:
// schema, unique ids, known categories, referenced files exist, and (static
// check) every slot selector appears plausible in each example's HTML.
// Usage: node tools/validate-catalogue.mjs
// Exit code 1 on errors; warnings don't fail.

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const warnings = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);
const warn = (where, msg) => warnings.push(`${where}: ${msg}`);

const SLOT_TYPES = ['image', 'text', 'layout'];   // layout = labelled in Layout view only, not editable
const MODES = { image: ['src', 'background', 'inject-img'], text: ['text'], layout: ['src', 'layout'] };
const HOSTS_DIR = join(root, 'js', 'hosts');

function readJson(path, where) {
    try {
        return JSON.parse(readFileSync(path, 'utf8'));
    } catch (e) {
        err(where, `cannot read/parse ${path}: ${e.message}`);
        return null;
    }
}

// Rough static check: does the selector's last simple part (#id / .class /
// tag) occur in the HTML source? Elements created by JS at runtime will
// warn here; verify those in the browser with "Show layout".
function selectorLooksPresent(html, selector) {
    const last = selector.trim().split(/[\s>+~]+/).pop().replace(/:.*$/, '');
    const id = last.match(/#([\w-]+)/);
    if (id) { return new RegExp(`id=["']${id[1]}["']`).test(html); }
    const cls = last.match(/\.([\w-]+)/);
    if (cls) { return new RegExp(`class=["'][^"']*\\b${cls[1]}\\b`).test(html); }
    return new RegExp(`<${last}[\\s>]`, 'i').test(html);
}

const index = readJson(join(root, 'data', 'catalogue.json'), 'data/catalogue.json');
if (index) {
    const catIds = new Set((index.categories || []).map(c => c.id));
    if (!catIds.size) { err('data/catalogue.json', 'no categories'); }
    const seen = new Set();
    for (const id of index.templates || []) {
        const where = `templates/${id}`;
        if (seen.has(id)) { err('data/catalogue.json', `duplicate template id "${id}"`); }
        seen.add(id);
        const dir = join(root, 'templates', id);
        const m = readJson(join(dir, 'manifest.json'), where);
        if (!m) { continue; }

        if (m.id !== id) { err(where, `manifest id "${m.id}" doesn't match folder/catalogue id "${id}"`); }
        for (const k of ['name', 'category', 'summary']) { if (!m[k]) { err(where, `missing "${k}"`); } }
        if (m.category && !catIds.has(m.category)) { err(where, `unknown category "${m.category}" (known: ${[...catIds].join(', ')})`); }
        if (m.thumbnail && !existsSync(join(dir, m.thumbnail))) { err(where, `thumbnail not found: ${m.thumbnail}`); }
        if (!m.thumbnail) { warn(where, 'no thumbnail — card will show a grey box'); }
        if (m.host && !existsSync(join(HOSTS_DIR, `${m.host}.js`))) { err(where, `host module js/hosts/${m.host}.js not found`); }

        const examples = m.examples || [];
        if (m.interactive && !examples.length) { err(where, 'interactive template needs at least one example'); }
        if (!m.interactive && !(m.mocks || []).length) { err(where, 'non-interactive template needs mocks'); }
        const exIds = new Set();
        const htmlById = {};
        for (const ex of examples) {
            if (!ex.id || !ex.name || !ex.entry) { err(where, `example missing id/name/entry: ${JSON.stringify(ex)}`); continue; }
            if (exIds.has(ex.id)) { err(where, `duplicate example id "${ex.id}"`); }
            exIds.add(ex.id);
            if (ex.query && !ex.query.startsWith('?')) { err(where, `example "${ex.id}" query must start with "?"`); }
            const p = join(dir, ex.entry);
            if (!existsSync(p)) { err(where, `example entry not found: ${ex.entry}`); continue; }
            htmlById[ex.id] = readFileSync(p, 'utf8');
        }
        for (const o of m.options || []) {
            const ow = `${where} option "${o.id}"`;
            if (!o.id || !o.label || !o.param) { err(ow, 'missing id/label/param'); }
            if (!Array.isArray(o.values) || !o.values.length) { err(ow, '"values" must be a non-empty array'); }
            else if (o.default !== undefined && !o.values.includes(o.default)) { err(ow, `default ${o.default} not in values`); }
        }
        for (const mk of m.mocks || []) {
            if (!mk.src || !existsSync(join(dir, mk.src))) { err(where, `mock not found: ${mk.src}`); }
        }

        const slotIds = new Set();
        for (const s of m.slots || []) {
            const sw = `${where} slot "${s.id}"`;
            if (!s.id || !s.label) { err(sw, 'missing id/label'); }
            if (slotIds.has(s.id)) { err(sw, 'duplicate slot id'); }
            slotIds.add(s.id);
            if (!SLOT_TYPES.includes(s.type)) { err(sw, `type must be one of ${SLOT_TYPES.join('/')}`); continue; }
            if (s.type === 'image' && !s.hint) { warn(sw, 'image slot without "hint" (recommended size/format)'); }
            if (!(s.targets || []).length) { err(sw, 'no targets'); continue; }
            for (const t of s.targets) {
                if (!t.selector) { err(sw, 'target without selector'); continue; }
                const mode = t.mode || (s.type === 'text' ? 'text' : s.type === 'layout' ? 'layout' : 'src');
                if (!MODES[s.type].includes(mode)) { err(sw, `mode "${mode}" not valid for ${s.type} (use ${MODES[s.type].join('/')})`); }
                for (const exId of t.examples || []) { if (!exIds.has(exId)) { err(sw, `target restricted to unknown example "${exId}"`); } }
                const applies = (t.examples && t.examples.length) ? t.examples : Object.keys(htmlById);
                for (const exId of applies) {
                    if (htmlById[exId] && !selectorLooksPresent(htmlById[exId], t.selector)) {
                        warn(sw, `selector "${t.selector}" not found in source of example "${exId}" (OK if created by JS — check in browser)`);
                    }
                }
            }
        }
    }
}

for (const w of warnings) { console.log('  warn ', w); }
for (const e of errors) { console.log('  ERROR', e); }
console.log(errors.length ? `\n✗ ${errors.length} error(s), ${warnings.length} warning(s)` : `✓ catalogue valid (${warnings.length} warning(s))`);
process.exit(errors.length ? 1 : 0);

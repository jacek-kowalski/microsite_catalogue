// Shared page chrome (header/footer), icons and tiny DOM helpers.

export const icons = {
    all: '<svg viewBox="0 0 56 56" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="6" y="6" width="18" height="18" rx="4"/><rect x="32" y="6" width="18" height="18" rx="4"/><rect x="6" y="32" width="18" height="18" rx="4"/><rect x="32" y="32" width="18" height="18" rx="4"/></svg>',
    general: '<svg viewBox="0 0 56 56" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="4" y="8" width="48" height="32" rx="4"/><path d="M20 48h16M28 40v8"/><path d="M14 18h14M14 25h10" stroke-linecap="round"/><rect x="34" y="16" width="10" height="14" rx="2"/></svg>',
    gaming: '<svg viewBox="0 0 56 56" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M16 18h24a10 10 0 0 1 10 10v2a9 9 0 0 1-16 5.5L32 33h-8l-2 2.5A9 9 0 0 1 6 30v-2a10 10 0 0 1 10-10Z"/><path d="M15 24v8M11 28h8" stroke-linecap="round"/><circle cx="38" cy="25" r="1.8" fill="currentColor"/><circle cx="42" cy="30" r="1.8" fill="currentColor"/></svg>',
    upload: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M10 13V3M6 7l4-4 4 4M3 13v3a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    close: '<svg width="14" height="14" viewBox="0 0 14 14" stroke="currentColor" stroke-width="1.8"><path d="M2 2l10 10M12 2 2 12" stroke-linecap="round"/></svg>',
    chevronLeft: '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 3 5 9l6 6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    chevronRight: '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2"><path d="m7 3 6 6-6 6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    expand: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M1 5V1h4M15 5V1h-4M1 11v4h4M15 11v4h-4" stroke-linecap="round"/></svg>',
    reset: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M2.5 8a5.5 5.5 0 1 0 1.6-3.9M2 2v3h3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    external: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M10 1.5h4.5V6M14.5 1.5 8 8M7 2.5H2.5v11h11V9" stroke-linecap="round" stroke-linejoin="round"/></svg>'
};

export function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function h(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
}

export function renderChrome() {
    const header = document.getElementById('site-header');
    if (header) {
        header.className = 'site-header';
        header.innerHTML = `
            <div class="header-side"><a class="header-title" href="index.html">Microsite Catalogue</a></div>
            <a href="index.html" aria-label="Samsung Ads — catalogue home"><img class="logo" src="assets/brand/samsung-ads-logo.svg" alt="Samsung Ads"></a>
            <div class="header-side"><a class="header-title" href="https://preview.samsungads.com/" target="_blank" rel="noopener">Creative Preview ↗</a></div>`;
    }
    const footer = document.getElementById('site-footer');
    if (footer) {
        footer.className = 'site-footer';
        footer.innerHTML = `
            <a href="https://viewer.mediafly.com/samsung1022_share/s/35f7de" target="_blank" rel="noopener">Creative Ads Specification ${icons.external}</a>
            <div>© ${new Date().getFullYear()} Samsung Electronics, Inc. All rights reserved.</div>`;
    }
}

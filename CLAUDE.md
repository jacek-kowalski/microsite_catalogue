# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Intro
I am a technical product manager, building a new client-facing service for major Smart TV advertising publisher - Samsung Ads. Company is an AdTech business selling ads displayed on Samsung Smart TVs. Service i want to build is a client-facing catalog of microsites available to buy. Microsite is a full-screen smart-tv optimised website, rendered on tv screen in a way it mimicks TV interface with simple TV remote controls. Microsites are interactive ads optimised for viewing on Smart TV screen and remote inputs.

Your goal is to build a microsite catalogue service using reference materials. Folder /input contains several designs of microsites. Some in form of .html page, some as .css and .svg mocks. The catalogue design language should follow the one implemented on https://preview.samsungads.com/.

# User stories:

As an advertisers media team employee i want to browse available in Samsung Ads microsites, see their mocks (microsite template layouts) as well as examples of execution (layout filled with mocks).

As an advertisers media team employee i want microsites to browse to be grouped by categories: General, Gaming

As a Samsung Ads PM i want to be able to add new microsite templates based on figma designs easily with help of Claude or other LLM agent.

As a Engineering Manager i want microsite catalogue to be static HTML website, no database or backend.

As a Samsung Ads PM i want catalogue to contain a preview tool where users could add their own assets like background or mock video (image in place where video would be in real microsite)

As an Engineering Manager i want to build a POC first, simple solution, minimal engineering everhead.

# Ways of working
Delegate easier tasks to Sonnet 5.5 agent. But make sure agent receives precise instructions on what to do, what is the purpose of the task, and how to execute task.

# Commands
Static site: no build step and no npm dependencies. It must be served over http, because the preview reaches into a same-origin iframe.
```bash
python -m http.server 8000                 # then open http://localhost:8000
node tools/validate-catalogue.mjs          # manifests: schema, files, selectors (run after any template change)
node tools/smoke-test.mjs [baseUrl] --shots   # headless-Chrome end-to-end checks; screenshots → tools/.tmp/smoke-*.jpg
node tools/export-figma-frames.mjs <svg> <outDir> --prefix x [--auto]   # Figma SVG → JPEG mocks
node tools/screenshot-page.mjs <url> <out.jpg>                          # page → JPEG (thumbnails)
```
- The tools use Chrome over the DevTools protocol (`tools/lib/cdp.mjs`).
- On this machine, headless Chrome tab processes are killed after a few seconds ("Render process gone"). The smoke test therefore runs each section in a fresh tab and retries. Keep that pattern in any new browser tooling.

# Architecture
- **Two pages:**
  - `index.html` with `js/catalogue.js`: category tiles and the card grid.
  - `microsite.html?id=<template>` with `js/preview.js`: the detail page and preview tool.
- **No-code templates:** every template is a folder `templates/<id>/` with a `manifest.json`, listed in `data/catalogue.json`. Adding a template never requires JS changes; see `docs/ADDING_A_TEMPLATE.md` for the schema and workflow.
- **Preview tool:**
  - Loads an example microsite into a same-origin `<iframe>` inside a TV mockup.
  - `js/slots.js` applies the user's overrides directly to the iframe DOM, using the manifest's `slots[].targets` (CSS selector + mode `src`/`background`/`inject-img`/`text`).
  - Uploads become `blob:` URLs; nothing leaves the browser and nothing persists.
  - A MutationObserver re-applies overrides whenever the microsite swaps an image itself (COD swaps its key art per edition).
- **Remote:** `js/remote.js` dispatches Tizen keyCodes into the iframe.
- **Host mocks:** `js/hosts/<name>.js` play the TV ad player's postMessage role. A manifest opts in with `"host"`; click-to-email needs it to get past step 0.
- **Pseudo-templates:** the "Blank template" pill is not a file. It is the first example with every image slot replaced by a generated placeholder.
- **Styling:** `css/tokens.css` holds the design tokens taken from preview.samsungads.com: SamsungOne/SamsungSharpSans in `assets/fonts/`, black 64px header, #f2f2f2 page, white radius-16 panels, black pill buttons, pink #d939b2 focus colour. `css/app.css` holds the components. The site is desktop only (min-width 1200px).
- **Examples:** each one under `templates/*/examples/` is a copy of an `input/` microsite, patched only where marked `catalogue patch:` (offline, no trackers, centred scaling, video placeholder).

# Reference materials (`input/`)
Treat `input/` as read-only source material. There are two kinds:

- **Finished HTML microsites** (self-contained, each with its own `assets/`): `call_of_duty/index.html`, `gta6/gta6.html` (Gaming: PS Store style pages), `click_to_email/microsite/click2email_demo.html`, `qr_microsite/microsite_with_qr-1214.html` (General). `qr_microsite` is ~146 KB because it inlines a QR library.
- **Figma exports (mocks only, no HTML)**: `click_to_email/figma_step_{1,2,3}.{svg,css}` and `polls_and_surveys/variant{1,2}.svg`. The CSS files are raw Figma frame dumps (canvas coordinates and sizes), not usable stylesheets. The `polls_and_surveys` SVGs are 10–27 MB with embedded base64 images. Don't read them whole; grep or sample them instead.

## Microsite conventions shared by the HTML references
New templates should follow these:
- Authored on a fixed **1920×1080 `#stage`**, scaled to the real screen with a JS `transform: scale` (`scaleStage()`). `<meta name="viewport" content="width=1920, height=1080">`.
- Target is **Tizen (Chromium M130)**. Code is ES5-style inside an IIFE with `'use strict'`.
- **Remote key contract**: a `KeyCodes` map with ENTER `[13, 29443]`, RETURN `[10009, 88]`, EXIT `[10182, 45]`, arrows 37–40 (UP/DOWN also 29460/29461). Keys 88 and 45 let you test RETURN/EXIT on a desktop keyboard.
- **Host integration**: expose `window.$SAMSUNG.onLoad`, `.onKeyDown`, `.closeMicrosite`. On Tizen (`/tizen/i` UA check), post `{"registerKey":"Return"}` to the parent about 2 s after load, and post `{"close":""}` to close.
- Focus is managed manually: the focused element gets an `.is-focused` class (focus ring), with row/index state handled in JS rather than through DOM focus.
- QR microsites read URL params (`qr_url`/`target_url`, `qr_url_2`, `adid`, `direct_qr`). These are documented in the comments in `call_of_duty/index.html`.

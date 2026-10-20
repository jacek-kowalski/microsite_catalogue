# Adding a microsite template

Written for an LLM agent (or a person) turning a Figma design and/or a finished microsite into a catalogue entry. A template is just a folder with a `manifest.json`; no catalogue code changes are needed.

## 1. Gather inputs
Put the source material in `input/<name>/` (read-only reference; never edit it afterwards):
- **Figma export**: SVG per screen (or one board SVG with many 1920×1080 frames). The PM's `.css` "Copy as CSS" dumps are only useful for layer names.
- **Finished microsite** (optional): a self-contained HTML file plus an `assets/` folder.

## 2. Create the folder
```
templates/<id>/                    id = kebab-case, unique
  manifest.json
  thumb.jpg                        640px wide, 16:9 — card image
  mocks/*.jpg                      layout screens (from Figma)
  examples/<example-id>/index.html + assets/   (only for live templates)
```

## 3. Export mocks and the thumbnail
```bash
# one image per SVG (single 1920×1080 screen)
node tools/export-figma-frames.mjs input/<name>/step_1.svg templates/<id>/mocks --prefix step-1
# a Figma board with many screens: auto-detect 1920×1080 frames
node tools/export-figma-frames.mjs input/<name>/board.svg templates/<id>/mocks --prefix variant1 --auto
# thumbnail from a mock or from a live example page (serve the site first)
node tools/export-figma-frames.mjs input/<name>/step_1.svg templates/<id> --prefix thumb --width 640
node tools/screenshot-page.mjs "http://localhost:8000/templates/<id>/examples/<ex>/index.html" templates/<id>/thumb.jpg --width 640 --height 360
```
Run any tool with `--help` for its options. View a few outputs to make sure frames are not blank or offset.

## 4. Live examples (optional)
Copy the microsite into `examples/<example-id>/`. Follow the microsite conventions in `CLAUDE.md` (1920×1080 stage scaled to the viewport, Tizen key codes, `$SAMSUNG` hooks). For the catalogue preview it also has to:
- run offline: no CDN fonts (use `../../../../assets/fonts/SamsungOne-*.woff2`), no tracking beacons, no `webapis.js`;
- start in a meaningful state without a TV host. If it waits for `postMessage` replies from the ad player, write a host mock in `js/hosts/<name>.js` (see `js/hosts/click-to-email.js`) and set `"host": "<name>"`;
- mark every edit with a `catalogue patch:` comment explaining why.

## 5. Write `manifest.json`
```jsonc
{
  "id": "my-template",                 // = folder name, listed in data/catalogue.json
  "name": "Short product name",
  "category": "general",               // an id from data/catalogue.json categories
  "summary": "One sentence for the card.",
  "description": "2–4 sentences for the detail page: what the viewer sees/does, advertiser value.",
  "features": ["3–5 short chips"],
  "remoteHints": ["◀ ▶ move", "OK select", "BACK close"],   // must match the microsite's real key handling
  "interactive": true,                 // false = mock gallery only (no examples)
  "thumbnail": "thumb.jpg",
  "host": null,                        // or "<name>" → js/hosts/<name>.js
  "examples": [
    { "id": "default", "name": "Brand X", "entry": "examples/default/index.html", "query": "?target_url=https://www.samsung.com" }
  ],
  "options": [                         // optional: configurable variants passed to the example as URL params
    { "id": "videos", "label": "Videos", "param": "videos", "values": [0, 1, 2, 3], "default": 3 }
  ],
  "mocks": [ { "src": "mocks/step-1.jpg", "caption": "Step 1 — what this screen shows" } ],
  "slots": [
    { "id": "background", "label": "Background", "type": "image",
      "hint": "1920×1080 JPG · keep the left third calm for text",
      "targets": [ { "selector": "#bg", "mode": "src", "style": { "transform": "none" } } ] },
    { "id": "logo", "label": "Advertiser logo", "type": "image", "hint": "Transparent PNG, ~300×100",
      "targets": [ { "selector": ".logo-slot", "mode": "inject-img" } ] },
    { "id": "headline", "label": "Headline", "type": "text", "maxLength": 40,
      "targets": [ { "selector": ".title", "mode": "text", "examples": ["default"] } ] }
  ]
}
```
- **Options** are rendered as pill groups above the TV. Choosing one reloads the example with `?<param>=<value>`, and the microsite must read that parameter itself; see `templates/standard`, which shows 0–3 videos and apps. A slot whose element isn't on screen in the current configuration is greyed out automatically.

Slot target modes:

| mode | effect in the microsite |
|---|---|
| `src` | sets `<img>` `src` (re-applied if the microsite swaps it itself) |
| `background` | sets inline `background-image` (beats stylesheet rules) |
| `inject-img` | adds an `<img>` covering the element — for empty logo boxes, video areas |
| `text` | sets `textContent` |

- `style` (optional) applies CSS properties together with the override, for example to drop a mirror transform.
- `examples` (optional) limits a target to the example ids listed. Use it when the selectors differ between examples.
- Image `hint`s state the recommended pixel size and format. Base them on the element's real size on the 1920×1080 stage.
- Use a **mock video** by adding an image slot over the video area (`inject-img` on the video container, or `src` on a placeholder `<img>`).

## 6. Register and verify
1. Add the id to `templates` in `data/catalogue.json`. The order there is the order on the site.
2. `node tools/validate-catalogue.mjs`: this needs 0 errors. "Selector not found in source" warnings are acceptable only for elements that JS creates at runtime.
3. Run `python -m http.server 8000`, then `node tools/smoke-test.mjs --shots`. This needs every check passing; look at `tools/.tmp/smoke-*.jpg`.
4. Open `http://localhost:8000/microsite.html?id=<id>` and switch on **Show layout**. Every slot outline should sit on the right element. Try each remote key against the `remoteHints`.

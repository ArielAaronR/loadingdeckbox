# Loading Deck

A single-page web app for designing UV-printable skins for the 3-Bay Beyblade X case:
a live 3D preview, per-skin layers (photos + text with effects, lock, reorder),
and true-size 600 ppi PNG / ZIP exports cut to each skin's exact outline.

Everything runs in the browser. There is no server code and nothing is uploaded:
photos, designs and (if enabled) customer models are stored in the visitor's own
browser (IndexedDB).

## Deploy

It's one static file. Upload `index.html` to any static host:

| Host | How |
|---|---|
| Netlify | Import the GitHub repo (redeploys on every push), or drag this folder onto app.netlify.com/drop |
| Vercel | `npx vercel` in this folder, or import the repo; no build step |
| Cloudflare Pages | New project → upload `index.html`; build command: none |
| GitHub Pages | Commit `index.html` to a repo → Settings → Pages → deploy from branch |
| Your own server | Serve `index.html` as `text/html` over HTTPS |

Use HTTPS. Browsers only allow some features (e.g. reading large files) on secure pages.

### What it loads from the internet
- `three@0.160.0` from cdn.jsdelivr.net (3D view; plus the STL/OBJ/3MF/GLB readers for the
  hidden "Your model" mode). If it fails, the editor and exports still work, only the 3D view is off.
- Google Fonts (UI fonts + 12 text-layer fonts).

To self-host these instead (no third-party requests), download the same versions, put them next to
`index.html`, and change the URLs in the `<script type="importmap">` and the Google Fonts `<link>`.

## Case versions

The studio has a **Strap loops / Rectangle** switch (top right, next to the colour).
- **Strap loops (v33)**: bevelled end caps with strap bars; end skins go around the bars.
- **Rectangle (v35)**: no end caps, flush rectangular ends. Each end gets a base skin and a lid skin
  (*Base end* / *Lid end*), the back skin and lid liner get the moved hinge notches, and the
  inside-cap skins disappear.

Exports and the ZIP name follow the selected version. The visitor's choice is remembered in their browser.

Print files for both are in `print/`:
- `3Bay_Case_Strap_Loops_P2S.3mf` (v33)
- `3Bay_Case_Rectangle_P2S.3mf` (v35)

## Lid divider

An optional frame that splits the lid into three bays, with walls between the 01 · 02 · 03 numbers.
It's a separate print that presses in under the lid liner, so the liner stays a flat plate you can
still UV print.

- **On the site:** the **Lid divider** button (next to Open lid) shows it in the 3D view. On the
  *Lid liner* skin, shaded strips show where the frame covers the liner (a design guide only; exports
  are unchanged), and **Divider print file · 3MF** downloads the frame for the selected case version.
  The visitor's choice is remembered in their browser.
- **Print files:** `print/3Bay_Lid_Divider_Strap_Loops.3mf` (172.2 × 57.2 × 22.5 mm) and
  `print/3Bay_Lid_Divider_Rectangle.3mf` (167.1 × 57.2 × 22.5 mm). Flat side down, no supports.
- **Fit:** 1.6 mm walls centred between the bays leave 0.8 mm each side to the 50.8 mm bay openings.
  Each wall's back edge is cut so it clears the base, bay insert and latch through the whole lid
  swing (0.5 mm clearance), and the frame stays clear of the liner's retaining nubs and the hinge-corner
  blocks. It's a press fit between the lid's end walls: if it's too tight, regenerate with
  `--end-gap 0.1`.
- **Regenerate** (e.g. after changing the case model, or to change wall thickness/depth):

  ```bash
  python3 -m venv .venv && .venv/bin/pip install numpy manifold3d
  .venv/bin/python tools/lid_divider.py --help
  .venv/bin/python tools/lid_divider.py            # rewrites the two 3MFs and the <script id="lidDivider"> block
  ```

## Feature flags

Near the top of the editor script:

```js
const FEATURES={ customModel:false };
```

- `customModel` - "Your model" mode (customers upload STL/3MF/OBJ/GLB and click flat faces to design on).
  Off by default. Set to `true` to show it to everyone, or preview it yourself by adding
  `#custom-model` to the end of the page URL.

## Guided tour

First-time visitors get an opt-in invite ("Show me around" / "No thanks") that spotlights each part
of the app in a few short steps. Their choice is remembered in the browser (`localStorage` key
`loadingdeck:tour:v1`), and the **Tour** button in the top bar replays it anytime. The steps are the
`STEPS` list in the tour script at the bottom of `index.html`; a step whose target isn't on screen
(e.g. the dock buttons on phones) is skipped automatically.

## Exports

- Hosted on your site: exports are normal browser downloads.
- Inside Claude: exports go through Claude's save prompt.
- PNGs carry a 600 ppi pHYs tag, so Photoshop and the eufyMake software open them at true size.

## Tests

```bash
cd tests
npm install
npm run setup     # installs Chromium for Playwright + makes the test photos
npm test          # 38 core + 18 layer + 12 case-version + 13 divider + 4 hosted-download + 15 "Your model" + 13 tour checks
```

The tests serve `../index.html` and route the CDN libraries to the local npm copies, so they run offline.

## Updating the case model

The 3D case and skin outlines are embedded in `index.html` (`<script id="mesh">` and the
`const DATA = {...}` block), generated from the case STLs (current: v33). If the case geometry
changes, regenerate those two blocks from the new STLs.

## Licences

- three.js - MIT
- Fonts - SIL Open Font License 1.1 (Chakra Petch, IBM Plex, Bebas Neue, Anton, Oswald, Orbitron,
  Bungee, Permanent Marker, Pacifico, New Rocker, UnifrakturMaguntia, Press Start 2P) and
  Apache 2.0 (Roboto). Free for commercial use; no credit needed when loaded from Google Fonts.

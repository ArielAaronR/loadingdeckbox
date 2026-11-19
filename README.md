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

**Jig sheets · ZIP** (Rectangle only) exports one image per jig with each skin's art at its pocket, plus a guide sheet
(pocket outlines and corner crosses). On the UV printer, place the art image exactly over the jig and print once.

## Lid divider

An optional frame that splits the lid into three bays, with walls between the 01 · 02 · 03 numbers.
It's a separate print that clicks onto the lid liner with 6 snap pins, so the liner stays a flat
plate you can still UV print.

On the site, the **Lid divider** button (next to Open lid) shows it in the 3D view. On the *Lid liner*
skin, shaded strips show where the frame covers the liner and circles mark the pin holes (a design
guide only; exports are unchanged). The visitor's choice is remembered in their browser.

## Print files and 3D models (private)

The case, jig and divider print files are **not in this repository**. `print/` and `tools/` are
gitignored and live only on the maker's machine. The 3D view in `index.html` uses a deliberately coarse
copy of the case (every vertex snapped to a 0.8 mm grid, surfaces not closed): it looks right on
screen but isn't printable or dimensionally faithful. `tests/protect_e2e.js` fails if an exact mesh or
a print-file link ever ends up in the page.

## Price panel

The bottom of the Skins panel shows a running total: the box ($30), the optional spring (+$5) and every
plate that has the customer's art. Plate prices are by size (50¢ steps) and each case version's plates add
up to $15, so a box with art on every plate is $45 ($50 with the spring). Edit the prices in `PRICING` near the top of the editor script;
`tests/price_e2e.js` checks that every plate has a price and that each version still adds up to $15.

## Orders (Netlify)

**Order this case** (bottom of the price panel) opens a short form: name, email, notes, plus the price
summary. On **Send order**:

1. The skins that have the customer's art are rendered at 600 ppi into a ZIP and uploaded in 3 MB pieces
   to `/api/artwork` (`netlify/functions/artwork.mjs`, stored in Netlify Blobs). A full ZIP is often
   20–30 MB, more than a Netlify form can carry, so the form gets a link instead.
2. The `order` Netlify form is posted with: order number, case version, colour, spring, plates, total,
   the artwork link, and an email subject of `[Loading Deck] Order <number> · <version> · <total>`.

Opening the artwork link shows a page with a **Download ZIP** button. The link is unguessable but not
password protected, so share it only with people who should see the customer's art.

**One-time setup in the Netlify dashboard:**
- *Forms* → enable form detection (then redeploy so the `order` form is picked up).
- *Project configuration → Notifications → Emails and webhooks → Form submission notifications* → add an
  email notification for the `order` form to your address. The address lives in Netlify, not in this repo.
- Old artwork can be deleted under *Blobs* (store `order-artwork`).

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
npm test          # 38 core + 18 layer + 12 case-version + 4 model-protection + 8 price + 12 order-function + 9 order + 14 divider + 11 jig-sheet + 4 hosted-download + 15 "Your model" + 13 tour checks
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

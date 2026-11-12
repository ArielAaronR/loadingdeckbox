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
| Netlify | Drag the `skin-studio` folder onto app.netlify.com/drop |
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

## Feature flags

Near the top of the editor script:

```js
const FEATURES={ customModel:false };
```

- `customModel` - "Your model" mode (customers upload STL/3MF/OBJ/GLB and click flat faces to design on).
  Off by default. Set to `true` to show it to everyone, or preview it yourself by adding
  `#custom-model` to the end of the page URL.

## Exports

- Hosted on your site: exports are normal browser downloads.
- Inside Claude: exports go through Claude's save prompt.
- PNGs carry a 600 ppi pHYs tag, so Photoshop and the eufyMake software open them at true size.

## Tests

```bash
cd tests
npm install
npm run setup     # installs Chromium for Playwright + makes the test photos
npm test          # 38 core + 18 layer + 4 hosted-download + 15 "Your model" checks
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

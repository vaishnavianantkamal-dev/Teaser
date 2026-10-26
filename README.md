# Coffee Science — "Something Brewing" teaser

A single-view, fully 3D teaser (React Three Fiber). The Coffee Science bottle
is a real 3D model, measured from the product photo: ribbed glass with
refraction, the printed label wrapped round the body, coffee inside that rises
as it's poured, and a gold screw cap that actually unscrews. It materialises
empty, the cap twists off, cold brew pours in and fills it, the cap goes back
on — with 3D roasted beans floating around and the "Coffee Science — Coming
Soon" title.

## Quick look (no install)

Open **`standalone/teaser.html`** in a browser — it's one self-contained file
(code, styles and images inlined) and works straight from disk.

## Develop

```bash
npm install
npm run dev          # http://localhost:3220
```

Add `?t=5` to the URL to jump 5 s into the 13 s loop (e.g. straight to the pour).

## Build

```bash
npm run build             # → dist/  (deploy anywhere, incl. GitHub Pages)
npm run build:standalone  # → standalone/teaser.html (single file)
```

`dist/` uses relative paths, so it works from any folder or sub-path.

## Responsive & performance

- Wide screens: "Coffee | bottle | Science" split title. Portrait (narrower
  than 4:5): title stacks under the bottle and the camera pulls back to fit.
- Beans keep clear of the bottle, the pour and the title at every size.
- Render resolution is capped at 1.75× and drops to 1× automatically if the
  frame rate sags; phones get fewer, lighter beans and a lighter glass
  material (no extra refraction pass).
- three.js and React Three Fiber are split into their own long-cacheable chunks;
  the bottle photo is a 95 kB WebP, preloaded alongside the scripts.

## Structure

```
index.html            page shell (fonts, preload)
src/Teaser.tsx        layout: backdrop, canvas, logo, title, tagline
src/TeaserScene.tsx   3D scene: backdrop, lights, pour stream, beans, dust
src/Bottle3D.tsx      the 3D bottle: glass, coffee + fill, label, cap, shadow
src/bottleModel.ts    bottle shape (measured from the photo), label/cap textures
src/timeline.ts       the 13.5 s loop: reveal, unscrew, pour, fill, recap
src/assets.ts         image URLs (data URIs in the standalone build)
src/three/            bean model + textures, math and texture helpers
scripts/              standalone single-file build
public/               teaser.webp (label + cap artwork source), logo.webp
```

# Coffee Science — "Something Brewing" teaser

A single-view 3D teaser (React Three Fiber): the Coffee Science bottle stands
on a dark stone with coffee leaves. It starts empty, the gold cap twists off,
milk coffee pours in and fills it, then the cap goes back on. Roasted beans and glowing coffee droplets float
around the gold "Coffee Science" title; while the coffee pours, the shining
"Coffee Without Compromise" tagline rises onto the stone, then moves above
the bottle once the cap is back on.

## Live

https://vaishnavianantkamal-dev.github.io/Teaser/ — rebuilt and redeployed automatically on every push to `main`
(`.github/workflows/deploy.yml`).

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
  frame rate sags; phones get fewer, lighter beans.
- three.js and React Three Fiber are split into their own long-cacheable chunks;
  the bottle photo is a 95 kB WebP, preloaded alongside the scripts.

## Structure

```
index.html            page shell (fonts, preload)
src/Teaser.tsx        layout: backdrop, canvas, logo, title, tagline
src/TeaserScene.tsx   3D scene: bottle fill shader, cap, pour, beans, lights
src/cutout.ts         removes the photo's green backdrop, splits off the cap
src/scenery.tsx       stone, coffee leaves, droplets
src/assets.ts         image URLs (data URIs in the standalone build)
src/three/            bean model + textures, math and texture helpers
scripts/              standalone single-file build
public/               teaser.webp (bottle photo), logo.webp
```

/**
 * Builds the teaser into ONE self-contained file, `standalone/teaser.html`,
 * that opens by double-click (file://) with no server: the JS is bundled as
 * a classic (non-module) script and the CSS and images are inlined.
 *
 *   npm run build:standalone
 */
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const result = await build({
  configFile: false,
  root,
  logLevel: 'warn',
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(root, 'src') } },
  define: { 'process.env.NODE_ENV': '"production"' },
  build: {
    write: false,
    minify: true,
    cssCodeSplit: false,
    lib: {
      entry: path.resolve(root, 'src/main.tsx'),
      name: 'CoffeeScienceTeaser',
      formats: ['iife'],
      fileName: () => 'teaser.js',
    },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});

const outputs = (Array.isArray(result) ? result : [result]).flatMap((r) => r.output);
const js = outputs.find((o) => o.type === 'chunk')?.code;
const css = outputs
  .filter((o) => o.type === 'asset' && o.fileName.endsWith('.css'))
  .map((o) => String(o.source))
  .join('\n');
if (!js) throw new Error('teaser bundle was not produced');

// Images travel inside the file as data URIs (read by src/assets.ts).
const dataUri = (rel, mime) =>
  `data:${mime};base64,${readFileSync(path.resolve(root, 'public', rel)).toString('base64')}`;
const assets = {
  teaser: dataUri('gallery/teaser.webp', 'image/webp'),
  logo: dataUri('brand/logo.webp', 'image/webp'),
  mask: dataUri('gallery/label_mask.webp', 'image/webp'),
  title3d: dataUri('brand/coffee-science-3d.png', 'image/png'),
  coffee3d: dataUri('brand/coffee-word-3d.png', 'image/png'),
  science3d: dataUri('brand/science-word-3d.png', 'image/png'),
};

// Favicon: just the round emblem, transparent around it.
const favicon = dataUri('brand/favicon-32.png', 'image/png');

const safe = (s) => s.replace(/<\/(script|style)/gi, '<\\/$1');

const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#040F09" />
    <title>Coffee Science — Something Brewing</title>
    <link rel="icon" type="image/png" href="${favicon}" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;500&family=Playfair+Display:wght@500;600&family=Jost:wght@300;400;500&display=swap"
      rel="stylesheet"
    />
    <style>${safe(css)}</style>
  </head>
  <body>
    <div id="root"></div>
    <script>window.__TEASER_ASSETS__ = ${JSON.stringify(assets)};</script>
    <script>${safe(js)}</script>
  </body>
</html>
`;

mkdirSync(path.resolve(root, 'standalone'), { recursive: true });
writeFileSync(path.resolve(root, 'standalone/teaser.html'), html);
console.log(`standalone/teaser.html written (${(html.length / 1024 / 1024).toFixed(2)} MB)`);

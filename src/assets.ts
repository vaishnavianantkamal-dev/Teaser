/**
 * Image URLs. Relative to the page by default (works from any host or
 * sub-path); the single-file standalone build injects data URIs through
 * `window.__TEASER_ASSETS__` instead so it opens straight from disk.
 */
type AssetMap = {
  teaser: string;
  logo: string;
  mask?: string;
  title3d?: string;
  coffee3d?: string;
  science3d?: string;
};

const injected = (window as unknown as { __TEASER_ASSETS__?: AssetMap }).__TEASER_ASSETS__;
const base = import.meta.env.BASE_URL;

export const TEASER_IMG = injected?.teaser ?? `${base}gallery/teaser.webp`;
export const LOGO_IMG = injected?.logo ?? `${base}brand/logo.webp`;
export const MASK_IMG = injected?.mask ?? `${base}gallery/label_mask.webp`;
export const TITLE_3D_IMG = injected?.title3d ?? `${base}brand/coffee-science-3d.png`;
export const COFFEE_3D_IMG = injected?.coffee3d ?? `${base}brand/coffee-word-3d.png`;
export const SCIENCE_3D_IMG = injected?.science3d ?? `${base}brand/science-word-3d.png`;

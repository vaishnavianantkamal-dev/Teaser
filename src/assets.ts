/**
 * Image URLs. Relative to the page by default (works from any host or
 * sub-path); the single-file standalone build injects data URIs through
 * `window.__TEASER_ASSETS__` instead so it opens straight from disk.
 */
type AssetMap = { teaser: string; logo: string };

const injected = (window as unknown as { __TEASER_ASSETS__?: AssetMap }).__TEASER_ASSETS__;
const base = import.meta.env.BASE_URL;

export const TEASER_IMG = injected?.teaser ?? `${base}gallery/teaser.webp`;
export const LOGO_IMG = injected?.logo ?? `${base}brand/logo.webp`;

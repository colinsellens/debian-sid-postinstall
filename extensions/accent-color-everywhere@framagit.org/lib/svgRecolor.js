import {hexToRgb, rgbToHex, rgbToHsl, hslToRgb} from './color.js';

const HEX_RE = /(?<!url\()(?<!href=["'])#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-zA-Z_-])/g;
const HIGHLIGHT_RE = /(\.ColorScheme-Highlight\s*\{[^}]*?color\s*:\s*)#[0-9a-fA-F]{3,6}/g;
const HIGHLIGHT_TAG_RE = /<[a-zA-Z][^>]*\bclass="[^"]*ColorScheme-Highlight[^"]*"[^>]*>/g;

export const FOLDER_NAME_RE = /^(folder|user-home|user-desktop|user-bookmarks|inode-directory|network-workgroup)/;
export const CANONICAL_RE = /^(folder|folder-(documents|download|music|pictures|videos|templates|publicshare|desktop)|user-home|user-desktop|inode-directory)\.svg$/;
const STYLE_RE = /<style[\s\S]*?<\/style>/g;

const norm = h => rgbToHex(hexToRgb(h));

export function hasHighlightClass(text) {
    HIGHLIGHT_TAG_RE.lastIndex = 0;
    return HIGHLIGHT_TAG_RE.test(text);
}

export function countColors(text, counts) {
    const body = text.replace(STYLE_RE, '').replace(HIGHLIGHT_TAG_RE, '');
    for (const m of body.matchAll(HEX_RE)) {
        const key = norm(m[0]);
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
}

export function detectFamily(counts) {
    const saturated = [];
    for (const [hex, n] of counts) {
        const hsl = rgbToHsl(hexToRgb(hex));
        if (hsl.s >= 0.2 && hsl.l >= 0.1 && hsl.l <= 0.92)
            saturated.push({hex, n, hsl});
    }
    if (saturated.length === 0)
        return null;
    saturated.sort((a, b) => b.n - a.n);
    const base = saturated[0];
    const family = saturated.filter(c => {
        const dh = Math.abs(c.hsl.h - base.hsl.h);
        return Math.min(dh, 360 - dh) <= 30;
    });
    return {base: base.hex, members: family.map(c => c.hex)};
}

export function buildColorMap(family, accentHex) {
    const map = new Map();
    if (!family)
        return map;
    const base = rgbToHsl(hexToRgb(family.base));
    const acc = rgbToHsl(hexToRgb(accentHex));
    for (const hex of family.members) {
        const c = rgbToHsl(hexToRgb(hex));
        const s = Math.min(1, Math.max(0, base.s > 0 ? acc.s * c.s / base.s : acc.s));
        const l = Math.min(0.98, Math.max(0.02, acc.l + (c.l - base.l)));
        map.set(hex, rgbToHex(hslToRgb({h: acc.h, s, l})));
    }
    return map;
}

export function recolorSvg(text, colorMap, accentHex, highlight = true) {
    let out = text;
    if (highlight && hasHighlightClass(text)) {
        out = out.replace(HIGHLIGHT_RE, (_m, pre) => `${pre}${accentHex}`);
        out = out.replace(HIGHLIGHT_TAG_RE, tag => tag.replace(HEX_RE, accentHex));
    }
    if (colorMap.size > 0)
        out = out.replace(HEX_RE, m => colorMap.get(norm(m)) ?? m);
    return out;
}

export const GNOME_PRESETS = {
    blue: '#3584e4',
    teal: '#2190a4',
    green: '#3a944a',
    yellow: '#c88800',
    orange: '#ed5b00',
    red: '#e62d42',
    pink: '#d56199',
    purple: '#9141ac',
    slate: '#6f8396',
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function hexToRgb(hex) {
    let h = String(hex).trim().replace(/^#/, '');
    if (h.length === 3 || h.length === 4)
        h = h.slice(0, 3).split('').map(c => c + c).join('');
    if (!/^[0-9a-fA-F]{6}/.test(h))
        return null;
    return {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16),
    };
}

export function rgbToHex({r, g, b}) {
    const p = v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
    return `#${p(r)}${p(g)}${p(b)}`;
}

export function rgbToHsl({r, g, b}) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    let h = 0, s = 0;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        if (max === r)
            h = (g - b) / d + (g < b ? 6 : 0);
        else if (max === g)
            h = (b - r) / d + 2;
        else
            h = (r - g) / d + 4;
        h *= 60;
    }
    return {h, s, l};
}

export function hslToRgb({h, s, l}) {
    h = ((h % 360) + 360) % 360 / 360;
    if (s === 0)
        return {r: l * 255, g: l * 255, b: l * 255};
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const f = t => {
        if (t < 0)
            t += 1;
        if (t > 1)
            t -= 1;
        if (t < 1 / 6)
            return p + (q - p) * 6 * t;
        if (t < 1 / 2)
            return q;
        if (t < 2 / 3)
            return p + (q - p) * (2 / 3 - t) * 6;
        return p;
    };
    return {r: f(h + 1 / 3) * 255, g: f(h) * 255, b: f(h - 1 / 3) * 255};
}

export function luminance({r, g, b}) {
    const c = v => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
}

export function contrast(a, b) {
    const la = luminance(a), lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function foregroundFor(hex) {
    const bg = hexToRgb(hex);
    const white = {r: 255, g: 255, b: 255};
    const dark = {r: 30, g: 30, b: 30};
    return contrast(bg, white) >= 2.5 || contrast(bg, white) >= contrast(bg, dark) ? '#ffffff' : '#1e1e1e';
}

export function adjust(hex, {dl = 0, ds = 0} = {}) {
    const hsl = rgbToHsl(hexToRgb(hex));
    return rgbToHex(hslToRgb({h: hsl.h, s: clamp(hsl.s + ds, 0, 1), l: clamp(hsl.l + dl, 0, 1)}));
}

export function normalizeAccent(hex) {
    const hsl = rgbToHsl(hexToRgb(hex));
    const s = hsl.s < 0.08 ? 0.15 : clamp(hsl.s, 0.45, 0.85);
    const l = clamp(hsl.l, 0.4, 0.58);
    return rgbToHex(hslToRgb({h: hsl.h, s, l}));
}

function oklab(hex) {
    const lin = v => {
        v /= 255;
        return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    const {r, g, b} = hexToRgb(hex);
    const [R, G, B] = [lin(r), lin(g), lin(b)];
    const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
    const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
    const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
    return [
        0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
        1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
        0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
    ];
}

const HUE_STEPS = [[345, 'pink'], [280, 'purple'], [230, 'blue'], [175, 'teal'], [115, 'green'], [75.5, 'yellow'], [35, 'orange'], [10, 'red']];

export function nearestPreset(hex) {
    const [, a, b] = oklab(hex);
    if (Math.hypot(a, b) < 0.04)
        return 'slate';
    const h = (Math.atan2(b, a) * 180 / Math.PI + 360) % 360;
    return HUE_STEPS.find(([min]) => h > min)?.[1] ?? 'pink';
}

export function dominantFromPixels(data, width, height, rowstride, channels) {
    const BUCKETS = 36;
    const weight = new Float64Array(BUCKETS);
    const sums = Array.from({length: BUCKETS}, () => [0, 0, 0]);
    let total = 0, count = 0;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = y * rowstride + x * channels;
            if (channels === 4 && data[i + 3] < 128)
                continue;
            const r = data[i], g = data[i + 1], b = data[i + 2];
            count++;
            const max = Math.max(r, g, b), min = Math.min(r, g, b);
            const v = max / 255;
            const s = max === 0 ? 0 : (max - min) / max;
            if (v < 0.18 || s < 0.15)
                continue;
            let h;
            if (max === r)
                h = ((g - b) / (max - min) + 6) % 6;
            else if (max === g)
                h = (b - r) / (max - min) + 2;
            else
                h = (r - g) / (max - min) + 4;
            const bucket = Math.floor(h * 60 / (360 / BUCKETS)) % BUCKETS;
            const w = s * s * v * v;
            weight[bucket] += w;
            sums[bucket][0] += r * w;
            sums[bucket][1] += g * w;
            sums[bucket][2] += b * w;
            total += w;
        }
    }
    if (count === 0 || total / count < 0.01)
        return null;
    let best = 0, bestScore = -1;
    for (let k = 0; k < BUCKETS; k++) {
        const score = weight[k] + 0.5 * (weight[(k + BUCKETS - 1) % BUCKETS] + weight[(k + 1) % BUCKETS]);
        if (score > bestScore) {
            bestScore = score;
            best = k;
        }
    }
    const w = weight[best];
    return rgbToHex({r: sums[best][0] / w, g: sums[best][1] / w, b: sums[best][2] / w});
}

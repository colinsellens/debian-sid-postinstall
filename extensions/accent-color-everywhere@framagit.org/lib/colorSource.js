import {GNOME_PRESETS, hexToRgb, normalizeAccent, rgbToHex} from './color.js';
import {wallpaperColor} from './wallpaper.js';
import {diag} from './diag.js';

export async function resolveColor(settings, iface, bg, cancellable) {
    const source = settings.get_string('source');
    if (source === 'system')
        return GNOME_PRESETS[iface.get('accent-color')] ?? GNOME_PRESETS.blue;
    if (source === 'custom') {
        const rgb = hexToRgb(settings.get_string('custom-color'));
        return rgb ? rgbToHex(rgb) : GNOME_PRESETS.blue;
    }
    const dark = iface.get('color-scheme') === 'prefer-dark';
    const uri = bg.get_string(dark ? 'picture-uri-dark' : 'picture-uri') || bg.get_string('picture-uri');
    const fallback = settings.get_string('current-color') || GNOME_PRESETS.blue;
    try {
        const c = await wallpaperColor(uri, cancellable);
        return c ? normalizeAccent(c) : GNOME_PRESETS.slate;
    } catch (e) {
        diag('wallpaper', e);
        return fallback;
    }
}

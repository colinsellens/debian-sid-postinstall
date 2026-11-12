import {nearestPreset} from './color.js';

export function syncGnomeAccent(settings, iface, color) {
    if (settings.get_string('saved-gnome-accent') === '')
        settings.set_string('saved-gnome-accent', iface.get('accent-color'));
    const preset = nearestPreset(color);
    if (iface.get('accent-color') !== preset)
        iface.settings.set_string('accent-color', preset);
}

export function restoreGnomeAccent(settings, iface) {
    const saved = settings.get_string('saved-gnome-accent');
    if (saved === '')
        return;
    settings.set_string('saved-gnome-accent', '');
    if (settings.get_string('source') !== 'system')
        iface.settings.set_string('accent-color', saved);
}

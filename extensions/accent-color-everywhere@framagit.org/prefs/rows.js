import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

export function rgba(hex) {
    const c = new Gdk.RGBA();
    c.parse(hex || '#3584e4');
    return c;
}

export function toHex(c) {
    const p = v => Math.round(v * 255).toString(16).padStart(2, '0');
    return `#${p(c.red)}${p(c.green)}${p(c.blue)}`;
}

export function switchRow(settings, key, title, subtitle = '') {
    const row = new Adw.SwitchRow({title, subtitle});
    settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
    return row;
}

export function spinRow(settings, key, title, min, max) {
    const row = new Adw.SpinRow({title, adjustment: new Gtk.Adjustment({lower: min, upper: max, step_increment: 1})});
    settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
    return row;
}

export function expanderRow(settings, title, subtitle = '', key = null) {
    const row = new Adw.ExpanderRow({title, subtitle, show_enable_switch: key !== null});
    if (key)
        settings.bind(key, row, 'enable-expansion', Gio.SettingsBindFlags.DEFAULT);
    return row;
}

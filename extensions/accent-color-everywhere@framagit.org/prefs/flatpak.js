import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const FLATPAK_FS = ['xdg-config/gtk-3.0:ro', 'xdg-config/gtk-4.0:ro', 'xdg-config/kdeglobals:ro', 'xdg-data/icons:ro'];
const overridesFile = () => GLib.build_filenamev([GLib.get_user_data_dir(), 'flatpak', 'overrides', 'global']);

function readOverrides() {
    const kf = new GLib.KeyFile();
    try {
        kf.load_from_file(overridesFile(), GLib.KeyFileFlags.KEEP_COMMENTS);
        return {kf, list: kf.get_string_list('Context', 'filesystems')};
    } catch {
        return {kf, list: []};
    }
}

function isAllowed() {
    const {list} = readOverrides();
    return FLATPAK_FS.every(f => list.includes(f));
}

function setAllowed(allowed) {
    const {kf, list} = readOverrides();
    const rest = list.filter(f => !FLATPAK_FS.includes(f));
    const next = allowed ? [...rest, ...FLATPAK_FS] : rest;
    try {
        if (next.length)
            kf.set_string_list('Context', 'filesystems', next);
        else if (list.length)
            kf.remove_key('Context', 'filesystems');
        GLib.mkdir_with_parents(GLib.path_get_dirname(overridesFile()), 0o755);
        kf.save_to_file(overridesFile());
        return true;
    } catch {
        return false;
    }
}

export function flatpakRow() {
    const row = new Adw.SwitchRow({title: _('Flatpak apps'), active: isAllowed()});
    const icon = new Gtk.Image({valign: Gtk.Align.CENTER});
    row.add_prefix(icon);
    const refresh = () => {
        const on = row.active;
        icon.icon_name = on ? 'emblem-ok-symbolic' : 'dialog-warning-symbolic';
        row.subtitle = on
            ? _('Flatpak apps get the accent color')
            : _('To let Flatpak apps use the accent color, enable this switch');
        for (const [cls, active] of [['warning', !on], ['success', on]]) {
            if (active)
                icon.add_css_class(cls);
            else
                icon.remove_css_class(cls);
        }
    };
    row.connect('notify::active', () => {
        if (row.active === isAllowed())
            return;
        if (!setAllowed(row.active))
            row.active = !row.active;
        refresh();
    });
    refresh();
    return row;
}

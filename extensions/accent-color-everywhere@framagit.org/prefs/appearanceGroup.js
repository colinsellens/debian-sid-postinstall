import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {switchRow, spinRow, expanderRow} from './rows.js';

const MIX_MODES = ['body', 'secondary', 'both'];

const installed = (bins, dirs) => bins.some(b => GLib.find_program_in_path(b)) ||
    dirs.some(d => GLib.file_test(d, GLib.FileTest.IS_DIR));

function iconRows(settings, watch) {
    const title = _('Folder icons');
    const subtitle = _('Generates a recolored copy of the current icon theme, mixed themes included');
    const plain = switchRow(settings, 'target-icons', title, subtitle);
    const mixed = expanderRow(settings, title, subtitle, 'target-icons');
    const mixRow = new Adw.ComboRow({
        title: _('Two-color icon themes'),
        subtitle: _('Color to recolor in mixed themes such as Tela-dracula'),
        model: Gtk.StringList.new([_('Main color'), _('Secondary color'), _('Both')]),
    });
    mixRow.selected = Math.max(0, MIX_MODES.indexOf(settings.get_string('icon-mix-mode')));
    mixRow.connect('notify::selected', () => settings.set_string('icon-mix-mode', MIX_MODES[mixRow.selected]));
    mixed.add_row(mixRow);
    watch(['icon-theme-mixed'], () => {
        const isMixed = settings.get_boolean('icon-theme-mixed');
        plain.visible = !isMixed;
        mixed.visible = isMixed;
    });
    return [plain, mixed];
}

function hardwareRow(settings) {
    const items = [
        ['target-mangohud', 'MangoHud', _('Overlay colors in MangoHud.conf (existing file only)'),
            ['mangohud'], [GLib.build_filenamev([GLib.get_user_config_dir(), 'MangoHud'])]],
        ['target-openrgb', 'OpenRGB', _('Device lighting in the accent color, through the SDK server (port 6742)'),
            ['openrgb', 'org.openrgb.OpenRGB'], []],
        ['target-wine', 'Wine', _('Selection colors in every Wine prefix found (Wine, Lutris, Faugus, Heroic)'),
            ['wine', 'wine64', 'lutris', 'faugus-launcher'], [GLib.build_filenamev([GLib.get_home_dir(), '.wine'])]],
    ].filter(([, , , bins, dirs]) => installed(bins, dirs));
    if (!items.length)
        return null;
    const row = expanderRow(settings, _('Games and hardware'), _('Only installed software is listed'));
    for (const [key, name, subtitle] of items)
        row.add_row(switchRow(settings, key, name, subtitle));
    return row;
}

export function appearanceGroup(settings, watch) {
    const group = new Adw.PreferencesGroup();

    const grid = expanderRow(settings, _('App grid'), _('App folders, hovered and selected apps, folder window and dash'), 'shell-appgrid');
    grid.add_row(spinRow(settings, 'appgrid-tint', _('Tint intensity (%)'), 5, 60));
    group.add(grid);

    const outline = expanderRow(settings, _('Focused window outline'), '', 'target-border');
    outline.add_row(spinRow(settings, 'border-width', _('Outline width'), 1, 8));
    outline.add_row(switchRow(settings, 'border-hide-maximized', _('Hide on maximized windows')));
    group.add(outline);

    group.add(switchRow(settings, 'colored-headerbar', _('Title bars in the accent color'), _('GTK 3 and GTK 4')));

    for (const row of iconRows(settings, watch))
        group.add(row);

    const hardware = hardwareRow(settings);
    if (hardware)
        group.add(hardware);
    return group;
}

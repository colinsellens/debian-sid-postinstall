import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {rgba, toHex} from './rows.js';

const SOURCES = ['wallpaper', 'custom', 'system'];

export function accentGroup(settings, watch, swatchStyle) {
    const swatch = new Gtk.Box({width_request: 40, height_request: 22, valign: Gtk.Align.CENTER, css_classes: ['ae-swatch']});
    const group = new Adw.PreferencesGroup({title: _('Accent color'), header_suffix: swatch});

    const sourceNames = [_('Wallpaper'), _('Custom'), _('GNOME Settings')];
    const sourceRow = new Adw.ComboRow({title: _('Source'), model: Gtk.StringList.new(sourceNames)});
    sourceRow.selected = Math.max(0, SOURCES.indexOf(settings.get_string('source')));
    sourceRow.connect('notify::selected', () => settings.set_string('source', SOURCES[sourceRow.selected]));
    group.add(sourceRow);

    const customRow = new Adw.ActionRow({title: _('Custom color')});
    const customButton = new Gtk.ColorDialogButton({
        dialog: new Gtk.ColorDialog({with_alpha: false}),
        valign: Gtk.Align.CENTER,
        rgba: rgba(settings.get_string('custom-color')),
    });
    customButton.connect('notify::rgba', () => settings.set_string('custom-color', toHex(customButton.rgba)));
    customRow.add_suffix(customButton);
    group.add(customRow);

    const modeSubtitles = [
        _('Same color everywhere, changes instantly in every app'),
        _('Closer to the wallpaper; some apps only change after being restarted'),
    ];
    const modeRow = new Adw.ComboRow({
        title: _('Color type'),
        model: Gtk.StringList.new([_('9 GNOME colors'), _('Exact color')]),
    });
    modeRow.selected = settings.get_boolean('gnome-palette') ? 0 : 1;
    modeRow.subtitle = modeSubtitles[modeRow.selected];
    modeRow.connect('notify::selected', () => {
        settings.set_boolean('gnome-palette', modeRow.selected === 0);
        modeRow.subtitle = modeSubtitles[modeRow.selected];
    });
    group.add(modeRow);

    watch(['current-color', 'source'], () => {
        const color = settings.get_string('current-color') || '#3584e4';
        swatchStyle.load_from_string(`.ae-swatch { background: ${color}; border-radius: 6px; }`);
        const source = settings.get_string('source');
        group.description = `${sourceNames[SOURCES.indexOf(source)] ?? ''} · ${color}`;
        customRow.visible = source === 'custom';
        modeRow.visible = source !== 'system';
    });
    return group;
}

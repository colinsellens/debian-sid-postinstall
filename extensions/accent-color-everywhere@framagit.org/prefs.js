import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {accentGroup} from './prefs/accentGroup.js';
import {appearanceGroup} from './prefs/appearanceGroup.js';
import {flatpakRow} from './prefs/flatpak.js';

export default class AccentColorEverywherePrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window.set_default_size(620, 760);

        const display = Gdk.Display.get_default();
        const swatchStyle = new Gtk.CssProvider();
        Gtk.StyleContext.add_provider_for_display(display, swatchStyle, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
        const handlers = [];
        const watch = (keys, fn) => {
            for (const key of keys)
                handlers.push(settings.connect(`changed::${key}`, fn));
            fn();
        };
        window.connect('close-request', () => {
            handlers.forEach(id => settings.disconnect(id));
            Gtk.StyleContext.remove_provider_for_display(display, swatchStyle);
            return false;
        });

        const page = new Adw.PreferencesPage();
        page.add(accentGroup(settings, watch, swatchStyle));
        page.add(appearanceGroup(settings, watch));
        if (GLib.find_program_in_path('flatpak')) {
            const flatpakGroup = new Adw.PreferencesGroup();
            flatpakGroup.add(flatpakRow());
            page.add(flatpakGroup);
        }
        window.add(page);
    }
}

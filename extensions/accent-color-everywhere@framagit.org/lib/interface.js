import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const OWN_CHANGE_WINDOW = 2000000;

export class InterfaceSettings {
    constructor() {
        this.settings = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
        this._selfSetAt = 0;
    }

    get(key) {
        return this.settings.get_string(key);
    }

    set(key, value) {
        this._selfSetAt = GLib.get_monotonic_time();
        this.settings.set_string(key, value);
    }

    isOwnChange() {
        return GLib.get_monotonic_time() - this._selfSetAt < OWN_CHANGE_WINDOW;
    }
}

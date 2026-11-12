import GLib from 'gi://GLib';

import {IconRecolor, outName, baseOf} from './icons.js';
import {diag} from './diag.js';

export class IconTarget {
    constructor(settings, iface) {
        this._settings = settings;
        this._iface = iface;
        this._recolor = new IconRecolor();
        this._lastKey = '';
        this._toggleId = 0;
    }

    isOwnThemeChange() {
        const name = this._iface.get('icon-theme');
        return this._toggleId !== 0 || name === outName(this._settings.get_string('icon-base-theme'));
    }

    async apply(color, cancellable, isCurrent) {
        const current = this._iface.get('icon-theme');
        const base = baseOf(current);
        const previous = this._settings.get_string('icon-base-theme');
        if (previous && previous !== base) {
            this._recolor.forget(previous);
            await this._recolor.remove(previous);
        }
        if (previous !== base)
            this._settings.set_string('icon-base-theme', base);

        const mix = this._settings.get_string('icon-mix-mode');
        const key = `${base}|${color}|${mix}`;
        if (key === this._lastKey && current === outName(base))
            return;
        diag('icons', `generate base=${base} color=${color} mix=${mix}`);
        const ok = await this._recolor.generate(base, color, mix, cancellable);
        if (!isCurrent())
            return;
        const mixed = this._recolor.isMixed(base);
        if (this._settings.get_boolean('icon-theme-mixed') !== mixed)
            this._settings.set_boolean('icon-theme-mixed', mixed);
        this._lastKey = key;
        if (!ok) {
            if (current !== base)
                this._iface.set('icon-theme', base);
            return;
        }
        if (current !== outName(base)) {
            this._iface.set('icon-theme', outName(base));
            return;
        }
        if (this._toggleId)
            GLib.source_remove(this._toggleId);
        this._toggleId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 250, () => {
            this._toggleId = 0;
            this._iface.set('icon-theme', outName(base));
            return GLib.SOURCE_REMOVE;
        });
        this._iface.set('icon-theme', base);
    }

    revert() {
        const base = this._settings.get_string('icon-base-theme');
        if (!base)
            return;
        if (this._iface.get('icon-theme') === outName(base))
            this._iface.set('icon-theme', base);
        this._settings.set_string('icon-base-theme', '');
        this._lastKey = '';
        this._recolor.remove(base).catch(e => diag('icons', e));
    }

    destroy() {
        if (this._toggleId)
            GLib.source_remove(this._toggleId);
        this._toggleId = 0;
        this.revert();
        this._recolor = null;
        this._settings = null;
        this._iface = null;
    }
}

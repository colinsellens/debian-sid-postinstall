import GLib from 'gi://GLib';

import {gtk3Css, gtk4Css, applyGtk, revertGtk, applyGimp, revertGimp, canShadowTheme, applyShadowTheme, removeShadowThemes} from './gtk.js';
import {diag} from './diag.js';

const RELOAD_SUFFIX = '-reload';
const baseTheme = name => name.replace(/-reload$/, '');

export class GtkTarget {
    constructor(iface) {
        this._iface = iface;
        this._flipId = 0;
        this._applied = false;
        this.flipping = false;
    }

    async apply(color, fg, {headerbar, live}, cancellable) {
        this._applied = true;
        await applyGtk(4, gtk4Css(color, fg, {headerbar, live}));
        const css3 = gtk3Css(color, fg, {headerbar});
        const theme = baseTheme(this._iface.get('gtk-theme'));
        const shadow = await canShadowTheme(theme) &&
            await applyShadowTheme(theme, css3);
        if (cancellable.is_cancelled())
            return;
        if (shadow) {
            await revertGtk(3);
        } else {
            await removeShadowThemes();
            await applyGtk(3, css3);
        }
        await applyGimp(css3);
        if (shadow && !cancellable.is_cancelled())
            this._flipTheme();
    }

    destroy() {
        if (this._flipId)
            GLib.source_remove(this._flipId);
        this._flipId = 0;
        this.flipping = false;
        const iface = this._iface;
        this._iface = null;
        if (!this._applied)
            return;
        revertAll().then(() => {
            const theme = baseTheme(iface.get('gtk-theme'));
            iface.set('gtk-theme', `${theme}${RELOAD_SUFFIX}`);
            iface.set('gtk-theme', theme);
        }).catch(e => diag('gtk', e));
    }

    _flipTheme() {
        if (this._flipId)
            return;
        const theme = baseTheme(this._iface.get('gtk-theme'));
        this.flipping = true;
        this._iface.set('gtk-theme', `${theme}${RELOAD_SUFFIX}`);
        this._flipId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, () => {
            this._flipId = 0;
            this._iface.set('gtk-theme', theme);
            this.flipping = false;
            return GLib.SOURCE_REMOVE;
        });
    }
}

async function revertAll() {
    await revertGtk(4);
    await revertGtk(3);
    await revertGimp();
    await removeShadowThemes();
}

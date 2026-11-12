import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {file, readText, writeText, cacheDir} from './fileio.js';
import {diag} from './diag.js';

const OUT_DEFAULT = 'shell-default.css';
const OUT_APP = 'shell-app.css';
const OUT_EXTRAS = 'shell-extras.css';

export function substituteAccent(css, color, fg, baseUri) {
    let out = css.replace(/-st-accent-fg-color/g, fg).replace(/-st-accent-color/g, color);
    if (baseUri) {
        out = out.replace(/url\(\s*(["']?)(?![a-z]+:|\/)([^"')]+)\1\s*\)/gi,
            (_m, q, rel) => `url("${baseUri}${rel}")`);
    }
    return out;
}

export function menusCss(color, fg) {
    return `
.popup-menu-item:hover, .popup-menu-item:selected, .popup-menu-item:focus,
.popup-sub-menu .popup-menu-item:hover, .popup-sub-menu .popup-menu-item:selected, .popup-sub-menu .popup-menu-item:focus {
  background-color: ${color} !important; color: ${fg} !important; }
.popup-menu-item:active, .popup-menu-item:checked, .popup-sub-menu .popup-menu-item:active, .popup-sub-menu .popup-menu-item:checked {
  background-color: st-darken(${color}, 8%) !important; color: ${fg} !important; }
#panel .panel-button:active, #panel .panel-button:checked, #panel .panel-button:active:hover, #panel .panel-button:checked:hover {
  background-color: ${color} !important; color: ${fg} !important; }
`;
}

export function appGridCss(c, tint) {
    const t = k => (1 - Math.min(0.95, tint * k / 100)).toFixed(2);
    return `
.app-folder { background-color: st-transparentize(${c}, ${t(0.6)}) !important; box-shadow: inset 0 0 0 1px st-transparentize(${c}, ${t(2.5)}) !important; }
.app-folder:hover { background-color: st-transparentize(${c}, ${t(1)}) !important; }
.app-folder:focus, .app-folder:highlighted, .app-folder:selected, .app-folder:checked, .app-folder:active {
  background-color: st-transparentize(${c}, ${t(1.4)}) !important; box-shadow: inset 0 0 0 2px ${c} !important; }
.overview-tile:hover, .grid-search-result:hover,
.app-folder-dialog .overview-tile:hover, .app-folder-dialog .grid-search-result:hover {
  background-color: st-transparentize(${c}, ${t(1)}) !important; }
.overview-tile:focus, .grid-search-result:focus,
.app-folder-dialog .overview-tile:focus, .app-folder-dialog .grid-search-result:focus,
.overview-tile:focus:hover, .app-folder-dialog .overview-tile:focus:hover {
  background-color: st-transparentize(${c}, ${t(1.4)}) !important; box-shadow: inset 0 0 0 2px ${c} !important; }
.overview-tile:highlighted, .overview-tile:selected, .overview-tile:checked, .overview-tile:active,
.grid-search-result:highlighted, .grid-search-result:selected, .grid-search-result:checked, .grid-search-result:active,
.app-folder-dialog .overview-tile:highlighted, .app-folder-dialog .overview-tile:selected,
.app-folder-dialog .overview-tile:checked, .app-folder-dialog .overview-tile:active {
  background-color: st-transparentize(${c}, ${t(1.4)}) !important; }
#dash .dash-item-container .overview-tile:hover .overview-icon, #dash .dash-item-container .show-apps:hover .overview-icon {
  background-color: st-transparentize(${c}, ${t(1)}) !important; }
#dash .dash-item-container .overview-tile:focus .overview-icon, #dash .dash-item-container .show-apps:checked .overview-icon {
  box-shadow: inset 0 0 0 2px ${c} !important; }
.app-folder-dialog { box-shadow: inset 0 0 0 2px st-transparentize(${c}, 0.3) !important; }
`;
}

export class ShellTheme {
    constructor() {
        this._ctx = St.ThemeContext.get_for_stage(global.stage);
        this._outDefault = file(GLib.build_filenamev([cacheDir(), OUT_DEFAULT]));
        this._outApp = file(GLib.build_filenamev([cacheDir(), OUT_APP]));
        this._outExtras = file(GLib.build_filenamev([cacheDir(), OUT_EXTRAS]));
        this._color = null;
        this._fg = null;
        this._appGrid = true;
        this._tint = 15;
        this._busy = false;
        this._pending = false;
        this._idleId = 0;
        this._cancellable = new Gio.Cancellable();
        this._ctx.connectObject('changed', () => this._onChanged(), this);
    }

    _isOurs(f) {
        return f && (f.equal(this._outDefault) || f.equal(this._outApp));
    }

    _onChanged() {
        if (!this._color || this._busy)
            return;
        const theme = this._ctx.get_theme();
        if (this._isOurs(theme?.default_stylesheet))
            return;
        if (this._idleId)
            return;
        this._idleId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._idleId = 0;
            this._rebuild().catch(e => diag('shell', e));
            return GLib.SOURCE_REMOVE;
        });
    }

    async apply(color, fg, appGrid, tint) {
        this._appGrid = appGrid;
        this._tint = tint;
        this._color = color;
        this._fg = fg;
        await this._rebuild();
    }

    async _rebuild() {
        if (this._busy) {
            this._pending = true;
            return;
        }
        this._busy = true;
        try {
            do {
                this._pending = false;
                await this._rebuildOnce();
            } while (this._pending && !this._cancellable.is_cancelled());
        } finally {
            this._busy = false;
        }
    }

    async _rebuildOnce() {
        const theme = this._ctx.get_theme();
        if (!theme || this._cancellable.is_cancelled())
            return;
        let srcDefault = theme.default_stylesheet;
        let srcApp = theme.application_stylesheet;
        if (this._isOurs(srcDefault))
            srcDefault = this._srcDefault;
        if (this._isOurs(srcApp))
            srcApp = this._srcApp;
        if (!srcDefault)
            return;
        this._srcDefault = srcDefault;
        this._srcApp = srcApp;

        const baseOf = f => f.get_parent()?.get_uri().replace(/\/?$/, '/');
        const defCss = await readText(srcDefault, this._cancellable);
        if (defCss === null || this._cancellable.is_cancelled())
            return;
        await writeText(this._outDefault, substituteAccent(defCss, this._color, this._fg, baseOf(srcDefault)));
        let extras = menusCss(this._color, this._fg);
        if (this._appGrid)
            extras += appGridCss(this._color, this._tint);
        await writeText(this._outExtras, extras);

        let appFile = srcApp;
        if (srcApp) {
            const appCss = await readText(srcApp, this._cancellable);
            if (appCss?.includes('-st-accent')) {
                await writeText(this._outApp, substituteAccent(appCss, this._color, this._fg, baseOf(srcApp)));
                appFile = this._outApp;
            }
        }
        if (this._cancellable.is_cancelled())
            return;

        const current = this._ctx.get_theme();
        const next = new St.Theme({application_stylesheet: appFile, default_stylesheet: this._outDefault});
        for (const sheet of current?.get_custom_stylesheets() ?? []) {
            if (!sheet.equal(this._outExtras))
                next.load_stylesheet(sheet);
        }
        next.load_stylesheet(this._outExtras);
        this._ctx.set_theme(next);
    }

    destroy() {
        if (this._idleId) {
            GLib.source_remove(this._idleId);
            this._idleId = 0;
        }
        this._cancellable.cancel();
        this._ctx.disconnectObject(this);
        const theme = this._ctx.get_theme();
        theme?.unload_stylesheet(this._outExtras);
        if (this._isOurs(theme?.default_stylesheet) || this._isOurs(theme?.application_stylesheet))
            Main.loadTheme();
        this._ctx = null;
    }
}

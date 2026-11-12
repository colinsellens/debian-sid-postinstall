import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {GNOME_PRESETS, foregroundFor, nearestPreset} from './color.js';
import {applyQt, revertQt, notifyKde} from './qt.js';
import * as Apps from './apps.js';
import {applyOpenRgb} from './openrgb.js';
import {ShellTheme} from './shellTheme.js';
import {FocusBorder} from './border.js';
import {InterfaceSettings} from './interface.js';
import {WallpaperWatcher} from './wallpaperWatcher.js';
import {GtkTarget} from './gtkTarget.js';
import {IconTarget} from './iconTarget.js';
import {resolveColor} from './colorSource.js';
import {syncGnomeAccent, restoreGnomeAccent} from './gnomeAccent.js';
import {diag, withTimeout} from './diag.js';

const APP_TARGETS = {
    mangohud: ['target-mangohud', Apps.applyMangohud, Apps.revertMangohud],
    wine: ['target-wine', Apps.applyWine, Apps.revertWine],
    openrgb: ['target-openrgb', (c, _fg, _dark, cancellable) => applyOpenRgb(c, cancellable), async () => {}],
};

const WATCHED = ['source', 'custom-color', 'gnome-palette', 'shell-appgrid', 'appgrid-tint', 'colored-headerbar',
    'target-icons', 'icon-mix-mode', 'target-border', 'border-width', 'border-hide-maximized',
    ...Object.values(APP_TARGETS).map(([key]) => key)];

const STEP_TIMEOUT = 20000;
const ICONS_TIMEOUT = 180000;
const BORDER_RADIUS = 15;

export class Updater {
    constructor(settings) {
        this._settings = settings;
        this._iface = new InterfaceSettings();
        this._bg = new Gio.Settings({schema_id: 'org.gnome.desktop.background'});
        this._cancellable = new Gio.Cancellable();
        this._gtk = new GtkTarget(this._iface);
        this._icons = new IconTarget(settings, this._iface);
        this._wallpaper = new WallpaperWatcher(this._bg, () => this._onWallpaper());
        this._shell = null;
        this._border = null;
        this._qtApplied = false;
        this._appsApplied = new Set();
        this._gen = 0;
        this._timeoutId = 0;
        this._running = false;
        this._rerun = false;

        for (const key of WATCHED)
            this._settings.connectObject(`changed::${key}`, () => this._schedule(), this);
        this._iface.settings.connectObject(
            'changed::color-scheme', () => this._schedule(),
            'changed::gtk-theme', () => {
                if (!this._gtk.flipping && !this._iface.isOwnChange())
                    this._schedule();
            },
            'changed::accent-color', () => {
                if (this._settings.get_string('source') === 'system')
                    this._schedule();
            },
            'changed::icon-theme', () => {
                if (!this._icons.isOwnThemeChange() && !this._iface.isOwnChange())
                    this._schedule();
            }, this);
        this._schedule(0);
    }

    destroy() {
        this._cancellable.cancel();
        this._gen++;
        if (this._timeoutId)
            GLib.source_remove(this._timeoutId);
        this._timeoutId = 0;

        this._settings.disconnectObject(this);
        this._iface.settings.disconnectObject(this);
        this._wallpaper.destroy();

        this._shell?.destroy();
        this._border?.destroy();
        this._gtk.destroy();
        this._icons.destroy();
        restoreGnomeAccent(this._settings, this._iface);
        if (this._qtApplied)
            revertQt().catch(e => diag('qt', e));
        for (const name of this._appsApplied)
            APP_TARGETS[name][2]().catch(e => diag(name, e));

        this._shell = null;
        this._border = null;
        this._gtk = null;
        this._icons = null;
        this._wallpaper = null;
        this._cancellable = null;
        this._settings = null;
        this._iface = null;
        this._bg = null;
    }

    _schedule(delay = 300) {
        if (this._timeoutId)
            GLib.source_remove(this._timeoutId);
        this._timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
            this._timeoutId = 0;
            this._run();
            return GLib.SOURCE_REMOVE;
        });
    }

    _onWallpaper() {
        if (this._settings.get_string('source') === 'wallpaper')
            this._schedule(800);
    }

    _run() {
        if (this._running) {
            this._rerun = true;
            return;
        }
        this._running = true;
        this._update().catch(e => diag('update', e)).finally(() => {
            this._running = false;
            if (this._rerun && this._cancellable && !this._cancellable.is_cancelled()) {
                this._rerun = false;
                this._schedule(0);
            }
        });
    }

    async _step(name, apply) {
        const t0 = GLib.get_monotonic_time();
        try {
            await withTimeout(Promise.resolve().then(apply), STEP_TIMEOUT, name, this._cancellable);
            diag(name, `ok ${Math.round((GLib.get_monotonic_time() - t0) / 1000)} ms`);
            return true;
        } catch (e) {
            diag(name, e);
            return false;
        }
    }

    async _update() {
        const gen = ++this._gen;
        const cancellable = this._cancellable;
        const isCurrent = () => gen === this._gen;
        const s = this._settings;
        let color = await resolveColor(s, this._iface, this._bg, cancellable);
        if (!isCurrent())
            return;
        const live = s.get_boolean('gnome-palette') || s.get_string('source') === 'system';
        if (live)
            color = GNOME_PRESETS[nearestPreset(color)];
        const fg = foregroundFor(color);
        const dark = this._iface.get('color-scheme') === 'prefer-dark';
        if (s.get_string('current-color') !== color)
            s.set_string('current-color', color);

        this._shell ??= new ShellTheme();
        await this._step('shell', () => this._shell.apply(color, fg, s.get_boolean('shell-appgrid'), s.get_int('appgrid-tint')));
        if (!isCurrent())
            return;
        this._updateBorder(color);

        const headerbar = s.get_boolean('colored-headerbar');
        await this._step('gtk', () => this._gtk.apply(color, fg, {headerbar, live}, cancellable));
        if (!isCurrent())
            return;
        this._qtApplied = await this._step('qt', async () => {
            await applyQt(color, fg, dark);
            notifyKde();
        }) || this._qtApplied;
        if (!isCurrent())
            return;

        if (s.get_string('source') === 'system')
            restoreGnomeAccent(s, this._iface);
        else
            syncGnomeAccent(s, this._iface, color);

        if (s.get_boolean('target-icons')) {
            await withTimeout(this._icons.apply(color, cancellable, isCurrent), ICONS_TIMEOUT, 'icons', cancellable)
                .catch(e => diag('icons', e));
        } else {
            this._icons.revert();
        }
        for (const [name, [key, apply, revert]] of Object.entries(APP_TARGETS)) {
            if (!isCurrent())
                return;
            await this._updateApp(name, s.get_boolean(key), () => apply(color, fg, dark, cancellable), revert);
        }
    }

    _updateBorder(color) {
        const s = this._settings;
        if (!s.get_boolean('target-border')) {
            this._border?.destroy();
            this._border = null;
            return;
        }
        this._border ??= new FocusBorder();
        this._border.configure({
            color,
            width: s.get_int('border-width'),
            radius: BORDER_RADIUS,
            hideMaximized: s.get_boolean('border-hide-maximized'),
        });
    }

    async _updateApp(name, enabled, apply, revert) {
        if (enabled) {
            if (await this._step(name, apply))
                this._appsApplied.add(name);
            return;
        }
        await revert().catch(e => diag(name, e));
        this._appsApplied.delete(name);
    }
}

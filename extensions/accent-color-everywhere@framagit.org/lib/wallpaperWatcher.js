import Gio from 'gi://Gio';

import {diag} from './diag.js';

export class WallpaperWatcher {
    constructor(bg, onChange) {
        this._bg = bg;
        this._onChange = onChange;
        this._monitors = [];
        this._bg.connectObject(
            'changed::picture-uri', () => this._rewatch(),
            'changed::picture-uri-dark', () => this._rewatch(), this);
        this._watch();
    }

    destroy() {
        this._bg.disconnectObject(this);
        this._unwatch();
        this._bg = null;
        this._onChange = null;
    }

    _rewatch() {
        this._watch();
        this._onChange();
    }

    _unwatch() {
        for (const m of this._monitors) {
            m.disconnectObject(this);
            m.cancel();
        }
        this._monitors = [];
    }

    _watch() {
        this._unwatch();
        const uris = new Set([this._bg.get_string('picture-uri'), this._bg.get_string('picture-uri-dark')]);
        for (const uri of uris) {
            if (!uri.startsWith('file://'))
                continue;
            try {
                const m = Gio.File.new_for_uri(uri).monitor_file(Gio.FileMonitorFlags.WATCH_MOVES, null);
                m.connectObject('changed', (_m, _f, _o, ev) => {
                    if (ev !== Gio.FileMonitorEvent.ATTRIBUTE_CHANGED && ev !== Gio.FileMonitorEvent.DELETED)
                        this._onChange();
                }, this);
                this._monitors.push(m);
            } catch (e) {
                diag('monitor', e);
            }
        }
    }
}

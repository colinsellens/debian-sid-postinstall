import GLib from 'gi://GLib';

import {file, writeText, cacheDir} from './fileio.js';

const lines = [];
let flushing = null;

export function diag(what, msg) {
    const t = GLib.DateTime.new_now_local().format('%H:%M:%S.%f').slice(0, 12);
    const text = msg instanceof Error ? `${msg.message}\n${msg.stack ?? ''}` : String(msg);
    lines.push(`${t} ${what}: ${text}`);
    if (lines.length > 300)
        lines.splice(0, lines.length - 300);
    console.debug(`[accent-color-everywhere] ${what}: ${text}`);
    flushing ??= Promise.resolve()
        .then(() => writeText(file(GLib.build_filenamev([cacheDir(), 'log.txt'])), `${lines.join('\n')}\n`))
        .catch(() => {})
        .finally(() => {
            flushing = null;
        });
}

export function withTimeout(promise, ms, name, cancellable) {
    let id = 0;
    let cancelId = 0;
    const timer = new Promise((_, reject) => {
        id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
            id = 0;
            reject(new Error(`${name}: timeout after ${ms} ms`));
            return GLib.SOURCE_REMOVE;
        });
        cancelId = cancellable.connect(() => {
            if (id)
                GLib.source_remove(id);
            id = 0;
            reject(new Error(`${name}: cancelled`));
        });
    });
    return Promise.race([promise, timer]).finally(() => {
        if (id)
            GLib.source_remove(id);
        id = 0;
        cancellable.disconnect(cancelId);
    });
}

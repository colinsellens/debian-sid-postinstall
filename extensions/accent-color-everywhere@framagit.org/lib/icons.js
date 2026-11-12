import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {file, readText, writeText, listDir, runPool, removeTree, move} from './fileio.js';
import {FOLDER_NAME_RE, CANONICAL_RE, countColors, detectFamily, buildColorMap, recolorSvg, hasHighlightClass} from './svgRecolor.js';

export const SUFFIX = '-Accent';
const FOLDER_CONTEXTS = ['places', 'mimetypes'];

export const outName = base => `${base}${SUFFIX}`;
export const baseOf = name => name.endsWith(SUFFIX) ? name.slice(0, -SUFFIX.length) : name;

const userIconsDir = () => GLib.build_filenamev([GLib.get_user_data_dir(), 'icons']);

function iconRoots() {
    return [
        userIconsDir(),
        GLib.build_filenamev([GLib.get_home_dir(), '.icons']),
        ...GLib.get_system_data_dirs().map(d => GLib.build_filenamev([d, 'icons'])),
    ];
}

function keyFile(text) {
    const kf = new GLib.KeyFile();
    kf.load_from_data(text, new TextEncoder().encode(text).length, GLib.KeyFileFlags.NONE);
    return kf;
}

const getList = (kf, g, k) => {
    try {
        return kf.get_string(g, k).split(',').map(s => s.trim()).filter(Boolean);
    } catch {
        return [];
    }
};

const getStr = (kf, g, k) => {
    try {
        return kf.get_string(g, k);
    } catch {
        return '';
    }
};

async function findTheme(name, cancellable) {
    for (const root of iconRoots()) {
        if (root.startsWith(userIconsDir()) && name.endsWith(SUFFIX))
            continue;
        const dir = GLib.build_filenamev([root, name]);
        const text = await readText(file(GLib.build_filenamev([dir, 'index.theme'])), cancellable).catch(() => null);
        if (text !== null)
            return {name, dir, kf: keyFile(text)};
    }
    return null;
}

export class IconRecolor {
    constructor() {
        this._scans = new Map();
    }

    async _scan(base, cancellable) {
        if (this._scans.has(base))
            return this._scans.get(base);
        const chain = [];
        const queue = [base];
        const seen = new Set();
        while (queue.length) {
            const name = queue.shift();
            if (seen.has(name) || name === 'hicolor')
                continue;
            seen.add(name);
            const theme = await findTheme(name, cancellable);
            if (!theme)
                continue;
            chain.push(theme);
            queue.push(...getList(theme.kf, 'Icon Theme', 'Inherits'));
        }
        if (chain.length === 0)
            return null;

        const files = new Map();
        const highlightCandidates = [];
        for (const [idx, theme] of chain.entries()) {
            const scaled = new Set(getList(theme.kf, 'Icon Theme', 'ScaledDirectories'));
            const dirs = [...new Set([...getList(theme.kf, 'Icon Theme', 'Directories'), ...scaled])];
            for (const d of dirs) {
                const context = getStr(theme.kf, d, 'Context').toLowerCase();
                const large = getStr(theme.kf, d, 'Type').toLowerCase() === 'scalable' ||
                    parseInt(getStr(theme.kf, d, 'Size') || '0') >= 32;
                const entries = await listDir(file(GLib.build_filenamev([theme.dir, d])), cancellable);
                for (const e of entries) {
                    if (e.type !== Gio.FileType.REGULAR || !e.name.endsWith('.svg') || e.name.includes('-symbolic'))
                        continue;
                    const key = `${d}/${e.name}`;
                    if (files.has(key))
                        continue;
                    const entry = {key, dir: d, path: GLib.build_filenamev([theme.dir, d, e.name]), theme: idx, scaled: scaled.has(d)};
                    if (FOLDER_CONTEXTS.includes(context) && FOLDER_NAME_RE.test(e.name)) {
                        entry.folder = true;
                        entry.sample = large && CANONICAL_RE.test(e.name);
                        files.set(key, entry);
                    } else if (idx === 0) {
                        highlightCandidates.push(entry);
                    }
                }
            }
        }

        const counts = new Map();
        const folders = [...files.values()];
        let withHighlight = 0;
        await runPool(folders, 16, async e => {
            const t = await readText(file(e.path), cancellable).catch(() => null);
            if (!t)
                return;
            if (e.sample)
                countColors(t, counts);
            if (hasHighlightClass(t))
                withHighlight++;
        });
        await runPool(highlightCandidates, 16, async e => {
            const t = await readText(file(e.path), cancellable).catch(() => null);
            if (t && hasHighlightClass(t))
                files.set(e.key, e);
        });

        const result = {
            chain,
            files: [...files.values()],
            highlight: folders.length > 0 && withHighlight / folders.length >= 0.5,
            family: detectFamily(counts),
        };
        this._scans.set(base, result);
        return result;
    }

    async generate(base, accent, mixMode = 'body', cancellable = null) {
        const scan = await this._scan(base, cancellable);
        if (!scan || scan.files.length === 0)
            return false;
        const useHighlight = !scan.highlight || mixMode !== 'secondary';
        const useFamily = !scan.highlight || mixMode !== 'body';
        const colorMap = useFamily ? buildColorMap(scan.family, accent) : new Map();
        const finalDir = GLib.build_filenamev([userIconsDir(), outName(base)]);
        for (const e of await listDir(file(userIconsDir()))) {
            if (e.name.startsWith(`${outName(base)}.tmp`))
                await removeTree(file(GLib.build_filenamev([userIconsDir(), e.name])));
        }
        const outDir = `${finalDir}.tmp-${GLib.get_monotonic_time()}`;

        const used = new Map();
        await runPool(scan.files, 16, async e => {
            const t = await readText(file(e.path), cancellable).catch(() => null);
            if (!t)
                return;
            const out = recolorSvg(t, e.folder ? colorMap : new Map(), accent, useHighlight);
            if (out === t)
                return;
            await writeText(file(GLib.build_filenamev([outDir, e.key])), out, cancellable);
            if (!used.has(e.dir))
                used.set(e.dir, e);
        });
        if (used.size === 0)
            return false;

        const dirs = [...used.keys()].sort();
        let index = `[Icon Theme]\nName=${base} Accent\nComment=${base} recolored by Accent Color Everywhere\nInherits=${base}\n`;
        index += `Directories=${dirs.filter(d => !used.get(d).scaled).join(',')}\n`;
        const scaledDirs = dirs.filter(d => used.get(d).scaled);
        if (scaledDirs.length)
            index += `ScaledDirectories=${scaledDirs.join(',')}\n`;
        for (const d of dirs) {
            const kf = scan.chain[used.get(d).theme].kf;
            index += `\n[${d}]\n`;
            let keys = [];
            try {
                [keys] = kf.get_keys(d);
            } catch {
            }
            for (const k of keys)
                index += `${k}=${kf.get_value(d, k)}\n`;
        }
        await writeText(file(GLib.build_filenamev([outDir, 'index.theme'])), index, cancellable);
        await removeTree(file(finalDir));
        await move(file(outDir), file(finalDir));
        return true;
    }

    async remove(base) {
        await removeTree(file(GLib.build_filenamev([userIconsDir(), outName(base)])));
    }

    isMixed(base) {
        const scan = this._scans.get(base);
        return Boolean(scan?.highlight && scan.family);
    }

    forget(base) {
        this._scans.delete(base);
    }
}

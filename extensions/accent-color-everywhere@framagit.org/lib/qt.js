import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {hexToRgb, adjust} from './color.js';
import {file, readText, writeText, stateDir, remove, listDir} from './fileio.js';
import {iniGet, iniSet} from './ini.js';
import {diag} from './diag.js';

export const SCHEME_NAME = 'AccentColorEverywhere';

const KDEGLOBALS = () => file(GLib.build_filenamev([GLib.get_user_config_dir(), 'kdeglobals']));
const BACKUP = () => file(GLib.build_filenamev([stateDir(), 'kdeglobals-backup.json']));
const SCHEME_FILE = () => file(GLib.build_filenamev([GLib.get_user_data_dir(), 'color-schemes', `${SCHEME_NAME}.colors`]));

const BASE = {
    dark: {
        fg: '#fcfcfc', fgInactive: '#a1a9b1',
        window: ['#202326', '#292c30'], view: ['#141618', '#1d1f22'], button: ['#292c30', '#2c3034'],
        header: ['#292c30', '#202326'], tooltip: ['#292c30', '#202326'], complementary: ['#171a1d', '#1e2125'],
        wm: ['#272c31', '#202428'],
    },
    light: {
        fg: '#232629', fgInactive: '#707d8a',
        window: ['#eff0f1', '#e3e5e7'], view: ['#ffffff', '#f7f7f7'], button: ['#fcfcfc', '#a3d4fa'],
        header: ['#dee0e2', '#eff0f1'], tooltip: ['#f7f7f7', '#eff0f1'], complementary: ['#2a2e32', '#1b1e20'],
        wm: ['#dee0e2', '#eff0f1'],
    },
};

const SETS = {
    'Colors:Window': 'window', 'Colors:View': 'view', 'Colors:Button': 'button',
    'Colors:Header': 'header', 'Colors:Tooltip': 'tooltip', 'Colors:Complementary': 'complementary',
};

const triplet = hex => {
    const {r, g, b} = hexToRgb(hex);
    return `${r},${g},${b}`;
};

export function schemeEntries(c, fg, dark) {
    const b = BASE[dark ? 'dark' : 'light'];
    const link = adjust(c, {dl: dark ? 0.12 : -0.08});
    const shared = (normal, inactive) => ({
        ForegroundNormal: normal, ForegroundInactive: inactive, ForegroundActive: c, ForegroundLink: link,
        ForegroundVisited: adjust(link, {ds: -0.25}), ForegroundNegative: '#da4453', ForegroundNeutral: '#f67400',
        ForegroundPositive: '#27ae60', DecorationFocus: c, DecorationHover: c,
    });
    const list = [];
    const push = (group, obj) => {
        for (const [k, v] of Object.entries(obj))
            list.push([group, k, v.startsWith('#') ? triplet(v) : v]);
    };
    for (const [group, key] of Object.entries(SETS)) {
        const isCompl = key === 'complementary';
        const [bg, alt] = b[key];
        push(group, {
            BackgroundNormal: bg, BackgroundAlternate: alt,
            ...shared(isCompl ? '#fcfcfc' : b.fg, isCompl ? '#a1a9b1' : b.fgInactive),
        });
    }
    push('Colors:Selection', {
        BackgroundNormal: c, BackgroundAlternate: adjust(c, {dl: -0.12}),
        ...shared(fg, fg), ForegroundActive: fg, ForegroundLink: fg, ForegroundVisited: fg,
    });
    push('WM', {
        activeBackground: b.wm[0], activeForeground: b.fg, activeBlend: b.fg,
        inactiveBackground: b.wm[1], inactiveForeground: b.fgInactive, inactiveBlend: b.fgInactive,
    });
    push('General', {AccentColor: c, ColorScheme: SCHEME_NAME, Name: 'Accent Color Everywhere'});
    push('KDE', {contrast: '4'});
    return list;
}

export async function applyQt(c, fg, dark) {
    const list = schemeEntries(c, fg, dark);

    const scheme = new GLib.KeyFile();
    for (const [g, k, v] of list)
        scheme.set_value(g, k, v);
    await writeText(SCHEME_FILE(), scheme.to_data()[0]);
    await applyAppSchemes().catch(e => diag('app schemes', e));

    let text = await readText(KDEGLOBALS()) ?? '';
    const raw = await readText(BACKUP());
    const backup = raw ? JSON.parse(raw) : [];
    const known = new Set(backup.map(([g, k]) => `${g}/${k}`));
    const targets = list.filter(([g, k]) => g !== 'General' || k !== 'Name');
    for (const [g, k] of targets) {
        if (!known.has(`${g}/${k}`))
            backup.push([g, k, iniGet(text, g, k)]);
    }
    await writeText(BACKUP(), JSON.stringify(backup));
    for (const [g, k, v] of targets)
        text = iniSet(text, g, k, v);
    await writeText(KDEGLOBALS(), text);
}

export async function revertQt() {
    await revertAppSchemes().catch(() => {});
    await remove(SCHEME_FILE());
    const raw = await readText(BACKUP());
    if (raw === null)
        return;
    let text = await readText(KDEGLOBALS());
    if (text !== null) {
        for (const [g, k, v] of JSON.parse(raw))
            text = iniSet(text, g, k, v);
        await writeText(KDEGLOBALS(), text);
    }
    await remove(BACKUP());
}

const APP_BACKUP = () => file(GLib.build_filenamev([stateDir(), 'app-schemes-backup.json']));
const SCHEME_LINE_RE = /^(ColorScheme|ColorSchemePath)=(.*)$/gm;

async function appRcFiles() {
    const dir = GLib.get_user_config_dir();
    const entries = await listDir(file(dir));
    return entries.filter(e => e.name.endsWith('rc') && e.name !== 'kdeglobals')
        .map(e => file(GLib.build_filenamev([dir, e.name])));
}

export async function applyAppSchemes() {
    const raw = await readText(APP_BACKUP());
    const backup = raw ? JSON.parse(raw) : {};
    const changed = [];
    for (const f of await appRcFiles()) {
        const text = await readText(f).catch(() => null);
        if (!text || !/^ColorSchemePath=/m.test(text))
            continue;
        const path = f.get_path();
        if (!backup[path]) {
            backup[path] = {};
            for (const [, k, v] of text.matchAll(SCHEME_LINE_RE))
                backup[path][k] = v;
        }
        const out = text.replace(SCHEME_LINE_RE, (_m, k) =>
            k === 'ColorScheme' ? `ColorScheme=${SCHEME_NAME}` : `ColorSchemePath=${SCHEME_NAME}.colors`);
        if (out !== text) {
            await writeText(f, out);
            changed.push(path);
        }
    }
    await writeText(APP_BACKUP(), JSON.stringify(backup));
    return changed;
}

export async function revertAppSchemes() {
    const raw = await readText(APP_BACKUP());
    if (raw === null)
        return;
    for (const [path, values] of Object.entries(JSON.parse(raw))) {
        const f = file(path);
        const text = await readText(f).catch(() => null);
        if (!text)
            continue;
        const out = text.replace(SCHEME_LINE_RE, (m, k) => values[k] !== undefined ? `${k}=${values[k]}` : m);
        if (out !== text)
            await writeText(f, out);
    }
    await remove(APP_BACKUP());
}

export function notifyKde() {
    const bus = Gio.DBus.session;
    try {
        bus.emit_signal(null, '/KGlobalSettings', 'org.kde.KGlobalSettings', 'notifyChange', new GLib.Variant('(ii)', [0, 0]));
        bus.emit_signal(null, '/kdeglobals', 'org.kde.kconfig.notify', 'ConfigChanged',
            new GLib.Variant('(a{saas})', [{General: ['ColorScheme', 'AccentColor'], 'Colors:Selection': ['BackgroundNormal'],
                'Colors:View': ['DecorationFocus'], 'Colors:Window': ['DecorationFocus']}]));
    } catch (e) {
        diag('kde notify', e);
    }
}

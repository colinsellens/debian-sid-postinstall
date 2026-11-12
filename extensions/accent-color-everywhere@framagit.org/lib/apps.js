import GLib from 'gi://GLib';

import {adjust, hexToRgb} from './color.js';
import {file, readText, writeText, remove, exists, listDir} from './fileio.js';

const cfg = (...p) => GLib.build_filenamev([GLib.get_user_config_dir(), ...p]);
const data = (...p) => GLib.build_filenamev([GLib.get_user_data_dir(), ...p]);
const shades = c => ({l1: adjust(c, {dl: 0.1}), l2: adjust(c, {dl: 0.2})});

async function readJson(f) {
    const text = await readText(f).catch(() => null);
    if (text === null)
        return {};
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

const MANGO_FILE = () => file(cfg('MangoHud', 'MangoHud.conf'));
const MANGO_STATE = () => file(GLib.build_filenamev([GLib.get_user_state_dir(), 'accent-color-everywhere', 'mangohud.json']));

export function mangoValues(c) {
    const s = shades(c);
    const h = x => x.slice(1);
    return {
        gpu_color: h(c), cpu_color: h(s.l1), engine_color: h(c), frametime_color: h(c),
        vram_color: h(s.l2), ram_color: h(s.l2),
    };
}

export function setConfKey(text, key, value) {
    const re = new RegExp(`^#?\\s*${key}\\s*=.*$`, 'm');
    if (value === null)
        return text.replace(new RegExp(`^${key}\\s*=.*\\n?`, 'm'), '');
    if (re.test(text))
        return text.replace(re, `${key}=${value}`);
    return `${text}${text.endsWith('\n') || text === '' ? '' : '\n'}${key}=${value}\n`;
}

export async function applyMangohud(c) {
    const text = await readText(MANGO_FILE());
    if (text === null)
        return false;
    const values = mangoValues(c);
    if (!await readText(MANGO_STATE())) {
        const backup = {};
        for (const k of Object.keys(values))
            backup[k] = text.match(new RegExp(`^${k}\\s*=\\s*(.*)$`, 'm'))?.[1] ?? null;
        await writeText(MANGO_STATE(), JSON.stringify(backup));
    }
    let out = text;
    for (const [k, v] of Object.entries(values))
        out = setConfKey(out, k, v);
    if (out !== text)
        await writeText(MANGO_FILE(), out);
    return true;
}

export async function revertMangohud() {
    const backup = await readJson(MANGO_STATE());
    const text = await readText(MANGO_FILE());
    if (backup && text !== null && Object.keys(backup).length) {
        let out = text;
        for (const [k, v] of Object.entries(backup))
            out = setConfKey(out, k, v);
        await writeText(MANGO_FILE(), out);
    }
    await remove(MANGO_STATE());
}

const WINE_SECTION = '[Control Panel\\\\Colors]';
const WINE_STATE = () => file(GLib.build_filenamev([GLib.get_user_state_dir(), 'accent-color-everywhere', 'wine.json']));

async function winePrefixes() {
    const home = GLib.get_home_dir();
    const direct = [GLib.build_filenamev([home, '.wine'])];
    const parents = [
        data('wineprefixes'), GLib.build_filenamev([home, 'Faugus']), GLib.build_filenamev([home, 'Games']),
        GLib.build_filenamev([home, 'Games', 'Heroic', 'Prefixes']), GLib.build_filenamev([home, 'Games', 'Heroic', 'Prefixes', 'default']),
    ];
    for (const p of parents) {
        for (const e of await listDir(file(p)))
            direct.push(GLib.build_filenamev([p, e.name]), GLib.build_filenamev([p, e.name, 'pfx']));
    }
    const out = [];
    for (const d of direct) {
        const reg = GLib.build_filenamev([d, 'user.reg']);
        if (await exists(file(reg)) && !out.includes(reg))
            out.push(reg);
    }
    return out;
}

const regTriplet = hex => {
    const {r, g, b} = hexToRgb(hex);
    return `${r} ${g} ${b}`;
};

export function regSet(text, values) {
    const lines = text.split('\n');
    let start = lines.findIndex(l => l.startsWith(WINE_SECTION));
    if (start < 0) {
        while (lines.length && lines[lines.length - 1] === '')
            lines.pop();
        lines.push('', `${WINE_SECTION} ${Math.floor(Date.now() / 1000)}`);
        start = lines.length - 1;
        lines.push('');
    }
    let end = start + 1;
    while (end < lines.length && !lines[end].startsWith('['))
        end++;
    for (const [k, v] of Object.entries(values)) {
        const idx = lines.slice(start + 1, end).findIndex(l => l.startsWith(`"${k}"=`));
        if (idx >= 0) {
            if (v === null) {
                lines.splice(start + 1 + idx, 1);
                end--;
            } else {
                lines[start + 1 + idx] = `"${k}"="${v}"`;
            }
        } else if (v !== null) {
            let at = end;
            while (at > start + 1 && lines[at - 1] === '')
                at--;
            lines.splice(at, 0, `"${k}"="${v}"`);
            end++;
        }
    }
    return lines.join('\n');
}

function regGet(text, key) {
    const lines = text.split('\n');
    const start = lines.findIndex(l => l.startsWith(WINE_SECTION));
    if (start < 0)
        return null;
    for (let i = start + 1; i < lines.length && !lines[i].startsWith('['); i++) {
        const m = lines[i].match(new RegExp(`^"${key}"="(.*)"$`));
        if (m)
            return m[1];
    }
    return null;
}

export async function applyWine(c, fg) {
    const values = {
        Hilight: regTriplet(c), MenuHilight: regTriplet(c), HotTrackingColor: regTriplet(c), HilightText: regTriplet(fg),
    };
    const state = await readJson(WINE_STATE()) ?? {};
    const regs = await winePrefixes();
    for (const reg of regs) {
        const f = file(reg);
        const text = await readText(f);
        if (text === null)
            continue;
        if (!state[reg]) {
            state[reg] = {};
            for (const k of Object.keys(values))
                state[reg][k] = regGet(text, k);
        }
        const out = regSet(text, values);
        if (out !== text)
            await writeText(f, out);
    }
    await writeText(WINE_STATE(), JSON.stringify(state));
    return regs.length > 0;
}

export async function revertWine() {
    const state = await readJson(WINE_STATE()) ?? {};
    for (const [reg, values] of Object.entries(state)) {
        const f = file(reg);
        const text = await readText(f);
        if (text !== null)
            await writeText(f, regSet(text, values));
    }
    await remove(WINE_STATE());
}

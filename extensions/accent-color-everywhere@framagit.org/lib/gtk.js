import GLib from 'gi://GLib';

import {adjust} from './color.js';
import {file, readText, writeText, remove, listDir, removeTree} from './fileio.js';

const OWN_CSS = 'accent-color-everywhere.css';
const IMPORT_LINE = `@import url("${OWN_CSS}");`;

const configDir = v => GLib.build_filenamev([GLib.get_user_config_dir(), `gtk-${v}.0`]);

function namedColors(c, fg, names) {
    return names.map(n => `@define-color ${n} ${c};`).join('\n') +
        `\n@define-color accent_fg_color ${fg};\n@define-color theme_selected_fg_color ${fg};\n@define-color selected_fg_color ${fg};\n`;
}

function headerbarCss(c, fg, backdrop) {
    return `
headerbar, .titlebar { background: ${c}; background-image: none; color: ${fg}; }
headerbar:backdrop, .titlebar:backdrop { background: ${backdrop}; }
headerbar label, headerbar image, .titlebar label { color: ${fg}; }
`;
}

const mix = (c, a) => `color-mix(in srgb, ${c} ${Math.round(a * 100)}%, transparent)`;

export function gtk4Css(color, fgColor, {headerbar, live = false}) {
    const c = live ? 'var(--accent-bg-color)' : color;
    const fg = live ? 'var(--accent-fg-color)' : fgColor;
    let css = '';
    if (!live) {
        css += namedColors(c, fg, ['accent_color', 'accent_bg_color']);
        css += `:root { --accent-bg-color: ${c}; --accent-fg-color: ${fg}; }\n`;
    }
    const base = live ? '@accent_bg_color' : color;
    css += `
.nautilus-list-view listview, .nautilus-grid-view gridview, .nautilus-network-view listview,
filechooser columnview > listview, filechooser gridview, filechooser placesview > stack > scrolledwindow list {
  --accent-bg-color: ${base};
  --accent-color: oklab(from var(--accent-bg-color) var(--standalone-color-oklab));
}
row:selected, row.activatable:selected, listview > row:selected, columnview > listview > row:selected,
gridview > child:selected, flowbox > flowboxchild:selected, flowboxchild:selected,
.navigation-sidebar > row:selected, placessidebar row:selected, .boxed-list > row:selected {
  background-color: ${mix(c, 0.35)}; }
row:selected:hover, gridview > child:selected:hover, flowboxchild:selected:hover,
.navigation-sidebar > row:selected:hover {
  background-color: ${mix(c, 0.45)}; }
flowboxchild:hover, gridview > child:hover { background-color: ${mix(c, 0.15)}; }
button.toggle:checked, togglebutton:checked, toggle-group > toggle:checked,
viewswitcher button:checked, stackswitcher > button:checked, .linked > button:checked {
  background-color: ${mix(c, 0.4)}; }
button.toggle:checked:hover, toggle-group > toggle:checked:hover, viewswitcher button:checked:hover {
  background-color: ${mix(c, 0.5)}; }
popover.menu modelbutton:hover, popover.menu modelbutton:focus, popover.menu row:hover,
popover.menu modelbutton:selected, popover.menu box.inline-buttons button:hover {
  background-color: ${c}; color: ${fg}; }
popover.menu modelbutton:hover label, popover.menu modelbutton:hover arrow, popover.menu modelbutton:hover accelerator { color: ${fg}; }
`;
    if (headerbar) {
        const backdrop = `color-mix(in srgb, ${c} 75%, var(--window-bg-color))`;
        css += `:root { --headerbar-bg-color: ${c}; --headerbar-fg-color: ${fg}; --headerbar-backdrop-color: ${backdrop}; }\n`;
        css += headerbarCss(c, fg, backdrop);
        css += `toolbarview > .top-bar { background-color: ${c}; color: ${fg}; }
toolbarview > .top-bar:backdrop { background-color: ${backdrop}; }
`;
    }
    return css;
}

export function gtk3Css(c, fg, {headerbar}) {
    const dark = adjust(c, {dl: -0.08});
    const light = adjust(c, {dl: 0.12});
    let css = namedColors(c, fg, ['accent_color', 'accent_bg_color', 'theme_selected_bg_color',
        'selected_bg_color', 'theme_base_selected_bg_color', 'link_color', 'wm_highlight']);
    css += `
selection, *:selected, *:selected:focus, row:selected, treeview.view:selected, iconview:selected,
flowboxchild:selected, entry selection, textview text selection, calendar:selected {
  background-color: ${c}; color: ${fg};
}
menu menuitem:hover, .menu menuitem:hover, menuitem:hover, .menuitem:hover, menubar > menuitem:hover,
.context-menu menuitem:hover, combobox window menu menuitem:hover {
  background-color: ${c}; background-image: none; color: ${fg}; box-shadow: none;
}
menuitem:hover > label, menuitem:hover accelerator, menuitem:hover arrow, menubar > menuitem:hover > label { color: ${fg}; }
row:selected label, menuitem:hover label { color: ${fg}; }
switch:checked { background-color: ${c}; background-image: none; border-color: ${dark}; }
check:checked, radio:checked, check:indeterminate, radio:indeterminate,
checkbutton check:checked, radiobutton radio:checked {
  background-color: ${c}; background-image: none; border-color: ${dark}; color: ${fg};
}
scale highlight, scale trough highlight, progressbar progress, levelbar block.filled:not(.low):not(.high),
spinbutton:focus, entry:focus {
  border-color: ${c};
}
scale highlight, scale trough highlight, progressbar progress, levelbar block.filled:not(.low):not(.high) {
  background-color: ${c}; background-image: none;
}
button.suggested-action, button.default:focus {
  background-color: ${c}; background-image: none; border-color: ${dark}; color: ${fg};
}
button.suggested-action:hover { background-color: ${light}; }
button.suggested-action label { color: ${fg}; }
notebook > header tab:checked { box-shadow: inset 0 -3px ${c}; }
notebook > header.bottom tab:checked { box-shadow: inset 0 3px ${c}; }
stackswitcher button:checked { box-shadow: inset 0 -3px ${c}; }
*:link, link, link:link { color: ${light}; }
`;
    if (headerbar)
        css += headerbarCss(c, fg, `mix(${c}, @theme_bg_color, 0.25)`);
    return css;
}

async function ensureImportIn(path) {
    const f = file(path);
    const text = await readText(f) ?? '';
    if (!text.includes(IMPORT_LINE))
        await writeText(f, `${IMPORT_LINE}\n${text}`);
}

async function dropImportIn(path) {
    const f = file(path);
    const text = await readText(f);
    if (text === null || !text.includes(IMPORT_LINE))
        return;
    const rest = text.split('\n').filter(l => l.trim() !== IMPORT_LINE).join('\n');
    if (rest.trim() === '')
        await remove(f);
    else
        await writeText(f, rest);
}

const userCss = v => GLib.build_filenamev([configDir(v), 'gtk.css']);

export async function applyGtk(v, css) {
    await writeText(file(GLib.build_filenamev([configDir(v), OWN_CSS])), css);
    await ensureImportIn(userCss(v));
}

export async function revertGtk(v) {
    await dropImportIn(userCss(v));
    await remove(file(GLib.build_filenamev([configDir(v), OWN_CSS])));
}

const gimpDirs = () => {
    const base = GLib.build_filenamev([GLib.get_user_config_dir(), 'GIMP']);
    return listDir(file(base)).then(es => es.filter(e => /^\d+\.\d+$/.test(e.name))
        .map(e => GLib.build_filenamev([base, e.name])));
};

export async function applyGimp(css) {
    for (const dir of await gimpDirs()) {
        await writeText(file(GLib.build_filenamev([dir, OWN_CSS])), css);
        await ensureImportIn(GLib.build_filenamev([dir, 'gimp.css']));
    }
}

export async function revertGimp() {
    for (const dir of await gimpDirs()) {
        await dropImportIn(GLib.build_filenamev([dir, 'gimp.css']));
        await remove(file(GLib.build_filenamev([dir, OWN_CSS])));
    }
}

const MARKER = '.accent-color-everywhere';
const userThemes = () => GLib.build_filenamev([GLib.get_user_data_dir(), 'themes']);
const themeRoots = () => [
    userThemes(),
    GLib.build_filenamev([GLib.get_home_dir(), '.themes']),
    ...GLib.get_system_data_dirs().map(d => GLib.build_filenamev([d, 'themes'])),
];

async function findBaseTheme(name) {
    for (const root of themeRoots()) {
        const dir = GLib.build_filenamev([root, name, 'gtk-3.0']);
        if (await readText(file(GLib.build_filenamev([root, name, MARKER]))) !== null)
            continue;
        if (await readText(file(GLib.build_filenamev([dir, 'gtk.css']))) !== null)
            return dir;
    }
    return null;
}

export async function canShadowTheme(name) {
    const own = GLib.build_filenamev([userThemes(), name]);
    if (await readText(file(GLib.build_filenamev([own, MARKER]))) !== null)
        return true;
    return listDir(file(own)).then(es => es.length === 0);
}

export async function applyShadowTheme(name, css) {
    const own = GLib.build_filenamev([userThemes(), name]);
    const base = await findBaseTheme(name);
    let light, dark;
    if (base) {
        light = file(GLib.build_filenamev([base, 'gtk.css'])).get_uri();
        const d = GLib.build_filenamev([base, 'gtk-dark.css']);
        dark = await readText(file(d)) !== null ? file(d).get_uri() : light;
    } else if (/^adwaita(-dark)?$/i.test(name)) {
        light = 'resource:///org/gtk/libgtk/theme/Adwaita/gtk-contained.css';
        dark = 'resource:///org/gtk/libgtk/theme/Adwaita/gtk-contained-dark.css';
        if (/-dark$/i.test(name))
            light = dark;
    } else {
        return false;
    }
    await writeText(file(GLib.build_filenamev([own, MARKER])), 'accent-color-everywhere\n');
    await writeText(file(GLib.build_filenamev([own, 'gtk-3.0', OWN_CSS])), css);
    await writeText(file(GLib.build_filenamev([own, 'gtk-3.0', 'gtk.css'])), `@import url("${light}");\n${IMPORT_LINE}\n`);
    await writeText(file(GLib.build_filenamev([own, 'gtk-3.0', 'gtk-dark.css'])), `@import url("${dark}");\n${IMPORT_LINE}\n`);
    return true;
}

export async function removeShadowThemes() {
    for (const e of await listDir(file(userThemes()))) {
        const dir = GLib.build_filenamev([userThemes(), e.name]);
        if (await readText(file(GLib.build_filenamev([dir, MARKER]))) !== null)
            await removeTree(file(dir));
    }
}

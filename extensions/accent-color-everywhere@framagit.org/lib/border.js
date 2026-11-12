import Meta from 'gi://Meta';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const TYPES = [Meta.WindowType.NORMAL, Meta.WindowType.DIALOG, Meta.WindowType.MODAL_DIALOG];

const isMaximized = w => w.is_maximized();

export class FocusBorder {
    constructor() {
        this._width = 1;
        this._hideMaximized = true;
        this._window = null;
        this._actor = new St.Widget({reactive: false, visible: false});
        global.window_group.add_child(this._actor);
        global.display.connectObject(
            'notify::focus-window', () => this._track(),
            'restacked', () => this._update(), this);
        global.workspace_manager.connectObject('active-workspace-changed', () => this._update(), this);
        Main.overview.connectObject(
            'showing', () => this._actor.hide(),
            'hidden', () => this._update(), this);
        this._track();
    }

    configure({color, width, radius, hideMaximized}) {
        this._width = width;
        this._hideMaximized = hideMaximized;
        this._actor.set_style(`border: ${width}px solid ${color}; border-radius: ${radius + width}px;`);
        this._update();
    }

    _track() {
        this._window?.disconnectObject(this);
        const w = global.display.focus_window;
        this._window = w && TYPES.includes(w.get_window_type()) ? w : null;
        this._window?.connectObject(
            'position-changed', () => this._update(),
            'size-changed', () => this._update(),
            'notify::minimized', () => this._update(),
            'notify::fullscreen', () => this._update(),
            'unmanaged', () => this._track(), this);
        this._update();
    }

    _update() {
        const w = this._window;
        const actor = w?.get_compositor_private();
        if (!w || !actor || Main.overview.visible || w.minimized || w.is_fullscreen() ||
            (this._hideMaximized && isMaximized(w)) ||
            !w.located_on_workspace(global.workspace_manager.get_active_workspace())) {
            this._actor.hide();
            return;
        }
        const r = w.get_frame_rect();
        const b = this._width;
        this._actor.set_position(r.x - b, r.y - b);
        this._actor.set_size(r.width + 2 * b, r.height + 2 * b);
        if (actor.get_parent() === global.window_group)
            global.window_group.set_child_above_sibling(this._actor, actor);
        this._actor.show();
    }

    destroy() {
        this._window?.disconnectObject(this);
        this._window = null;
        global.display.disconnectObject(this);
        global.workspace_manager.disconnectObject(this);
        Main.overview.disconnectObject(this);
        this._actor.destroy();
        this._actor = null;
    }
}

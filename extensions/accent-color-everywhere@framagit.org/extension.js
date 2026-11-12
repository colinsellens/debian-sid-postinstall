import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {Updater} from './lib/updater.js';

export default class AccentColorEverywhere extends Extension {
    enable() {
        this._updater = new Updater(this.getSettings());
    }

    disable() {
        // Also enabled in unlock-dialog: disabling on every screen lock would revert and regenerate all themes and icons.
        this._updater.destroy();
        this._updater = null;
    }
}

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GdkPixbuf from 'gi://GdkPixbuf';

import {dominantFromPixels} from './color.js';
import {readText} from './fileio.js';

Gio._promisify(Gio.File.prototype, 'read_async', 'read_finish');
Gio._promisify(GdkPixbuf.Pixbuf, 'new_from_stream_at_scale_async', 'new_from_stream_finish');

async function slideshowImage(f, cancellable) {
    const xml = await readText(f, cancellable);
    const m = xml?.match(/<(?:file|size)[^>]*>\s*([^<\s][^<]*?)\s*<\/(?:file|size)>/);
    return m ? Gio.File.new_for_path(m[1]) : null;
}

export async function wallpaperColor(uri, cancellable = null) {
    if (!uri)
        return null;
    let f = Gio.File.new_for_uri(uri);
    if (uri.endsWith('.xml'))
        f = await slideshowImage(f, cancellable);
    if (!f)
        return null;
    const stream = await f.read_async(GLib.PRIORITY_DEFAULT, cancellable);
    try {
        const pixbuf = await GdkPixbuf.Pixbuf.new_from_stream_at_scale_async(stream, 96, 96, true, cancellable);
        const data = pixbuf.read_pixel_bytes().toArray();
        return dominantFromPixels(data, pixbuf.get_width(), pixbuf.get_height(),
            pixbuf.get_rowstride(), pixbuf.get_n_channels());
    } finally {
        stream.close_async(GLib.PRIORITY_DEFAULT, null, null);
    }
}

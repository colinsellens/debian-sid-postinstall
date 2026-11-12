import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

Gio._promisify(Gio.File.prototype, 'load_contents_async', 'load_contents_finish');
Gio._promisify(Gio.File.prototype, 'replace_contents_bytes_async', 'replace_contents_finish');
Gio._promisify(Gio.File.prototype, 'make_directory_async', 'make_directory_finish');
Gio._promisify(Gio.File.prototype, 'delete_async', 'delete_finish');
Gio._promisify(Gio.File.prototype, 'query_info_async', 'query_info_finish');
Gio._promisify(Gio.File.prototype, 'enumerate_children_async', 'enumerate_children_finish');
Gio._promisify(Gio.FileEnumerator.prototype, 'next_files_async', 'next_files_finish');
Gio._promisify(Gio.FileEnumerator.prototype, 'close_async', 'close_finish');
Gio._promisify(Gio.File.prototype, 'move_async', 'move_finish');

const decoder = new TextDecoder();
const encoder = new TextEncoder();

export const file = path => Gio.File.new_for_path(path);

export async function readText(f, cancellable = null) {
    try {
        const [bytes] = await f.load_contents_async(cancellable);
        return decoder.decode(bytes);
    } catch (e) {
        if (e instanceof GLib.Error && e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
            return null;
        throw e;
    }
}

export async function writeText(f, text, cancellable = null) {
    await mkdirp(f.get_parent(), cancellable);
    await f.replace_contents_bytes_async(new GLib.Bytes(encoder.encode(text)), null, false,
        Gio.FileCreateFlags.NONE, cancellable);
}

export async function exists(f, cancellable = null) {
    try {
        await f.query_info_async('standard::type', Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT, cancellable);
        return true;
    } catch {
        return false;
    }
}

export async function mkdirp(dir, cancellable = null) {
    if (!dir || await exists(dir, cancellable))
        return;
    await mkdirp(dir.get_parent(), cancellable);
    try {
        await dir.make_directory_async(GLib.PRIORITY_DEFAULT, cancellable);
    } catch (e) {
        if (!(e instanceof GLib.Error && e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS)))
            throw e;
    }
}

export async function remove(f, cancellable = null) {
    try {
        await f.delete_async(GLib.PRIORITY_DEFAULT, cancellable);
    } catch {
    }
}

export async function removeTree(f) {
    let info;
    try {
        info = await f.query_info_async('standard::type', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, GLib.PRIORITY_DEFAULT, null);
    } catch {
        return;
    }
    if (info.get_file_type() === Gio.FileType.DIRECTORY) {
        const children = await listDir(f);
        await runPool(children, 16, e => removeTree(f.get_child(e.name)));
    }
    await remove(f);
}

export async function move(src, dest) {
    await src.move_async(dest, Gio.FileCopyFlags.NONE, GLib.PRIORITY_DEFAULT, null, null);
}

export async function listDir(dir, cancellable = null) {
    const out = [];
    let en;
    try {
        en = await dir.enumerate_children_async('standard::name,standard::type', Gio.FileQueryInfoFlags.NONE,
            GLib.PRIORITY_DEFAULT, cancellable);
    } catch {
        return out;
    }
    for (;;) {
        const infos = await en.next_files_async(100, GLib.PRIORITY_DEFAULT, cancellable);
        if (infos.length === 0)
            break;
        for (const info of infos)
            out.push({name: info.get_name(), type: info.get_file_type()});
    }
    await en.close_async(GLib.PRIORITY_DEFAULT, null).catch(() => {});
    return out;
}

export async function runPool(items, limit, worker) {
    let i = 0;
    const next = async () => {
        while (i < items.length)
            await worker(items[i++]);
    };
    await Promise.all(Array.from({length: Math.min(limit, items.length)}, next));
}

export const stateDir = () => GLib.build_filenamev([GLib.get_user_state_dir(), 'accent-color-everywhere']);
export const cacheDir = () => GLib.build_filenamev([GLib.get_user_cache_dir(), 'accent-color-everywhere']);

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {hexToRgb} from './color.js';

Gio._promisify(Gio.SocketClient.prototype, 'connect_to_host_async', 'connect_to_host_finish');
Gio._promisify(Gio.InputStream.prototype, 'read_bytes_async', 'read_bytes_finish');
Gio._promisify(Gio.OutputStream.prototype, 'write_all_async', 'write_all_finish');
Gio._promisify(Gio.IOStream.prototype, 'close_async', 'close_finish');

const PORT = 6742;
const ID = {COUNT: 0, DATA: 1, CLIENT_NAME: 50, UPDATE_LEDS: 1050, CUSTOM_MODE: 1100};

function header(dev, id, size) {
    const b = new Uint8Array(16);
    const v = new DataView(b.buffer);
    b.set([0x4f, 0x52, 0x47, 0x42]);
    v.setUint32(4, dev, true);
    v.setUint32(8, id, true);
    v.setUint32(12, size, true);
    return b;
}

class Conn {
    async open(cancellable) {
        const client = new Gio.SocketClient({timeout: 2});
        this._c = await client.connect_to_host_async('127.0.0.1', PORT, cancellable);
        this._in = this._c.get_input_stream();
        this._out = this._c.get_output_stream();
        this._cancellable = cancellable;
    }

    async send(dev, id, payload = new Uint8Array(0)) {
        const buf = new Uint8Array(16 + payload.length);
        buf.set(header(dev, id, payload.length));
        buf.set(payload, 16);
        await this._out.write_all_async(buf, GLib.PRIORITY_DEFAULT, this._cancellable);
    }

    async readExact(n) {
        const out = new Uint8Array(n);
        let got = 0;
        while (got < n) {
            const bytes = await this._in.read_bytes_async(n - got, GLib.PRIORITY_DEFAULT, this._cancellable);
            const chunk = bytes.toArray();
            if (chunk.length === 0)
                throw new Error('OpenRGB: connection closed');
            out.set(chunk, got);
            got += chunk.length;
        }
        return out;
    }

    async recv() {
        const h = await this.readExact(16);
        const v = new DataView(h.buffer);
        const size = v.getUint32(12, true);
        return {id: v.getUint32(8, true), data: size ? await this.readExact(size) : new Uint8Array(0)};
    }

    async request(dev, id, payload) {
        await this.send(dev, id, payload);
        for (;;) {
            const r = await this.recv();
            if (r.id === id)
                return r.data;
        }
    }

    close() {
        this._c.close_async(GLib.PRIORITY_DEFAULT, null).catch(() => {});
    }
}

export function ledCountFromData(data) {
    const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let o = 4;
    const u16 = () => {
        const x = v.getUint16(o, true);
        o += 2;
        return x;
    };
    const u32 = () => {
        const x = v.getUint32(o, true);
        o += 4;
        return x;
    };
    const str = () => {
        const n = u16();
        o += n;
    };
    u32();
    for (let i = 0; i < 5; i++)
        str();
    const modes = u16();
    u32();
    for (let i = 0; i < modes; i++) {
        str();
        o += 4 * 9;
        const n = u16();
        o += 4 * n;
    }
    const zones = u16();
    for (let i = 0; i < zones; i++) {
        str();
        o += 4 * 4;
        if (u16() > 0) {
            const h = u32();
            const w = u32();
            o += 4 * h * w;
        }
    }
    const leds = u16();
    for (let i = 0; i < leds; i++) {
        str();
        u32();
    }
    return u16();
}

function ledsPayload(count, hex) {
    const {r, g, b} = hexToRgb(hex);
    const size = 4 + 2 + 4 * count;
    const p = new Uint8Array(size);
    const v = new DataView(p.buffer);
    v.setUint32(0, size, true);
    v.setUint16(4, count, true);
    for (let i = 0; i < count; i++)
        p.set([r, g, b, 0], 6 + 4 * i);
    return p;
}

export async function applyOpenRgb(hex, cancellable = null) {
    const conn = new Conn();
    try {
        await conn.open(cancellable);
    } catch {
        return false;
    }
    try {
        await conn.send(0, ID.CLIENT_NAME, new TextEncoder().encode('Accent Color Everywhere\0'));
        const countData = await conn.request(0, ID.COUNT);
        const count = new DataView(countData.buffer, countData.byteOffset).getUint32(0, true);
        for (let dev = 0; dev < count; dev++) {
            const leds = ledCountFromData(await conn.request(dev, ID.DATA, new Uint8Array(4)));
            if (!leds)
                continue;
            await conn.send(dev, ID.CUSTOM_MODE);
            await conn.send(dev, ID.UPDATE_LEDS, ledsPayload(leds, hex));
        }
        return true;
    } finally {
        conn.close();
    }
}

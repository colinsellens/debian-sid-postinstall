const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function groupRange(lines, group) {
    const start = lines.findIndex(l => l.trim() === `[${group}]`);
    if (start < 0)
        return null;
    let end = start + 1;
    while (end < lines.length && !lines[end].trim().startsWith('['))
        end++;
    return {start, end};
}

function keyIndex(lines, range, key) {
    const re = new RegExp(`^${esc(key)}\\s*=`);
    for (let i = range.start + 1; i < range.end; i++) {
        if (re.test(lines[i]))
            return i;
    }
    return -1;
}

export function iniGet(text, group, key) {
    const lines = text.split('\n');
    const range = groupRange(lines, group);
    if (!range)
        return null;
    const i = keyIndex(lines, range, key);
    return i < 0 ? null : lines[i].slice(lines[i].indexOf('=') + 1);
}

export function iniSet(text, group, key, value) {
    const lines = text.split('\n');
    const range = groupRange(lines, group);
    if (!range) {
        while (lines.length && lines[lines.length - 1].trim() === '')
            lines.pop();
        if (lines.length)
            lines.push('');
        lines.push(`[${group}]`, `${key}=${value}`, '');
        return lines.join('\n');
    }
    const i = keyIndex(lines, range, key);
    if (i >= 0) {
        if (value === null)
            lines.splice(i, 1);
        else
            lines[i] = `${key}=${value}`;
    } else if (value !== null) {
        let at = range.end;
        while (at > range.start + 1 && lines[at - 1].trim() === '')
            at--;
        lines.splice(at, 0, `${key}=${value}`);
    }
    return lines.join('\n');
}

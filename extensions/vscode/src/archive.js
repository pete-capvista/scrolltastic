const { deflateRawSync } = require('node:zlib');

const CRC_TABLE = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  return crc >>> 0;
});

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  const year = Math.max(1980, date.getFullYear());
  return {
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
  };
}

function createZip(entries) {
  if (entries.length > 0xffff) throw new Error('The existing folder has too many entries for a ZIP archive.');
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.path.replaceAll('\\', '/'));
    if (!name.length || entry.path.startsWith('/') || entry.path.split('/').includes('..')) throw new Error(`Invalid archive path: ${entry.path}`);
    const source = Buffer.from(entry.bytes);
    const method = entry.directory ? 0 : 8;
    const compressed = entry.directory ? source : deflateRawSync(source);
    if (source.length > 0xffffffff || compressed.length > 0xffffffff || offset > 0xffffffff) {
      throw new Error('The existing folder is too large for a ZIP archive.');
    }
    const crc = crc32(source);
    const stamp = dosDateTime(entry.mtime ?? new Date());
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(stamp.time, 10);
    local.writeUInt16LE(stamp.date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(source.length, 22);
    local.writeUInt16LE(name.length, 26);
    localParts.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x033f, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(stamp.time, 12);
    central.writeUInt16LE(stamp.date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(source.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(entry.directory ? 0x41ed0010 : 0x81a40000, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + compressed.length;
  }
  const centralSize = centralParts.reduce((size, part) => size + part.length, 0);
  if (centralSize > 0xffffffff || offset > 0xffffffff) throw new Error('The existing folder is too large for a ZIP archive.');
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, ...centralParts, end]);
}

async function collectArchiveEntries(vscode, root, prefix = '') {
  const entries = [];
  const children = await vscode.workspace.fs.readDirectory(root);
  for (const [name, type] of children.sort(([left], [right]) => left.localeCompare(right))) {
    const uri = vscode.Uri.joinPath(root, name);
    const relative = prefix ? `${prefix}/${name}` : name;
    if (type & vscode.FileType.SymbolicLink) throw new Error(`Cannot safely archive symbolic link: ${relative}`);
    if (type & vscode.FileType.Directory) {
      entries.push({ path: `${relative}/`, bytes: Buffer.alloc(0), mtime: new Date((await vscode.workspace.fs.stat(uri)).mtime), directory: true });
      entries.push(...await collectArchiveEntries(vscode, uri, relative));
    }
    else if (type & vscode.FileType.File) {
      const stat = await vscode.workspace.fs.stat(uri);
      entries.push({ path: relative, bytes: Buffer.from(await vscode.workspace.fs.readFile(uri)), mtime: new Date(stat.mtime) });
    }
  }
  return entries;
}

module.exports = { collectArchiveEntries, createZip, crc32 };

export interface ArchiveEntry {
  path: string;
  bytes: Uint8Array;
  mtime?: Date | string | number;
  directory?: boolean;
}

export function crc32(bytes: Iterable<number>): number;
export function createZip(entries: ArchiveEntry[]): Buffer;
export function collectArchiveEntries(
  vscode: unknown,
  root: unknown,
  prefix?: string,
): Promise<ArchiveEntry[]>;

declare const archive: {
  collectArchiveEntries: typeof collectArchiveEntries;
  createZip: typeof createZip;
  crc32: typeof crc32;
};

export default archive;

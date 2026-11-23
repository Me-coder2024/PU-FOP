import { inflateRawSync } from 'node:zlib';
/** Inspect ZIP directory and bounded core XML. Never extract paths to disk. */
export function verifyPptx(bytes: Buffer): void {
  const invalid = () => { throw new Error('Invalid PowerPoint file. Upload a non-encrypted .pptx presentation.'); };
  if (bytes.length < 22 || bytes.readUInt32LE(0) !== 0x04034b50) invalid();
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (bytes.readUInt32LE(i) === 0x06054b50 && i + 22 + bytes.readUInt16LE(i + 20) === bytes.length) { end = i; break; }
  }
  if (end < 0) invalid();
  const count = bytes.readUInt16LE(end + 10);
  let offset = bytes.readUInt32LE(end + 16);
  if (!count || count > 10000 || bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6)) invalid();
  const found = new Map<string, string>();
  const names = new Set<string>();
  let expanded = 0;
  for (let i = 0; i < count; i++) {
    if (offset + 46 > end || bytes.readUInt32LE(offset) !== 0x02014b50) invalid();
    const flags = bytes.readUInt16LE(offset + 8), method = bytes.readUInt16LE(offset + 10);
    const compressed = bytes.readUInt32LE(offset + 20), size = bytes.readUInt32LE(offset + 24);
    const length = bytes.readUInt16LE(offset + 28), extra = bytes.readUInt16LE(offset + 30), comment = bytes.readUInt16LE(offset + 32);
    const local = bytes.readUInt32LE(offset + 42);
    if (offset + 46 + length + extra + comment > end || flags & 1 || ![0,8].includes(method)) invalid();
    const name = bytes.subarray(offset + 46, offset + 46 + length).toString('utf8');
    expanded += size;
    if (names.has(name) || name.includes('..') || name.startsWith('/') || name.includes('\\') || /vbaproject|activex|embeddings/i.test(name) || expanded > 250 * 1024 * 1024) invalid();
    names.add(name);
    if (local + 30 > bytes.length || bytes.readUInt32LE(local) !== 0x04034b50) invalid();
    const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
    if (start + compressed > bytes.length) invalid();
    if (['[Content_Types].xml','ppt/presentation.xml','_rels/.rels'].includes(name)) {
      if (size > 2 * 1024 * 1024) invalid();
      const content = bytes.subarray(start,start + compressed);
      const xml = (method === 8 ? inflateRawSync(content, { maxOutputLength: 2 * 1024 * 1024 }) : content).toString('utf8');
      if (/<!DOCTYPE|<!ENTITY/i.test(xml)) invalid();
      found.set(name,xml);
    }
    offset += 46 + length + extra + comment;
  }
  if (!found.get('[Content_Types].xml')?.includes('application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml') || !found.get('ppt/presentation.xml')?.includes('presentation') || !found.has('_rels/.rels')) invalid();
}

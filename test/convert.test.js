// Run: node --test test/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const FST = require('../fst-core.js');

const fx = (name) => new Uint8Array(fs.readFileSync(path.join(__dirname, 'fixtures', name)));

test('FL25 mixer preset converts to the hand-built FL21 variant byte for byte', () => {
  const r = FST.convert(fx('fl25-main.fst'));
  assert.strictEqual(r.status, 'converted');
  assert.strictEqual(r.fromVersion, '25.1.6.4997');
  assert.strictEqual(r.toVersion, '21.2.3.4004');
  assert.deepStrictEqual(Buffer.from(r.output), Buffer.from(fx('expected-main-fl21.fst')));
});

test('FL25 preset with Edison audio converts byte for byte', () => {
  const r = FST.convert(fx('fl25-rec.fst'));
  assert.deepStrictEqual(Buffer.from(r.output), Buffer.from(fx('expected-rec-fl21.fst')));
});

test('reports the plugin chain by mixer slot', () => {
  const r = FST.convert(fx('fl25-main.fst'));
  assert.strictEqual(r.kind, 'mixer');
  const names = r.plugins.map((p) => `${p.slot}:${p.name}`);
  assert.deepStrictEqual(names.slice(0, 3), ['1:Fruity Parametric EQ 2', '2:Fruity Compressor', '3:Soundgoodizer']);
  assert.ok(names.includes('7:RDeEsser Stereo'));
});

test('flags Parametric EQ 2 v8 as newer than FL 21, leaves same-version plugins clean', () => {
  const r = FST.convert(fx('fl25-main.fst'));
  const eq = r.plugins.find((p) => p.internal === 'Fruity Parametric EQ 2');
  const comp = r.plugins.find((p) => p.internal === 'Fruity Compressor');
  assert.strictEqual(eq.status, 'warn');
  assert.strictEqual(comp.status, 'ok');
});

test('notes the removed FL 24+ field', () => {
  const r = FST.convert(fx('fl25-main.fst'));
  assert.deepStrictEqual(r.removedIds, [169]);
});

test('options can switch each fix off', () => {
  const keep = FST.convert(fx('fl25-main.fst'), { removeUnknown: false, fixWrapper: false });
  // only the 8 version bytes differ from the original
  const orig = fx('fl25-main.fst');
  assert.strictEqual(keep.output.length, orig.length);
  let diff = 0;
  for (let i = 0; i < orig.length; i++) if (orig[i] !== keep.output[i]) diff++;
  assert.strictEqual(diff, 8);
});

test('FL21 preset is left alone', () => {
  const r = FST.convert(fx('fl21-797.fst'));
  assert.strictEqual(r.status, 'compatible');
  assert.deepStrictEqual(Buffer.from(r.output), Buffer.from(fx('fl21-797.fst')));
});

test('FL24 plugin preset for a plugin FL21 lacks converts with a warning', () => {
  const r = FST.convert(fx('fl24-transporter.fst'));
  assert.strictEqual(r.status, 'converted');
  assert.strictEqual(r.kind, 'plugin');
  assert.strictEqual(r.plugins[0].status, 'missing');
  // output must re-parse cleanly as FL21
  const again = FST.convert(r.output);
  assert.strictEqual(again.status, 'compatible');
});

test('rejects files that are not FL presets', () => {
  assert.throws(() => FST.convert(new TextEncoder().encode('hello world, not a preset')), /isn't an FL Studio preset/);
  const cut = fx('fl25-main.fst').slice(0, 300);
  assert.throws(() => FST.convert(cut), /incomplete/);
});

test('zip writer produces an archive that unzips to the same bytes', () => {
  const a = fx('fl21-797.fst');
  const b = fx('fl24-transporter.fst');
  const zip = FST.zip([{ name: 'a b.fst', data: a }, { name: 'ünï.fst', data: b }]);
  const entries = readStoredZip(Buffer.from(zip));
  assert.deepStrictEqual(entries.map((e) => e.name), ['a b.fst', 'ünï.fst']);
  assert.deepStrictEqual(entries[0].data, Buffer.from(a));
  assert.deepStrictEqual(entries[1].data, Buffer.from(b));
  for (const e of entries) assert.strictEqual(e.crc, zlib.crc32(e.data) >>> 0);
});

function readStoredZip(buf) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const out = [];
  for (let i = 0; i < count; i++) {
    assert.strictEqual(buf.readUInt32LE(off), 0x02014b50);
    const crc = buf.readUInt32LE(off + 16);
    const size = buf.readUInt32LE(off + 20);
    const nlen = buf.readUInt16LE(off + 28);
    const elen = buf.readUInt16LE(off + 30);
    const clen = buf.readUInt16LE(off + 32);
    const local = buf.readUInt32LE(off + 42);
    const name = buf.slice(off + 46, off + 46 + nlen).toString('utf8');
    const lnl = buf.readUInt16LE(local + 26);
    const lel = buf.readUInt16LE(local + 28);
    const data = buf.slice(local + 30 + lnl + lel, local + 30 + lnl + lel + size);
    out.push({ name, data, crc });
    off += 46 + nlen + elen + clen;
  }
  return out;
}

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { main } = require('../cli.js');
const { basicChain } = require('./presets.js');

function quietly(fn) {
  const lines = [], log = console.log;
  console.log = (...a) => lines.push(a.join(' '));
  try { return { code: fn(), out: lines.join('\n') }; } finally { console.log = log; }
}

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fst-cli-'));
  const presets = path.join(dir, 'My presets');
  fs.mkdirSync(path.join(presets, 'Vocals'), { recursive: true });
  fs.writeFileSync(path.join(presets, 'Vocals', 'chain.fst'), basicChain(25));
  fs.writeFileSync(path.join(presets, 'old.fst'), basicChain(21));
  return { dir, presets, out: path.join(dir, 'out') };
}

test('converts a folder recursively into the output folder and leaves originals alone', () => {
  const { presets, out } = setup();
  const { code, out: log } = quietly(() => main([presets, '--out', out]));
  assert.strictEqual(code, 0);
  assert.deepStrictEqual(fs.readFileSync(path.join(out, 'My presets', 'Vocals', 'chain.fst')), Buffer.from(basicChain(21)));
  assert.deepStrictEqual(fs.readFileSync(path.join(out, 'My presets', 'old.fst')), Buffer.from(basicChain(21)));
  assert.deepStrictEqual(fs.readFileSync(path.join(presets, 'Vocals', 'chain.fst')), Buffer.from(basicChain(25)));
  assert.match(log, /1 converted, 1 already compatible, 0 failed/);
});

test('dry run writes nothing', () => {
  const { presets, out } = setup();
  const { code } = quietly(() => main([presets, '-o', out, '--dry-run']));
  assert.strictEqual(code, 0);
  assert.strictEqual(fs.existsSync(out), false);
});

test('reports damaged files, keeps going, and exits with 1', () => {
  const { presets, out } = setup();
  fs.writeFileSync(path.join(presets, 'broken.fst'), 'not a preset');
  const { code, out: log } = quietly(() => main([presets, '-o', out]));
  assert.strictEqual(code, 1);
  assert.match(log, /failed\s+My presets[\\/]broken\.fst: This file isn't an FL Studio preset\./);
  assert.ok(fs.existsSync(path.join(out, 'My presets', 'Vocals', 'chain.fst')));
});

test('rejects unknown options', () => {
  assert.throws(() => main(['--frobnicate']), /Unknown option --frobnicate/);
});

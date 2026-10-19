#!/usr/bin/env node
// Command-line version: converts .fst files and folders of them for FL Studio 21.2.3.
const fs = require('node:fs');
const path = require('node:path');
const FST = require('./src/fst-core.js');

const HELP = `Usage: fst-downgrade <file or folder>... [options]

Converts FL Studio presets (.fst) saved in FL 24 or 25 so they open in ${FST.TARGET.label}.
Folders are searched recursively. Originals are never changed: converted presets are
written to the output folder, keeping the folder structure. Presets that already open
in FL 21 are copied as they are, so the output folder is a complete set.

Options:
  -o, --out <folder>   Where to write the presets (default: ./FL21)
  -n, --dry-run        Show what would happen without writing anything
      --keep-unknown   Don't remove settings added after FL 21
      --keep-wrapper   Don't convert VST plugin data to the FL 21 format
  -h, --help           Show this help`;

function parseArgs(argv) {
  const args = { inputs: [], out: 'FL21', dryRun: false, removeUnknown: true, fixWrapper: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') args.help = true;
    else if (a === '-o' || a === '--out') { args.out = argv[++i]; if (!args.out) throw new Error(`${a} needs a folder.`); }
    else if (a === '-n' || a === '--dry-run') args.dryRun = true;
    else if (a === '--keep-unknown') args.removeUnknown = false;
    else if (a === '--keep-wrapper') args.fixWrapper = false;
    else if (a.startsWith('-')) throw new Error(`Unknown option ${a}. Run with --help to see the options.`);
    else args.inputs.push(a);
  }
  return args;
}

// Each job pairs a preset with its path inside the output folder.
function collect(inputs) {
  const jobs = [];
  const walk = (dir, rel) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, path.join(rel, e.name));
      else if (/\.fst$/i.test(e.name)) jobs.push({ src: p, rel: path.join(rel, e.name) });
    }
  };
  for (const input of inputs) {
    if (!fs.existsSync(input)) throw new Error(`${input} doesn't exist.`);
    if (fs.statSync(input).isDirectory()) walk(input, path.basename(path.resolve(input)));
    else jobs.push({ src: input, rel: path.basename(input) });
  }
  return jobs;
}

function main(argv) {
  const args = parseArgs(argv);
  if (args.help || !args.inputs.length) { console.log(HELP); return args.help ? 0 : 1; }
  const jobs = collect(args.inputs);
  if (!jobs.length) { console.log('No .fst presets found.'); return 1; }

  const count = { converted: 0, compatible: 0, failed: 0 };
  for (const job of jobs) {
    let r;
    try { r = FST.convert(new Uint8Array(fs.readFileSync(job.src)), args); }
    catch (err) { count.failed++; console.log(`  failed     ${job.rel}: ${err.message}`); continue; }
    count[r.status]++;
    console.log(`  ${r.status.padEnd(10)} ${job.rel}${r.status === 'converted' ? ` (FL ${r.fromVersion})` : ''}`);
    for (const p of r.plugins) if (p.status !== 'ok') console.log(`             ${p.slot ? `slot ${p.slot}, ` : ''}${p.note}`);
    if (!args.dryRun) {
      const dest = path.join(args.out, job.rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, r.output);
    }
  }
  const where = args.dryRun ? 'Nothing written (dry run).' : `Saved to ${path.resolve(args.out)}`;
  console.log(`\n${count.converted} converted, ${count.compatible} already compatible, ${count.failed} failed. ${where}`);
  return count.failed ? 1 : 0;
}

if (require.main === module) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch (err) { console.error(err.message); process.exitCode = 1; }
}
module.exports = { main };

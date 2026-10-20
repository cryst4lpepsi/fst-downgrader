// FST Downgrader core: rewrites FL Studio .fst presets so FL Studio 21.2.3 can open them.
// Works in the browser (window.FST) and in Node (module.exports) for tests.
(function (root) {
  'use strict';

  const TARGET = { version: '21.2.3.4004', build: 4004, label: 'FL Studio 21.2.3' };

  // Collected from the ~8,600 presets FL 21 and its factory content ship with.
  // Event IDs FL 21 ever writes; anything else was added in a later version.
  const FL21_EVENT_IDS = new Set([0, 9, 10, 11, 15, 17, 18, 19, 20, 21, 22, 23, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 64, 65, 67, 69, 70, 71, 72, 74, 75, 76, 80, 83, 85, 86, 89, 91, 92, 94, 95, 97, 98, 99, 100, 101, 128, 131, 132, 133, 135, 138, 139, 140, 142, 143, 144, 145, 146, 147, 148, 149, 150, 154, 155, 156, 157, 158, 159, 160, 161, 162, 164, 165, 166, 167, 168, 192, 193, 194, 195, 196, 197, 198, 199, 200, 201, 202, 203, 204, 205, 206, 207, 209, 210, 212, 213, 215, 216, 217, 218, 219, 220, 221, 223, 224, 225, 226, 227, 228, 229, 230, 231, 233, 234, 235, 236, 237, 238, 239, 241, 242, 243]);
  // Fruity Wrapper (VST host) state: FL 21 writes v10 with these chunk IDs.
  const FL21_WRAPPER_VERSION = 10;
  const FL21_WRAPPER_CHUNKS = new Set([1, 2, 30, 31, 32, 50, 51, 52, 53, 54, 55, 56, 57]);
  // Native plugins FL 21 ships (its Plugin database), plus the VST wrapper.
  const FL21_PLUGINS = new Set(['3x Osc', 'Audio Clip', 'Autogun', 'Automation Clip', 'BassDrum', 'BeepMap', 'BooBass', 'Control Surface', 'Dashboard', 'DirectWave', 'Distructor', 'Drumaxx', 'Drumpad', 'EQUO', 'Edison', 'Effector', 'FL Keys', 'FL Studio Mobile', 'FLEX', 'FPC', 'Frequency Shifter', 'Frequency Splitter', 'Fruit Kick', 'Fruity Balance', 'Fruity Big Clock', 'Fruity Blood Overdrive', 'Fruity Chorus', 'Fruity Compressor', 'Fruity Convolver', 'Fruity DX10', 'Fruity Dance', 'Fruity Delay 2', 'Fruity Delay 3', 'Fruity Delay Bank', 'Fruity DrumSynth Live', 'Fruity Envelope Controller', 'Fruity Fast Dist', 'Fruity Filter', 'Fruity Flanger', 'Fruity Flangus', 'Fruity Formula Controller', 'Fruity Granulizer', 'Fruity HTML NoteBook', 'Fruity Keyboard Controller', 'Fruity LSD', 'Fruity Limiter', 'Fruity Love Philter', 'Fruity Multiband Compressor', 'Fruity NoteBook', 'Fruity NoteBook 2', 'Fruity PanOMatic', 'Fruity Parametric EQ', 'Fruity Parametric EQ 2', 'Fruity Peak Controller', 'Fruity Phaser', 'Fruity Reeverb 2', 'Fruity Scratcher', 'Fruity Send', 'Fruity Slicer', 'Fruity Soft Clipper', 'Fruity Spectroman', 'Fruity Squeeze', 'Fruity Stereo Enhancer', 'Fruity Stereo Shaper', 'Fruity Video Player', 'Fruity Vocoder', 'Fruity Voltage Controller', 'Fruity WaveShaper', 'Fruity Wrapper', 'Fruity X-Y Controller', 'Fruity X-Y-Z Controller', 'Fruity dB Meter', 'GMS', 'Gross Beat', 'Hardcore', 'Harmless', 'Harmor', 'Hyper Chorus', 'Kepler', 'Layer', 'LuxeVerb', 'MIDI Out', 'Maximus', 'MiniSynth', 'Morphine', 'Multiband Delay', 'Newtime', 'Newtone', 'Ogun', 'Patcher', 'Pitch Shifter', 'Pitcher', 'Plucked!', 'PoiZone', 'Razer Chroma', 'ReWired', 'Sakura', 'Sampler', 'Sawer', 'SimSynth', 'Slicex', 'SoundFont Player', 'Soundgoodizer', 'Sytrus', 'Toxic Biohazard', 'Transient Processor', 'Transistor Bass', 'Tuner', 'VFX Color Mapper', 'VFX Envelope', 'VFX Key Mapper', 'VFX Keyboard Splitter', 'VFX Level Scaler', 'VFX Sequencer', 'Vintage Chorus', 'Vintage Phaser', 'Vocodex', 'Wave Candy', 'Wave Traveller', 'ZGameEditor Visualizer']);
  // Newest settings format FL 21 writes for each native plugin (first 4 bytes of its state).
  // Some plugins pack it as (version << 16) | 3, e.g. Edison 0xd0003 is v13.
  const FL21_STATE_VERSIONS = { '3x Osc': 14, 'Fruity Slicer': 15, 'Fruity PanOMatic': 128, 'Soundgoodizer': 3, 'Fruity Parametric EQ 2': 7, 'Transient Processor': 1, 'Fruity Compressor': 2, 'Fruity Limiter': 7, 'Fruity Fast Dist': 192, 'Pitch Shifter': 7, 'Vintage Chorus': 1, 'Fruity Flanger': 1, 'Patcher': 4, 'EQUO': 4, 'Fruity Delay 3': 1, 'DirectWave': 38, 'Wave Candy': 9, 'Fruity Flangus': 9, 'Fruity Delay Bank': 16, 'Fruity Formula Controller': 4, 'Fruity Balance': 0, 'Fruity Chorus': 1, 'Fruity Stereo Shaper': 0, 'FL Keys': 1, 'Fruity Phaser': 1, 'Harmless': 12, 'FLEX': 1, 'Fruity Vocoder': 2, 'Distructor': 5, 'MIDI Out': 6, 'Fruity NoteBook 2': 0, 'Fruity Soft Clipper': 127, 'Fruity Multiband Compressor': 0, 'Fruity Filter': 2, 'Control Surface': 1, 'Frequency Splitter': 4, 'Fruity Blood Overdrive': 3, 'Fruity Dance': 2, 'Fruit Kick': 1, 'Fruity DX10': 2, 'Fruity Send': 0, 'Frequency Shifter': 4, 'BooBass': 1, 'Fruity Granulizer': 5, 'Transistor Bass': 2, 'Fruity Keyboard Controller': 2, 'Fruity X-Y Controller': 2, 'Razer Chroma': 1, 'Fruity X-Y-Z Controller': 3, 'LuxeVerb': 7, 'Multiband Delay': 4, 'Fruity Squeeze': 0, 'Hyper Chorus': 2, 'Vintage Phaser': 3, 'Fruity LSD': 0, 'Newtime': 1, 'Newtone': 0, 'VFX Color Mapper': 0, 'VFX Key Mapper': 2, 'VFX Level Scaler': 1, 'VFX Sequencer': 2, 'Fruity HTML NoteBook': 1, 'Fruity Spectroman': 100, 'Tuner': 1, 'Fruity DrumSynth Live': 3, 'Dashboard': 2, 'Fruity Voltage Controller': 1, 'ReWired': 1, 'SoundFont Player': 5, 'Kepler': 0, 'BeepMap': 0, 'Plucked!': 128, 'Fruity Video Player': 3,
    'Edison': 0xd0003, 'Fruity Convolver': 0xf0003, 'Fruity Love Philter': 0xc0003, 'Fruity WaveShaper': 0x40003, 'Gross Beat': 0x80003, 'Maximus': 0xf0003 };

  // Newer settings formats whose layout is unchanged from FL 21's, so relabelling the version is
  // enough. EQ2 v8 (FL 24+) is the same 354 bytes as v7, and FL 21 crashes on the v8 label.
  const SAME_LAYOUT = { 'Fruity Parametric EQ 2': { version: 8, size: 354 } };

  const EV = { VERSION: 199, BUILD: 159, PLUGIN_INTERNAL: 201, PLUGIN_NAME: 203, PLUGIN_STATE: 213, SLOT: 98 };
  const FORMAT_KIND = { 64: 'mixer', 48: 'plugin', 32: 'plugin' };

  const NOT_FST = "This file isn't an FL Studio preset.";

  function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }
  function putU32(b, o, v) { b[o] = v & 255; b[o + 1] = (v >>> 8) & 255; b[o + 2] = (v >>> 16) & 255; b[o + 3] = (v >>> 24) & 255; }

  function varlen(n) {
    const out = [];
    do { let c = n & 0x7f; n = Math.floor(n / 128); if (n) c |= 0x80; out.push(c); } while (n);
    return out;
  }

  function decodeName(d) {
    // FL 11+ writes names as UTF-16LE; older presets use 8-bit text.
    const utf16 = d.length >= 2 && d.length % 2 === 0 && d[1] === 0;
    let s = '';
    if (utf16) {
      for (let i = 0; i + 1 < d.length; i += 2) s += String.fromCharCode(d[i] | (d[i + 1] << 8));
    } else {
      for (let i = 0; i < d.length; i++) s += String.fromCharCode(d[i]);
    }
    return s.replace(/\0+$/, '');
  }

  function parse(bytes) {
    if (bytes.length < 22 || String.fromCharCode(...bytes.subarray(0, 4)) !== 'FLhd') throw new Error(NOT_FST);
    const headerLen = u32(bytes, 4);
    const dt = 8 + headerLen;
    if (headerLen < 6 || bytes.length < dt + 8 || String.fromCharCode(...bytes.subarray(dt, dt + 4)) !== 'FLdt') throw new Error(NOT_FST);
    const format = bytes[8] | (bytes[9] << 8);
    const dataStart = dt + 8;
    if (dataStart + u32(bytes, dt + 4) !== bytes.length) throw new Error('This preset is incomplete or damaged (its size doesn\'t match its header).');
    const events = [];
    let off = dataStart;
    while (off < bytes.length) {
      const start = off;
      const id = bytes[off++];
      let value = null, data = null;
      if (id < 64) { value = bytes[off]; off += 1; }
      else if (id < 128) { value = bytes[off] | (bytes[off + 1] << 8); off += 2; }
      else if (id < 192) { value = u32(bytes, off); off += 4; }
      else {
        let n = 0, mul = 1, c;
        do { c = bytes[off++]; n += (c & 0x7f) * mul; mul *= 128; } while (c & 0x80 && off < bytes.length);
        data = bytes.subarray(off, off + n); off += n;
      }
      if (off > bytes.length) throw new Error('This preset is incomplete or damaged (it ends in the middle of a setting).');
      events.push({ id, start, end: off, value, data });
    }
    return { headerEnd: dt + 4, format, events };
  }

  function versionParts(v) { return v.split('.').map((x) => parseInt(x, 10) || 0); }
  function isNewerThanTarget(v) {
    const a = versionParts(v), b = versionParts(TARGET.version);
    for (let i = 0; i < 3; i++) { if ((a[i] || 0) !== b[i]) return (a[i] || 0) > b[i]; }
    return false;
  }

  function newerFormat(p) {
    const known = FL21_STATE_VERSIONS[p.internal], v = p.stateVersion;
    if (known === undefined || v === null) return false;
    if (known > 0xffff) return (v & 0xffff) === 3 && v > known;
    return v < 256 && v > known;
  }

  // Fruity Wrapper state = u32 version, then chunks of (u32 id, u64 size, bytes).
  function wrapperChunksKnown(d) {
    let off = 4;
    while (off + 12 <= d.length) {
      const id = u32(d, off);
      const size = u32(d, off + 4) + u32(d, off + 8) * 2 ** 32;
      if (!FL21_WRAPPER_CHUNKS.has(id)) return false;
      off += 12 + size;
    }
    return off === d.length;
  }

  function convert(bytes, opts) {
    opts = Object.assign({ removeUnknown: true, fixWrapper: true }, opts);
    const { headerEnd, format, events } = parse(bytes);
    const kind = FORMAT_KIND[format] || 'preset';
    const versionEv = events.find((e) => e.id === EV.VERSION);
    const fromVersion = versionEv ? decodeName(versionEv.data) : 'unknown';

    // Read the plugin chain. In mixer presets a slot's plugin events come before its slot marker.
    const plugins = [];
    let cur = null;
    for (const e of events) {
      if (e.id === EV.PLUGIN_INTERNAL) { cur = { internal: decodeName(e.data), name: null, slot: null, stateVersion: null }; plugins.push(cur); }
      else if (e.id === EV.PLUGIN_NAME && cur) cur.name = decodeName(e.data);
      else if (e.id === EV.PLUGIN_STATE && cur && e.data.length >= 4) { cur.stateVersion = u32(e.data, 0); cur.stateEvent = e; }
      else if (e.id === EV.SLOT && kind === 'mixer') { if (cur) cur.slot = e.value + 1; cur = null; }
    }
    for (const p of plugins) {
      p.name = p.name || p.internal;
      if (p.internal === 'Fruity Wrapper') {
        p.status = 'ok';
        p.note = 'VST plugin. It needs to be installed in FL 21 too.';
      } else if (!FL21_PLUGINS.has(p.internal)) {
        p.status = 'missing';
        p.note = `${p.internal} doesn't exist in FL 21, so this slot will be empty.`;
      } else if (SAME_LAYOUT[p.internal] && p.stateVersion === SAME_LAYOUT[p.internal].version && p.stateEvent.data.length === SAME_LAYOUT[p.internal].size) {
        p.status = 'ok';
        p.relabelTo = FL21_STATE_VERSIONS[p.internal];
      } else if (newerFormat(p)) {
        const v = (x) => (x > 0xffff ? x >>> 16 : x);
        p.status = 'warn';
        p.note = `Settings are saved in a newer format (v${v(p.stateVersion)}; FL 21 uses v${v(FL21_STATE_VERSIONS[p.internal])}). FL 21 may load it with default settings or fail to load it.`;
      } else {
        p.status = 'ok';
      }
    }

    const base = { kind, fromVersion, toVersion: TARGET.version, plugins, removedIds: [], wrappersFixed: 0, settingsFixed: 0 };
    // A file already labelled 21.2.3 can still carry newer plugin settings (earlier versions of this tool left EQ2 at v8).
    if (versionEv && !isNewerThanTarget(fromVersion) && !plugins.some((p) => p.relabelTo !== undefined)) {
      return Object.assign(base, { status: 'compatible', toVersion: fromVersion, output: bytes });
    }

    // Rebuild the event stream.
    const parts = [];
    let total = 0;
    const push = (chunk) => { parts.push(chunk); total += chunk.length; };
    const removed = new Set();
    for (const e of events) {
      if (e.id === EV.VERSION) {
        const s = TARGET.version + '\0';
        push(Uint8Array.from([EV.VERSION, ...varlen(s.length), ...Array.from(s, (c) => c.charCodeAt(0))]));
      } else if (e.id === EV.BUILD) {
        const b = new Uint8Array(5); b[0] = EV.BUILD; putU32(b, 1, TARGET.build); push(b);
      } else if (opts.removeUnknown && !FL21_EVENT_IDS.has(e.id)) {
        removed.add(e.id);
      } else if (e.id === EV.PLUGIN_STATE && plugins.some((p) => p.stateEvent === e && p.relabelTo !== undefined)) {
        const raw = bytes.slice(e.start, e.end);
        putU32(raw, raw.length - e.data.length, plugins.find((p) => p.stateEvent === e).relabelTo);
        push(raw); base.settingsFixed++;
      } else if (opts.fixWrapper && e.id === EV.PLUGIN_STATE && plugins.some((p) => p.stateEvent === e && p.internal === 'Fruity Wrapper')
                 && u32(e.data, 0) > FL21_WRAPPER_VERSION && wrapperChunksKnown(e.data)) {
        const raw = bytes.slice(e.start, e.end);
        putU32(raw, raw.length - e.data.length, FL21_WRAPPER_VERSION);
        push(raw); base.wrappersFixed++;
      } else {
        push(bytes.subarray(e.start, e.end));
      }
    }

    const out = new Uint8Array(headerEnd + 4 + total);
    out.set(bytes.subarray(0, headerEnd));
    putU32(out, headerEnd, total);
    let o = headerEnd + 4;
    for (const p of parts) { out.set(p, o); o += p.length; }
    base.removedIds = [...removed].sort((a, b) => a - b);
    return Object.assign(base, { status: 'converted', output: out });
  }

  // Minimal uncompressed ZIP writer for "download all".
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(d) { let c = 0xffffffff; for (let i = 0; i < d.length; i++) c = CRC_TABLE[(c ^ d[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

  function zip(files) {
    const enc = new TextEncoder();
    const locals = [], centrals = [];
    let offset = 0;
    for (const f of files) {
      const name = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
      const lh = new Uint8Array(30 + name.length);
      putU32(lh, 0, 0x04034b50); lh[4] = 20; lh[6] = 0; lh[7] = 0x08; // UTF-8 names
      putU32(lh, 14, crc); putU32(lh, 18, size); putU32(lh, 22, size);
      lh[26] = name.length & 255; lh[27] = name.length >> 8; lh.set(name, 30);
      const ch = new Uint8Array(46 + name.length);
      putU32(ch, 0, 0x02014b50); ch[4] = 20; ch[6] = 20; ch[9] = 0x08;
      putU32(ch, 16, crc); putU32(ch, 20, size); putU32(ch, 24, size);
      ch[28] = name.length & 255; ch[29] = name.length >> 8; putU32(ch, 42, offset); ch.set(name, 46);
      locals.push(lh, f.data); centrals.push(ch);
      offset += lh.length + size;
    }
    const cdSize = centrals.reduce((n, c) => n + c.length, 0);
    const end = new Uint8Array(22);
    putU32(end, 0, 0x06054b50);
    end[8] = end[10] = files.length & 255; end[9] = end[11] = files.length >> 8;
    putU32(end, 12, cdSize); putU32(end, 16, offset);
    return concat([...locals, ...centrals, end]);
  }
  function concat(chunks) {
    const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
    let o = 0; for (const c of chunks) { out.set(c, o); o += c.length; }
    return out;
  }

  const api = { TARGET, convert, zip };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FST = api;
})(typeof window !== 'undefined' ? window : this);

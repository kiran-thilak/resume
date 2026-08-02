// Extracts the text layer from dist/kiran_thilak_resume.pdf the way an ATS parser
// would, and checks the key fields survive. If this prints your resume back at
// you, the PDF is selectable and machine-readable. If it fails, the PDF is an
// image (a screenshot/scan export) and an ATS will read it as blank.
//
// Chrome subsets fonts as Type0/CID, so glyph codes only map back to real
// characters through each font's /ToUnicode CMap. That mapping is exactly what
// text extraction depends on, so this walks it per font rather than guessing.

const fs = require('fs');
const zlib = require('zlib');
const { PDF_FILE } = require('../src/paths');

if (!fs.existsSync(PDF_FILE)) {
  console.error('dist/kiran_thilak_resume.pdf not found. Run: npm run pdf');
  process.exit(1);
}

const buf = fs.readFileSync(PDF_FILE);
const raw = buf.toString('latin1');

// --- Index every object, inflating stream payloads ---------------------------
const objects = new Map();
for (const m of raw.matchAll(/(\d+)\s+0\s+obj\b/g)) {
  const start = m.index + m[0].length;
  const end = raw.indexOf('endobj', start);
  if (end === -1) continue;
  const body = raw.slice(start, end);
  const entry = { dict: body };

  const sm = /stream\r?\n/.exec(body);
  if (sm) {
    const sStart = m.index + m[0].length + sm.index + sm[0].length;
    const sEnd = raw.indexOf('endstream', sStart);
    try {
      entry.stream = zlib.inflateSync(buf.subarray(sStart, sEnd)).toString('latin1');
    } catch (_) { /* image or font program — no text to read */ }
  }
  objects.set(Number(m[1]), entry);
}

// --- Parse a /ToUnicode CMap into code -> character --------------------------
function parseCMap(cmap) {
  const map = new Map();
  const hexToStr = h => {
    let out = '';
    for (let i = 0; i < h.length; i += 4) out += String.fromCharCode(parseInt(h.substr(i, 4), 16));
    return out;
  };

  for (const block of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const p of block[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      map.set(parseInt(p[1], 16), hexToStr(p[2]));
    }
  }
  for (const block of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const p of block[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      const [lo, hi, dst] = [parseInt(p[1], 16), parseInt(p[2], 16), parseInt(p[3], 16)];
      for (let c = lo; c <= hi; c++) map.set(c, String.fromCharCode(dst + (c - lo)));
    }
  }
  return map;
}

// --- Resource name (/F1) -> CMap, per font resource dict ---------------------
const fontMaps = new Map();
for (const [, obj] of objects) {
  for (const res of obj.dict.matchAll(/\/Font\s*<<([^>]*)>>/g)) {
    for (const ref of res[1].matchAll(/\/(\w+)\s+(\d+)\s+0\s+R/g)) {
      const font = objects.get(Number(ref[2]));
      if (!font) continue;
      const tu = /\/ToUnicode\s+(\d+)\s+0\s+R/.exec(font.dict);
      if (!tu) continue;
      const cmapObj = objects.get(Number(tu[1]));
      if (cmapObj && cmapObj.stream) fontMaps.set(ref[1], parseCMap(cmapObj.stream));
    }
  }
}

// --- Walk content streams, decoding show-text ops with the active font -------
let extracted = '';
for (const [, obj] of objects) {
  if (!obj.stream || !/(Tj|TJ)/.test(obj.stream)) continue;
  let active = null;

  const ops = /\/(\w+)\s+[\d.]+\s+Tf|<([0-9A-Fa-f]*)>\s*(?:Tj|TJ)|\(((?:[^()\\]|\\.)*)\)\s*(?:Tj|TJ|'|")|\bET\b/g;
  for (const op of obj.stream.matchAll(ops)) {
    if (op[1] !== undefined) { active = fontMaps.get(op[1]) || null; continue; }
    if (op[0] === 'ET') { extracted += ' '; continue; }

    if (op[2] !== undefined) {
      const hex = op[2];
      for (let i = 0; i < hex.length; i += 4) {
        const code = parseInt(hex.substr(i, 4), 16);
        extracted += active && active.has(code) ? active.get(code) : '�';
      }
    } else if (op[3] !== undefined) {
      extracted += op[3].replace(/\\([()\\])/g, '$1');
    }
  }
}

extracted = extracted.replace(/\s+/g, ' ').trim();

if (!extracted) {
  console.error('FAIL: no text layer found — this PDF is an image. An ATS will read it as blank.');
  process.exit(1);
}

const unmapped = (extracted.match(/�/g) || []).length;
console.log(`Extracted ${extracted.length} characters of real text from the PDF.`);
console.log(`Fonts with a /ToUnicode map: ${fontMaps.size} | unmappable glyphs: ${unmapped}\n`);
console.log(extracted.slice(0, 260) + ' ...\n');

// Spot-check the fields an ATS actually indexes.
const required = [
  'Kiran Thilak', 'kiran_thilak@outlook.com', '+91 81474 57210',
  'UST', 'Ubisoft', 'Quest Global', 'B.Tech', 'Golang', 'Summary',
];
const flat = extracted.replace(/\s/g, '').toLowerCase();
const missing = required.filter(k => !flat.includes(k.replace(/\s/g, '').toLowerCase()));

if (missing.length) {
  console.error('FAIL: missing from the text layer: ' + missing.join(', '));
  process.exit(1);
}
if (unmapped > 0) {
  console.error(`FAIL: ${unmapped} glyphs have no ToUnicode mapping — they extract as garbage.`);
  process.exit(1);
}
console.log('PASS: text layer is complete and every key field extracts cleanly.');

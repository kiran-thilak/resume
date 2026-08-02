// Renders content/resume.md -> dist/kiran_thilak_resume.pdf using headless Chrome.
//
// Chrome's print pipeline embeds a real text layer, so the output is
// selectable and machine-readable — which is what ATS parsers need.
// Never produce this PDF by exporting an image or screenshot: it looks
// identical but contains no text, and an ATS will read it as an empty file.
//
// Used two ways:
//   node src/pdf/generate.js       (CLI, via `npm run pdf`)
//   require('./pdf/generate.js')   (the server's "Generate PDF" button)

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { renderResume } = require('../render');
const { PDF_FILE, DIST_DIR } = require('../paths');

const execFileAsync = promisify(execFile);

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  path.join(os.homedir(), 'AppData/Local/Google/Chrome/Application/chrome.exe'),
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

function findChrome() {
  const found = CHROME_CANDIDATES.find(p => fs.existsSync(p));
  if (!found) throw new Error('Chrome/Edge not found. Set CHROME_PATH to the executable.');
  return found;
}

// Only one Chrome run at a time — repeated clicks join the run in flight
// instead of spawning a second browser over the same output file.
let inFlight = null;

function generatePdf() {
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const chrome = findChrome();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resume-pdf-'));
    const tmpHtml = path.join(tmpDir, 'resume.html');

    fs.mkdirSync(DIST_DIR, { recursive: true });
    // standalone: no toolbar, no live-reload script — just the document.
    fs.writeFileSync(tmpHtml, renderResume({ standalone: true }), 'utf8');

    try {
      await execFileAsync(chrome, [
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        // Suppresses the date / page-title / URL that the print dialog stamps
        // into the margins.
        '--no-pdf-header-footer',
        '--run-all-compositor-stages-before-draw',
        '--virtual-time-budget=5000',
        `--print-to-pdf=${PDF_FILE}`,
        'file:///' + tmpHtml.replace(/\\/g, '/'),
      ]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }

    if (!fs.existsSync(PDF_FILE)) throw new Error('Chrome did not produce a PDF.');
    return { path: PDF_FILE, size: fs.statSync(PDF_FILE).size };
  })().finally(() => { inFlight = null; });

  return inFlight;
}

module.exports = { generatePdf };

if (require.main === module) {
  generatePdf().then(
    ({ path: p, size }) => {
      console.log(`Wrote dist/${path.basename(p)} (${(size / 1024).toFixed(1)} KB)`);
      console.log('Verify the text layer with: npm run pdf:check');
    },
    err => { console.error(err.message); process.exit(1); }
  );
}

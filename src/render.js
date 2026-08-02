// Turns content/resume.md into the printable HTML document.
//
// Shared by the server (which serves it) and the PDF generator (which prints
// it), so the downloaded PDF is always the exact page you see in the browser.

const fs = require('fs');
const { marked } = require('marked');
const { MD_FILE, CSS_FILE, PDF_FILE } = require('./paths');

const LIVE_RELOAD_SCRIPT = `
<script>
  const es = new EventSource('/events');
  es.onmessage = () => location.reload();
</script>
`;

function postProcess(html) {
  // 1. Jobs: lift leading <em>date</em> out of its <p> into a flex row with the h3.
  html = html.replace(
    /<h3>([^<]*)<\/h3>(\s*<p>)<em>([^<]*)<\/em>\n?/g,
    '<div class="job-header"><h3>$1</h3><span class="job-date">$3</span></div>$2'
  );

  // 2. Education: convert the entire <p> to proper <div> elements to avoid
  // the block-in-inline rendering issue caused by display:flex inside a <p>.
  // Input:  <p><strong>Degree</strong> | grade | Mon YYYY<br>\nInstitution</p>
  // Output: <div class="edu-row">...</div><div class="edu-inst">Institution</div>
  html = html.replace(
    /<p>(<strong>[^<]+<\/strong>[^<\n]*) \| ([A-Z][a-z]+ \d{4})<br>\n?([^\n<]*)<\/p>/g,
    '<div class="edu-row">$1<span class="job-date">$2</span></div><div class="edu-inst">$3</div>'
  );

  return html;
}

// The PDF is stale once resume.md has been edited since it was rendered.
function pdfStatus() {
  if (!fs.existsSync(PDF_FILE)) return 'missing';
  return fs.statSync(MD_FILE).mtimeMs > fs.statSync(PDF_FILE).mtimeMs ? 'stale' : 'ready';
}

// Read per call so stylesheet edits show up on reload without a restart.
const readCss = () => fs.readFileSync(CSS_FILE, 'utf8');

function toolbar() {
  const status = pdfStatus();
  const label = status === 'ready' ? 'Download PDF' : 'Generate PDF';
  const hint = status === 'stale' ? 'resume.md changed since the PDF was built' : '';

  return `<div class="toolbar">
  <a href="/">&larr; Back</a>
  <span class="toolbar-right">
    <span class="toolbar-status" id="pdf-status">${hint}</span>
    <button id="pdf-btn" data-status="${status}">${label}</button>
  </span>
</div>
<script>
  (function () {
    const btn = document.getElementById('pdf-btn');
    const status = document.getElementById('pdf-status');

    function download() {
      // Hidden iframe keeps the current page put while the file downloads.
      const f = document.createElement('iframe');
      f.style.display = 'none';
      f.src = '/resume.pdf?t=' + Date.now();
      document.body.appendChild(f);
      setTimeout(() => f.remove(), 60000);
    }

    btn.addEventListener('click', async () => {
      if (btn.dataset.status === 'ready') return download();

      btn.disabled = true;
      btn.textContent = 'Generating\\u2026';
      status.textContent = 'rendering with headless Chrome';
      try {
        const res = await fetch('/resume.pdf/generate', { method: 'POST' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'generation failed');
        btn.dataset.status = 'ready';
        btn.textContent = 'Download PDF';
        status.textContent = (data.size / 1024).toFixed(1) + ' KB ready';
        download();
      } catch (err) {
        btn.dataset.status = 'missing';
        btn.textContent = 'Generate PDF';
        status.textContent = 'Failed: ' + err.message;
      } finally {
        btn.disabled = false;
      }
    });
  })();
</script>`;
}

/**
 * @param {string} md              markdown source
 * @param {boolean} opts.standalone  omit the toolbar and live-reload script
 *                                   (used when printing to PDF)
 */
function buildHtml(md, { standalone = false } = {}) {
  const body = postProcess(marked.parse(md));

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Kiran Thilak — Resume</title>
  <style>${readCss()}</style>
</head>
<body>
${standalone ? '' : toolbar()}
<div class="page">
${body}
</div>
${standalone ? '' : LIVE_RELOAD_SCRIPT}
</body>
</html>`;
}

function renderResume(opts) {
  return buildHtml(fs.readFileSync(MD_FILE, 'utf8'), opts);
}

module.exports = { buildHtml, renderResume, pdfStatus, LIVE_RELOAD_SCRIPT };

// Dev server for the resume site.
//
//   /            landing page (public/index.html)
//   /resume      content/resume.md rendered to HTML
//   /resume.pdf  the generated PDF (built on demand if missing or stale)
//   /resume.md   raw markdown source
//
// Editing content/resume.md, public/index.html, or src/styles/resume.css
// reloads open browser tabs over SSE. Editing anything else under src/ needs a
// server restart — Node reads those files once at startup.

const http = require('http');
const fs = require('fs');
const { renderResume, pdfStatus } = require('./render');
const { generatePdf } = require('./pdf/generate');
const {
  MD_FILE, LANDING_FILE, CSS_FILE, PDF_FILE, PDF_DOWNLOAD_NAME,
} = require('./paths');

const PORT = process.env.PORT || 3000;

const LIVE_RELOAD_SCRIPT = `
<script>
  const es = new EventSource('/events');
  es.onmessage = () => location.reload();
</script>
`;

let sseClients = [];

function notifyReload(label) {
  console.log(`${label} changed — reloading browser...`);
  sseClients.forEach(res => {
    try { res.write('data: reload\n\n'); } catch (_) {}
  });
  sseClients = sseClients.filter(res => !res.writableEnded);
}

function servePdf(req, res) {
  const stat = fs.statSync(PDF_FILE);
  const etag = `"${stat.size}-${stat.mtimeMs}"`;

  // Serve from the browser cache when the file has not changed.
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, { ETag: etag });
    res.end();
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'application/pdf',
    'Content-Length': stat.size,
    'Content-Disposition': `attachment; filename="${PDF_DOWNLOAD_NAME}"`,
    'Last-Modified': stat.mtime.toUTCString(),
    'Cache-Control': 'public, max-age=0, must-revalidate',
    ETag: etag,
  });
  fs.createReadStream(PDF_FILE).pipe(res);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  if (pathname === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    res.write(':\n\n'); // keep-alive comment
    sseClients.push(res);
    req.on('close', () => {
      sseClients = sseClients.filter(c => c !== res);
    });
    return;
  }

  try {
    if (pathname === '/' || pathname === '/index.html') {
      const landing = fs.readFileSync(LANDING_FILE, 'utf8')
        .replace('</body>', `${LIVE_RELOAD_SCRIPT}</body>`);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(landing);
      return;
    }

    if (pathname === '/resume' || pathname === '/resume.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(renderResume());
      return;
    }

    if (pathname === '/resume.pdf/generate') {
      if (req.method !== 'POST') {
        res.writeHead(405, { Allow: 'POST', 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Use POST' }));
        return;
      }

      console.log('Generating PDF...');
      generatePdf().then(
        ({ size }) => {
          console.log(`PDF generated (${(size / 1024).toFixed(1)} KB)`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, size }));
        },
        err => {
          console.error('PDF generation failed:', err.message);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      );
      return;
    }

    if (pathname === '/resume.pdf') {
      // Build it on demand if it is missing or older than resume.md, so a
      // direct link (the landing page button) never serves a stale or 404 file.
      if (pdfStatus() !== 'ready') {
        console.log('PDF missing or stale — generating...');
        generatePdf().then(
          () => servePdf(req, res),
          err => {
            console.error('PDF generation failed:', err.message);
            res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(
              '<p style="font-family:sans-serif">Could not generate the PDF: ' +
              err.message + '. <a href="/resume">Back to the resume</a>.</p>'
            );
          }
        );
        return;
      }

      servePdf(req, res);
      return;
    }

    if (pathname === '/resume.md') {
      res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8' });
      res.end(fs.readFileSync(MD_FILE, 'utf8'));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<p style="font-family:sans-serif">404 — Not found. <a href="/">Go home</a></p>');
  } catch (err) {
    res.writeHead(500);
    res.end(`Error: ${err.message}`);
  }
});

// Watch content sources and notify SSE clients on change
fs.watch(MD_FILE, () => notifyReload('content/resume.md'));
fs.watch(LANDING_FILE, () => notifyReload('public/index.html'));
fs.watch(CSS_FILE, () => notifyReload('src/styles/resume.css'));

server.listen(PORT, () => {
  console.log(`Landing page → http://localhost:${PORT}`);
  console.log(`Resume       → http://localhost:${PORT}/resume`);
  console.log('Edit content/, public/, or src/styles/ and the browser reloads automatically.');
});

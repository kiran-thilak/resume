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
const path = require('path');
const {
  MD_FILE, LANDING_FILE, CSS_FILE, PDF_FILE, PDF_DOWNLOAD_NAME, TAILWIND_OUTPUT_FILE, FAVICON_FILE,
} = require('./paths');

const PORT = process.env.PORT || 3000;
const ASSETS_DIR = path.join(path.dirname(LANDING_FILE), 'assets');

const CONTENT_TYPES = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.css': 'text/css',
};

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
      // Inline the CSS and favicon rather than linking to /assets/* — hosts
      // that serve public/ as static files ahead of the app (e.g. Hostinger's
      // Passenger layer) 404 those requests before they ever reach Node.
      const favicon = fs.readFileSync(FAVICON_FILE, 'utf8');
      const faviconDataUri = `data:image/svg+xml;base64,${Buffer.from(favicon).toString('base64')}`;
      const landing = fs.readFileSync(LANDING_FILE, 'utf8')
        .replace('<link rel="stylesheet" href="/assets/tailwind.css">', `<style>${fs.readFileSync(TAILWIND_OUTPUT_FILE, 'utf8')}</style>`)
        .replace('<link rel="icon" type="image/svg+xml" href="/assets/favicon.svg?v=2">', `<link rel="icon" type="image/svg+xml" href="${faviconDataUri}">`)
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
            // No headless Chrome on this host (e.g. Hostinger): fall back to
            // whatever PDF was committed rather than 500ing on every request —
            // git checkout mtimes don't reliably reflect real staleness anyway.
            if (fs.existsSync(PDF_FILE)) {
              console.error('PDF generation failed, serving the existing file:', err.message);
              servePdf(req, res);
              return;
            }
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

    if (pathname.startsWith('/assets/')) {
      const filePath = path.join(ASSETS_DIR, pathname.slice('/assets/'.length));
      if (!filePath.startsWith(ASSETS_DIR) || !fs.existsSync(filePath)) {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<p style="font-family:sans-serif">404 — Not found. <a href="/">Go home</a></p>');
        return;
      }
      const type = CONTENT_TYPES[path.extname(filePath)] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type });
      fs.createReadStream(filePath).pipe(res);
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

// Tailwind CLI (css:watch) may not have written its first build yet when the
// server starts, so wait for the file to exist before watching it.
(function watchTailwindOutput() {
  if (fs.existsSync(TAILWIND_OUTPUT_FILE)) {
    fs.watch(TAILWIND_OUTPUT_FILE, () => notifyReload('public/assets/tailwind.css'));
  } else {
    setTimeout(watchTailwindOutput, 500);
  }
})();

server.listen(PORT, () => {
  console.log(`Landing page → http://localhost:${PORT}`);
  console.log(`Resume       → http://localhost:${PORT}/resume`);
  console.log('Edit content/, public/, or src/styles/ and the browser reloads automatically.');
});

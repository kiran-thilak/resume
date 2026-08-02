const http = require('http');
const fs = require('fs');
const path = require('path');
const { marked } = require('marked');

const MD_FILE = path.join(__dirname, 'resume.md');
const PORT = 3000;

let sseClients = [];

const CSS = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: "Georgia", "Times New Roman", serif;
  font-size: 10.5pt;
  color: #1a1a1a;
  background: #f4f4f4;
  padding: 2rem;
}

.page {
  max-width: 780px;
  margin: 0 auto;
  background: #fff;
  padding: 2.8rem 3rem;
  box-shadow: 0 2px 16px rgba(0,0,0,0.10);
}

/* Name */
h1 {
  font-size: 22pt;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #111;
  text-align: center;
}

/* Contact line (first <p> after h1) */
h1 + p {
  font-family: "Arial", sans-serif;
  font-size: 9pt;
  color: #444;
  text-align: center;
  margin-top: 0.35rem;
  letter-spacing: 0.03em;
}

h1 + p a { color: #444; text-decoration: none; }
h1 + p a:hover { text-decoration: underline; }

/* Section divider <hr> */
hr {
  border: none;
  border-top: 1.5px solid #111;
  margin: 0.9rem 0;
}

/* Section headers */
h2 {
  font-family: "Arial", sans-serif;
  font-size: 9pt;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #111;
  margin: 0.9rem 0 0.5rem 0;
}

/* Job header row: title left, date right */
.job-header {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 0.2rem;
  margin-top: 0.75rem;
}

/* Job title "Role | Company" — shrinks so date is never pushed off */
.job-header h3 {
  font-family: "Arial", sans-serif;
  font-size: 10.5pt;
  font-weight: 700;
  color: #111;
  margin-top: 0;
  flex: 1;
  min-width: 0;
}

/* Date always pushed to the far right */
.job-date {
  font-family: "Arial", sans-serif;
  font-size: 8.5pt;
  color: #555;
  white-space: nowrap;
  font-style: italic;
  margin-left: auto;
  padding-left: 1rem;
}

/* Education degree row */
.edu-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 0.2rem;
}

.edu-inst {
  font-family: "Arial", sans-serif;
  font-size: 9pt;
  color: #444;
  margin-top: 0.1rem;
  font-style: italic;
}

/* Project label: **bold** _italic_ line */
p:has(strong):not(h1 + p) {
  font-family: "Arial", sans-serif;
  font-size: 8.5pt;
  color: #444;
  margin-top: 0.15rem;
  font-style: italic;
}

/* Body paragraphs */
p {
  font-size: 10pt;
  line-height: 1.6;
  color: #222;
  margin-top: 0.35rem;
}

/* Bullet lists */
ul {
  margin-top: 0.35rem;
  padding-left: 1.2rem;
  color: #222;
}

ul li {
  font-size: 9.5pt;
  line-height: 1.55;
  margin-bottom: 0.2rem;
}

/* Skills: bold label followed by value */
h2 + p strong {
  font-family: "Arial", sans-serif;
  font-size: 9pt;
  color: #111;
}

@media print {
  body { background: #fff; padding: 0; }
  .page { box-shadow: none; padding: 1.4rem 1.6rem; max-width: 100%; }
  a { color: inherit; }
  h3, ul, p { break-inside: avoid; }
  .job-header { break-after: avoid; }
  .job-header + p { break-after: avoid; }
}
`;

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

function buildHtml(md) {
  const body = postProcess(marked.parse(md));
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Kiran Thilak — Resume</title>
  <style>${CSS}</style>
</head>
<body>
<div class="page">
${body}
</div>
${LIVE_RELOAD_SCRIPT}
</body>
</html>`;
}

// Watch markdown file and notify SSE clients on change
fs.watch(MD_FILE, () => {
  console.log('resume.md changed — reloading browser...');
  sseClients.forEach(res => {
    try { res.write('data: reload\n\n'); } catch (_) {}
  });
  sseClients = sseClients.filter(res => !res.writableEnded);
});

const server = http.createServer((req, res) => {
  if (req.url === '/events') {
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
    const md = fs.readFileSync(MD_FILE, 'utf8');
    const html = buildHtml(md);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  } catch (err) {
    res.writeHead(500);
    res.end(`Error: ${err.message}`);
  }
});

server.listen(PORT, () => {
  console.log(`Resume live server → http://localhost:${PORT}`);
  console.log('Edit resume.md and the browser will reload automatically.');
});

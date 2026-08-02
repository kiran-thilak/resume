# Resume site

A landing page plus a markdown-driven resume, with a PDF build that keeps a real
text layer so applicant tracking systems can parse it.

## Layout

```
├── content/
│   └── resume.md            # the resume — the only file with actual content
├── public/
│   ├── index.html           # landing page
│   └── assets/
│       └── tailwind.css     # built by Vite, committed (see "Deploying" below)
├── src/
│   ├── server.js            # dev server + routes
│   ├── render.js            # markdown -> printable HTML
│   ├── paths.js             # every filesystem path in one place
│   ├── styles/
│   │   ├── resume.css       # resume + print stylesheet
│   │   └── tailwind-input.css # Tailwind entry, processed by Vite
│   └── pdf/
│       └── generate.js      # headless-Chrome PDF build
├── scripts/
│   └── check-pdf.js         # verifies the PDF's text layer is extractable
├── vite.config.js           # builds tailwind-input.css -> public/assets/tailwind.css
└── dist/
    └── kiran_thilak_resume.pdf  # committed — see "Deploying" below
```

## Getting started

```
npm install       # one-time setup
npm run dev       # start the site at http://localhost:3000
```

Press `Ctrl+C` in the terminal to stop it — that kills both the server and the
Tailwind/Vite watcher `npm run dev` starts alongside it.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Serves the site on http://localhost:3000 and rebuilds CSS on change |
| `npm run css:build` | Builds `public/assets/tailwind.css` once via Vite |
| `npm run css:watch` | Same, but rebuilds on every save |
| `npm run pdf` | Renders `content/resume.md` to `dist/kiran_thilak_resume.pdf` |
| `npm run pdf:check` | Extracts the PDF's text to prove it is ATS-readable |
| `npm run build` | CSS build only — what runs on deploy |
| `npm run build:pdf` | CSS build, then regenerates and verifies the PDF |

## Routes

| Route | Serves |
| --- | --- |
| `/` | Landing page |
| `/resume` | Rendered resume, with a Generate/Download PDF button |
| `/resume.pdf` | The PDF — built on demand if missing or out of date |
| `/resume.md` | Raw markdown |

## Notes

- Editing `content/resume.md`, `public/index.html`, or `src/styles/resume.css`
  live-reloads open tabs. Editing anything else in `src/` needs a server
  restart — Node reads those once at startup.
- The PDF must come from `npm run pdf` (headless Chrome), never from an image or
  screenshot export. Chrome embeds a real text layer plus the `/ToUnicode` maps
  that text extraction depends on; an image-based PDF looks identical but an ATS
  reads it as blank. `npm run pdf:check` is what catches that.
- Set `CHROME_PATH` if Chrome/Edge is installed somewhere non-standard.

## Deploying

`dist/kiran_thilak_resume.pdf` is committed to the repo, because most hosts
(Hostinger included) don't have a Chrome/Edge binary available at build time.
`npm run build` — what runs on deploy — only builds the CSS; it does not
regenerate the PDF.

Whenever `content/resume.md` changes, regenerate and commit the PDF yourself
before pushing:

```
npm run build:pdf
git add dist/kiran_thilak_resume.pdf
git commit -m "Update resume PDF"
```

`/resume.pdf` will still attempt to regenerate on demand if the server thinks
the PDF is stale (its mtime check isn't reliable right after a fresh
checkout), but it falls back to serving the committed file if Chrome isn't
present rather than erroring.

`public/assets/tailwind.css` is committed for the same reason: Hostinger's
Node.js app hosting (Phusion Passenger) serves files under `public/` directly
from disk, bypassing the app entirely — a missing file 404s before the build
step or the app's own `/assets/` route ever get a chance to run. Whenever
`src/styles/` changes, rebuild and commit the CSS yourself before pushing:

```
npm run css:build
git add public/assets/tailwind.css
git commit -m "Update built CSS"
```

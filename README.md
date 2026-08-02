# Resume site

A landing page plus a markdown-driven resume, with a PDF build that keeps a real
text layer so applicant tracking systems can parse it.

## Layout

```
├── content/
│   └── resume.md            # the resume — the only file with actual content
├── public/
│   └── index.html           # landing page (Tailwind via CDN)
├── src/
│   ├── server.js            # dev server + routes
│   ├── render.js            # markdown -> printable HTML
│   ├── paths.js             # every filesystem path in one place
│   ├── styles/
│   │   └── resume.css       # resume + print stylesheet
│   └── pdf/
│       └── generate.js      # headless-Chrome PDF build
├── scripts/
│   └── check-pdf.js         # verifies the PDF's text layer is extractable
└── dist/                    # build output (gitignored)
    └── kiran_thilak_resume.pdf
```

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Serves the site on http://localhost:3000 |
| `npm run pdf` | Renders `content/resume.md` to `dist/kiran_thilak_resume.pdf` |
| `npm run pdf:check` | Extracts the PDF's text to prove it is ATS-readable |
| `npm run build` | Both of the above |

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

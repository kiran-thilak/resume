// Every filesystem location the app touches, resolved from the project root.
// Keeping them here means no module has to guess its depth relative to root.

const path = require('path');

const ROOT = path.join(__dirname, '..');

module.exports = {
  ROOT,
  // Source content
  MD_FILE: path.join(ROOT, 'content', 'resume.md'),
  LANDING_FILE: path.join(ROOT, 'public', 'index.html'),
  CSS_FILE: path.join(ROOT, 'src', 'styles', 'resume.css'),
  TAILWIND_INPUT_FILE: path.join(ROOT, 'src', 'styles', 'tailwind-input.css'),
  TAILWIND_OUTPUT_FILE: path.join(ROOT, 'public', 'assets', 'tailwind.css'),
  FAVICON_FILE: path.join(ROOT, 'public', 'assets', 'favicon.svg'),
  // Build output — generated, not committed
  DIST_DIR: path.join(ROOT, 'dist'),
  PDF_FILE: path.join(ROOT, 'dist', 'kiran_thilak_resume.pdf'),
  // Filename the browser saves as
  PDF_DOWNLOAD_NAME: 'Kiran_Thilak_Resume.pdf',
};

// Patches package.json with build script + author field if missing.
// Called by build.ps1 — do not run manually.
const fs = require('fs');
const path = require('path');

const pkgPath = path.join(__dirname, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
let changed = false;

if (!pkg.scripts.build) {
  pkg.scripts.build = 'electron-builder --config electron-builder.json';
  changed = true;
}
if (!pkg.author) {
  pkg.author = 'TutorMate Team';
  changed = true;
}

if (changed) {
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  console.log('    Updated package.json (added build script + author)');
} else {
  console.log('    package.json already configured');
}

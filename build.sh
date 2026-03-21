#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# build.sh — Package TutorMate Electron into a distributable
# executable using electron-builder.
#
# Usage:
#   bash build.sh            # builds for current platform
#   bash build.sh --win      # Windows (NSIS installer + portable)
#   bash build.sh --mac      # macOS (DMG)
#   bash build.sh --linux    # Linux (AppImage + deb)
# ─────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ── 1. Preflight checks ─────────────────────────────────────
echo "==> Checking prerequisites..."

if ! command -v node &>/dev/null; then
  echo "ERROR: Node.js is not installed. Install it from https://nodejs.org" >&2
  exit 1
fi

if ! command -v npm &>/dev/null; then
  echo "ERROR: npm is not found." >&2
  exit 1
fi

NODE_VERSION=$(node -v)
echo "    Node.js $NODE_VERSION"

# ── 2. Install dependencies ─────────────────────────────────
echo "==> Installing project dependencies..."
npm install

# ── 3. Install electron-builder if not present ───────────────
if ! npx electron-builder --version &>/dev/null 2>&1; then
  echo "==> Installing electron-builder as dev dependency..."
  npm install --save-dev electron-builder
else
  echo "    electron-builder already installed"
fi

# ── 4. Generate a default icon if none exists ────────────────
ICON_DIR="$SCRIPT_DIR/build"
ICON_PNG="$ICON_DIR/icon.png"

if [ ! -f "$ICON_PNG" ]; then
  echo "==> No build/icon.png found — generating a placeholder icon..."
  mkdir -p "$ICON_DIR"

  # Create a 256x256 green PNG placeholder using Node.js
  # (no external image tools required)
  node -e "
const { createCanvas } = (() => {
  try { return require('canvas'); } catch { return null; }
})();

const fs = require('fs');
const path = require('path');

// If 'canvas' is not available, write a minimal valid 256x256 green PNG
// This is a programmatically generated minimal PNG
const width = 256, height = 256;

function createMinimalPNG(w, h, r, g, b) {
  // PNG signature
  const signature = Buffer.from([137,80,78,71,13,10,26,10]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(w, 0);
  ihdrData.writeUInt32BE(h, 4);
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 2;  // color type: RGB
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdr = makeChunk('IHDR', ihdrData);

  // IDAT chunk — uncompressed deflate of raw image data
  // Each row: filter byte (0) + w*3 bytes of RGB
  const rowSize = 1 + w * 3;
  const rawRows = Buffer.alloc(rowSize * h);
  for (let y = 0; y < h; y++) {
    const offset = y * rowSize;
    rawRows[offset] = 0; // no filter
    for (let x = 0; x < w; x++) {
      const px = offset + 1 + x * 3;
      rawRows[px] = r;
      rawRows[px+1] = g;
      rawRows[px+2] = b;
    }
  }
  const zlib = require('zlib');
  const compressed = zlib.deflateSync(rawRows);
  const idat = makeChunk('IDAT', compressed);

  // IEND chunk
  const iend = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeB = Buffer.from(type, 'ascii');
  const payload = Buffer.concat([typeB, data]);
  const crc32 = crc(payload);
  const crcB = Buffer.alloc(4);
  crcB.writeUInt32BE(crc32 >>> 0, 0);
  return Buffer.concat([len, payload, crcB]);
}

function crc(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let j = 0; j < 8; j++) {
      c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

const png = createMinimalPNG(width, height, 0x4e, 0xc9, 0x00); // #4ec900 green
fs.writeFileSync(path.join('$ICON_DIR', 'icon.png'), png);
console.log('    Created placeholder 256x256 icon (green)');
"
else
  echo "    build/icon.png found"
fi

# ── 5. Inject build config into package.json if missing ──────
echo "==> Checking package.json build configuration..."

node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
let changed = false;

// Add build script
if (!pkg.scripts.build) {
  pkg.scripts.build = 'electron-builder --config electron-builder.json';
  changed = true;
}

// Add author if missing (required by electron-builder)
if (!pkg.author) {
  pkg.author = 'TutorMate Team';
  changed = true;
}

if (changed) {
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
  console.log('    Updated package.json (added build script + author)');
} else {
  console.log('    package.json already configured');
}
"

# ── 6. Create electron-builder config if missing ─────────────
EB_CONFIG="$SCRIPT_DIR/electron-builder.json"

if [ ! -f "$EB_CONFIG" ]; then
  echo "==> Creating electron-builder.json..."
  cat > "$EB_CONFIG" << 'EBEOF'
{
  "$schema": "https://raw.githubusercontent.com/electron-userland/electron-builder/master/packages/app-builder-lib/scheme.json",
  "appId": "com.tutormate.electron",
  "productName": "TutorMate",
  "directories": {
    "output": "dist"
  },
  "files": [
    "electron/**/*",
    "src/**/*",
    "assets/**/*",
    "data/**/*",
    "package.json"
  ],
  "extraResources": [],
  "asar": true,
  "win": {
    "target": [
      {
        "target": "nsis",
        "arch": ["x64"]
      },
      {
        "target": "portable",
        "arch": ["x64"]
      }
    ],
    "icon": "build/icon.png"
  },
  "nsis": {
    "oneClick": false,
    "perMachine": false,
    "allowToChangeInstallationDirectory": true,
    "installerIcon": "build/icon.png",
    "uninstallerIcon": "build/icon.png"
  },
  "mac": {
    "target": ["dmg"],
    "icon": "build/icon.png",
    "category": "public.app-category.education"
  },
  "linux": {
    "target": ["AppImage", "deb"],
    "icon": "build/icon.png",
    "category": "Education"
  }
}
EBEOF
  echo "    Created electron-builder.json"
else
  echo "    electron-builder.json already exists"
fi

# ── 7. Build ─────────────────────────────────────────────────
TARGET_FLAG="${1:-}"

echo ""
echo "==> Building distributable..."
echo "    Output will be in ./dist/"
echo ""

case "$TARGET_FLAG" in
  --win)
    npx electron-builder --win --config electron-builder.json
    ;;
  --mac)
    npx electron-builder --mac --config electron-builder.json
    ;;
  --linux)
    npx electron-builder --linux --config electron-builder.json
    ;;
  *)
    # Build for current platform
    npx electron-builder --config electron-builder.json
    ;;
esac

echo ""
echo "==> Build complete! Distributable files are in ./dist/"
echo ""
ls -lh dist/ 2>/dev/null || echo "(dist/ directory listing not available)"

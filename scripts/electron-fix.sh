#!/bin/bash
# 修复 electron 二进制安装：extract-zip 在部分环境下静默产出残缺包。
# 用 curl + ditto 直接落一个完整 dist，并写入 path.txt。幂等，可重复执行。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ELECTRON_DIR="$(ls -d "$ROOT"/node_modules/.pnpm/electron@*/node_modules/electron 2>/dev/null | head -1 || true)"
if [ -z "$ELECTRON_DIR" ]; then
  echo "electron package not found" >&2; exit 1
fi
VERSION="$(node -p "require('$ELECTRON_DIR/package.json').version")"
ARCH="$(uname -m)"; [ "$ARCH" = "arm64" ] && ARCH=arm64 || ARCH=x64
PLATFORM="darwin-$ARCH"
ZIP="$ROOT/node_modules/.cache/electron-v$VERSION-$PLATFORM.zip"
mkdir -p "$(dirname "$ZIP")"
if [ ! -f "$ZIP" ]; then
  echo "downloading electron $VERSION ($PLATFORM)..."
  curl -sL --retry 3 -o "$ZIP" "https://github.com/electron/electron/releases/download/v$VERSION/electron-v$VERSION-$PLATFORM.zip"
fi
rm -rf "$ELECTRON_DIR/dist"
mkdir -p "$ELECTRON_DIR/dist"
ditto -x -k "$ZIP" "$ELECTRON_DIR/dist"
printf 'Electron.app/Contents/MacOS/Electron' > "$ELECTRON_DIR/path.txt"
"$ELECTRON_DIR/dist/Electron.app/Contents/MacOS/Electron" --version >/dev/null
echo "electron $VERSION OK → $ELECTRON_DIR"

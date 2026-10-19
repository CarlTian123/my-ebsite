#!/bin/sh
# PHI:NEON — 本地启动脚本（必须通过 HTTP 打开，直接双击 index.html 会导致音频/封面加载失败）
cd "$(dirname "$0")" || exit 1
PORT="${1:-8765}"
echo "PHI:NEON  →  http://127.0.0.1:${PORT}"
exec python3 -m http.server "$PORT"

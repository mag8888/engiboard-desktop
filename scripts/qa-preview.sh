#!/usr/bin/env bash
# qa-preview.sh — поднять локальный preview EngiBoard для ручного тестирования.
#
# Использование:
#   ./scripts/qa-preview.sh           # порт 7788, dist/
#   ./scripts/qa-preview.sh 8080      # другой порт
#
# После запуска открыть http://localhost:7788 в Chrome / Edge / Firefox.
# Cmd-C / Ctrl-C — остановить.

set -euo pipefail

PORT="${1:-7788}"
DIST_DIR="$(cd "$(dirname "$0")/.." && pwd)/dist"

if [ ! -d "$DIST_DIR" ]; then
  echo "FATAL: dist/ not found at $DIST_DIR" >&2
  exit 1
fi

if [ ! -f "$DIST_DIR/index.html" ]; then
  echo "FATAL: $DIST_DIR/index.html missing" >&2
  exit 1
fi

# Проверка занят ли порт
if lsof -i ":$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port $PORT is busy. Close the process or pass another port: ./scripts/qa-preview.sh 8080" >&2
  exit 1
fi

echo "EngiBoard preview"
echo "  dir   : $DIST_DIR"
echo "  port  : $PORT"
echo "  url   : http://localhost:$PORT"
echo "  stop  : Ctrl-C"
echo

cd "$DIST_DIR"
exec python3 -m http.server "$PORT"

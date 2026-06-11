#!/usr/bin/env bash
# mac-install.sh — поставить свежесобранный EngiBoard.app в /Applications
# с СТАБИЛЬНОЙ подписью, чтобы macOS-разрешения (Screen Recording и т.п.)
# переживали пересборки.
#
# Проблема, которую решает скрипт:
#   Tauri по умолчанию подписывает adhoc/linker-signed — cdhash меняется
#   при каждой сборке, и macOS видит новую версию как «другое» приложение.
#   Старое разрешение Screen Recording виснет мёртвым тумблером, а новую
#   версию включить нельзя.
#
# Решение:
#   Переподписываем .app самоподписанным сертификатом "EngiBoard Dev"
#   (один раз создаётся, см. ниже). Его designated requirement привязан к
#   постоянному хэшу сертификата — DR стабилен между сборками, поэтому
#   TCC-грант сохраняется. Один раз выдал разрешение — больше не спрашивает.
#
# Если сертификата "EngiBoard Dev" нет — создать так (однократно):
#   cd /tmp
#   cat > c.conf <<'EOF'
#   [ req ]
#   distinguished_name = dn
#   x509_extensions = v3
#   prompt = no
#   [ dn ]
#   CN = EngiBoard Dev
#   [ v3 ]
#   keyUsage = critical, digitalSignature
#   extendedKeyUsage = critical, codeSigning
#   basicConstraints = critical, CA:false
#   EOF
#   openssl req -x509 -newkey rsa:2048 -keyout k.pem -out c.pem -days 3650 -nodes -config c.conf
#   openssl pkcs12 -export -inkey k.pem -in c.pem -out eb.p12 -passout pass:engiboard -name "EngiBoard Dev"
#   security import eb.p12 -k ~/Library/Keychains/login.keychain-db -P engiboard -T /usr/bin/codesign -A
#
# Использование:
#   ./scripts/mac-install.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_SRC="$ROOT/src-tauri/target/release/bundle/macos/EngiBoard.app"
APP_DST="/Applications/EngiBoard.app"
SIGN_ID="EngiBoard Dev"

if [ ! -d "$APP_SRC" ]; then
  echo "FATAL: не найден собранный .app: $APP_SRC" >&2
  echo "Сначала: cargo tauri build --bundles app" >&2
  exit 1
fi

if ! security find-certificate -c "$SIGN_ID" >/dev/null 2>&1; then
  echo "FATAL: нет сертификата '$SIGN_ID' в keychain — см. шапку скрипта как создать." >&2
  exit 1
fi

echo "→ закрываю запущенный EngiBoard"
osascript -e 'quit app "EngiBoard"' 2>/dev/null || true
pkill -x engiboard 2>/dev/null || true
sleep 1

echo "→ копирую .app в /Applications"
rm -rf "$APP_DST"
ditto "$APP_SRC" "$APP_DST"

echo "→ переподписываю стабильной подписью '$SIGN_ID'"
codesign --force --deep --sign "$SIGN_ID" -i com.engiboard.desktop --timestamp=none "$APP_DST"
codesign --verify "$APP_DST" && echo "  подпись валидна"

echo "→ запускаю"
open -a "$APP_DST"

VER=$(defaults read "$APP_DST/Contents/Info.plist" CFBundleShortVersionString)
echo "EngiBoard v$VER установлен и запущен (стабильная подпись — разрешения сохранятся между сборками)."
echo ""
echo "Если Screen Recording всё ещё висит со старой версии — один раз:"
echo "  tccutil reset ScreenCapture com.engiboard.desktop"
echo "и заново выдай разрешение в Системных настройках. Дальше будет помниться."

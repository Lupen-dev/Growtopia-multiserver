#!/usr/bin/env bash
# Growtopia Multiserver - Tek komutla baslat (macOS / Linux)
set -e

cd "$(dirname "$0")"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

banner() {
  echo -e "${CYAN}"
  echo "  ____                    _____            _       "
  echo " / ___|_ __ _____      __|_   _|__  _ __  (_) __ _ "
  echo "| |  _| '__/ _ \ \ /\ / /  | |/ _ \| '_ \ | |/ _\` |"
  echo "| |_| | | | (_) \ V  V /   | | (_) | |_) || | (_| |"
  echo " \____|_|  \___/ \_/\_/    |_|\___/| .__/ |_|\__,_|"
  echo "                                   |_|             "
  echo "         M U L T I S E R V E R   v 1 . 0"
  echo -e "${NC}"
}

banner

if ! command -v node >/dev/null 2>&1; then
  echo -e "${RED}[X]${NC} Node.js bulunamadi. Lutfen Node.js 18+ kurun:"
  echo "  macOS: brew install node"
  echo "  Linux: https://nodejs.org veya 'sudo apt install nodejs npm'"
  exit 1
fi

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo -e "${RED}[X]${NC} Node.js 18 veya ustu gerekli (su anki: $(node -v))"
  exit 1
fi

echo -e "${GREEN}[OK]${NC} Node.js $(node -v) bulundu"

if [ ! -d node_modules ]; then
  echo -e "${YELLOW}[..]${NC} Bagimliliklar yukleniyor (npm install)..."
  npm install --no-audit --no-fund --loglevel=error
  echo -e "${GREEN}[OK]${NC} Bagimliliklar yuklendi"
fi

mkdir -p logs data/runtime

# SSL sertifikasi yoksa olustur (GT istemci HTTPS bekler)
if [ ! -f data/runtime/ssl/server.crt ]; then
  echo -e "${YELLOW}[..]${NC} GT istemcisi icin self-signed SSL sertifikasi olusturuluyor..."
  node scripts/gen-cert.js || echo -e "${YELLOW}[!]${NC} Sertifika olusturulamadi (openssl yoklugu olabilir). HTTP devam edecek."
fi

echo -e "${GREEN}[->]${NC} Sunucu baslatiliyor..."
echo ""
exec node src/index.js "$@"

#!/usr/bin/env bash
# macOS / Linux: 443 portunu 8443'e yonlendirir, boylece node sudosuz calisir.
set -e

PORT_FROM=443
PORT_TO=${1:-8443}

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'

OS=$(uname -s)

if [ "$OS" = "Darwin" ]; then
  echo -e "${YELLOW}macOS: pfctl ile $PORT_FROM -> $PORT_TO yonlendirmesi kurulacak (sudo gerek)${NC}"
  # Mevcut pf kurallarini koru
  TMPFILE=$(mktemp)
  echo "rdr pass on lo0 inet proto tcp from any to any port $PORT_FROM -> 127.0.0.1 port $PORT_TO" > "$TMPFILE"
  sudo pfctl -ef "$TMPFILE" 2>&1 | grep -v "pf already enabled" || true
  echo -e "${GREEN}[OK]${NC} Yonlendirme aktif. (Yeniden baslatma sonrasi tekrar gerekir)"
  echo "Test: curl -k https://127.0.0.1/growtopia/server_data.php"
elif [ "$OS" = "Linux" ]; then
  echo -e "${YELLOW}Linux: iptables ile $PORT_FROM -> $PORT_TO yonlendirmesi (sudo gerek)${NC}"
  sudo iptables -t nat -A PREROUTING -p tcp --dport $PORT_FROM -j REDIRECT --to-port $PORT_TO
  sudo iptables -t nat -A OUTPUT -p tcp -o lo --dport $PORT_FROM -j REDIRECT --to-port $PORT_TO
  echo -e "${GREEN}[OK]${NC} Yonlendirme aktif (gecici; reboot sonrasi tekrar lazim)."
  echo "Kalici yapmak icin: iptables-persistent paketi kullanin."
else
  echo -e "${RED}Desteklenmeyen OS: $OS${NC}"
  exit 1
fi

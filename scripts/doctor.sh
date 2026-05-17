#!/usr/bin/env bash
# Growtopia istemcisi baglantisi icin kurulum tani araci.
GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
OK="${GREEN}[OK]${NC}"; BAD="${RED}[X]${NC}"; WARN="${YELLOW}[!]${NC}"; INFO="${CYAN}[i]${NC}"

echo -e "${CYAN}== GrowTurk Doctor ==${NC}\n"

# 1. Hosts dosyasi
echo "1) Hosts dosyasi:"
if grep -qE "127\.0\.0\.1\s+(www\.)?growtopia1\.com" /etc/hosts; then
  echo -e "   $OK www.growtopia1.com -> 127.0.0.1"
else
  echo -e "   $BAD www.growtopia1.com hosts dosyasinda yok."
  echo -e "   Coz: sudo tee -a /etc/hosts <<EOF\n   127.0.0.1 www.growtopia1.com\n   127.0.0.1 www.growtopia2.com\n   EOF"
fi
if grep -qE "127\.0\.0\.1\s+(www\.)?growtopia2\.com" /etc/hosts; then
  echo -e "   $OK www.growtopia2.com -> 127.0.0.1"
else
  echo -e "   $BAD www.growtopia2.com hosts dosyasinda yok."
fi

# DNS cevirme dogrulamasi
RESOLVED=$(getent hosts www.growtopia1.com 2>/dev/null | awk '{print $1}' | head -1)
[ -z "$RESOLVED" ] && RESOLVED=$(dscacheutil -q host -a name www.growtopia1.com 2>/dev/null | grep ip_address | awk '{print $2}' | head -1)
if [ "$RESOLVED" = "127.0.0.1" ]; then
  echo -e "   $OK DNS cevirmesi 127.0.0.1 donuyor"
else
  echo -e "   $WARN DNS cevirmesi: $RESOLVED (cache temizle: sudo dscacheutil -flushcache)"
fi

# 2. SSL sertifikasi
echo ""
echo "2) SSL sertifikasi:"
CERT="data/runtime/ssl/server.crt"
if [ -f "$CERT" ]; then
  echo -e "   $OK $CERT mevcut"
  SAN=$(openssl x509 -in "$CERT" -noout -text 2>/dev/null | grep -A1 "Subject Alternative Name" | tail -1)
  if echo "$SAN" | grep -q "growtopia1.com"; then
    echo -e "   $OK Sertifikada www.growtopia1.com SAN var"
  else
    echo -e "   $BAD Sertifikada growtopia1.com SAN yok. Coz: rm data/runtime/ssl/* && npm run gen-cert"
  fi
  # macOS Keychain trust check
  if [ "$(uname -s)" = "Darwin" ]; then
    if security find-certificate -c "www.growtopia1.com" /Library/Keychains/System.keychain 2>/dev/null | grep -q "www.growtopia1.com"; then
      echo -e "   $OK Sertifika System Keychain'de"
    else
      echo -e "   $WARN Sertifika System Keychain'de bulunmuyor."
      echo -e "       Coz: sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain $CERT"
    fi
  fi
else
  echo -e "   $BAD Sertifika yok. Coz: npm run gen-cert"
fi

# 3. Portlar
echo ""
echo "3) Portlar:"
# 443 dinleniyor mu
if (echo > /dev/tcp/127.0.0.1/443) 2>/dev/null; then
  echo -e "   $OK Port 443 dinleniyor"
  # Bu sunucu mu cevap veriyor?
  RESP=$(curl -sk --max-time 2 https://127.0.0.1/growtopia/server_data.php 2>/dev/null | grep -c "RTENDMARKERBS1001")
  if [ "$RESP" = "1" ]; then
    echo -e "   $OK 443'te GrowTurk sunucusu cevap veriyor"
  else
    echo -e "   $WARN 443 baska bir sey dinliyor."
  fi
else
  echo -e "   $BAD Port 443 dinlemiyor."
  echo -e "       Coz 1 (kalici): ./scripts/portfwd.sh 8443"
  echo -e "       Coz 2 (anlik):  sudo ./start.sh"
fi

# 17091 UDP
if [ "$(uname -s)" = "Darwin" ]; then
  if lsof -nP -iUDP:17091 2>/dev/null | grep -q LISTEN; then
    echo -e "   $OK Port 17091 (UDP/ENet) dinleniyor"
  fi
else
  if ss -ulnp 2>/dev/null | grep -q ":17091"; then
    echo -e "   $OK Port 17091 (UDP/ENet) dinleniyor"
  fi
fi

# 4. Sunucu sagligi
echo ""
echo "4) Sunucu saglik kontrolu:"
HTTP=$(curl -s --max-time 2 http://127.0.0.1:8080/ 2>/dev/null | head -c 50)
if echo "$HTTP" | grep -q "<!doctype"; then
  echo -e "   $OK HTTP 8080 yanit veriyor"
else
  echo -e "   $BAD HTTP 8080 yanit vermiyor. Sunucu calisiyor mu? (./start.sh)"
fi

echo ""
echo -e "${CYAN}== Bitiren ozet ==${NC}"
echo "GT istemcisi baglanmiyorsa siralama:"
echo "  1. Hosts dosyasi 127.0.0.1 -> growtopia1/2.com (sudo gerek)"
echo "  2. SSL cert System Keychain'de guvenilir (macOS sudo gerek)"
echo "  3. Port 443'te HTTPS dinliyor (portfwd.sh veya sudo ./start.sh)"
echo "  4. UDP 17091 firewall'da acik"
echo ""

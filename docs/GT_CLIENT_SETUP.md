# Resmi Growtopia Istemcisini Sunucumuza Yonlendirme

Bu sunucu **growtopia.js (Rust + NAPI)** kullanir, dolayisiyla GT'nin
gercek CRC32 + range coder ENet uzantilarini destekler. Pure-JS `enet`
paketinin aksine bu kombinasyon resmi GT istemcisinin bekledigi protokolu
karsilar.

> Yalnizca **kisisel/egitim amacli** kullanim. Resmi Growtopia kullanim
> sartlarini ihlal etme; resmi hesabini kullanma.

## 1. Hosts Dosyasi

GT istemcisi `www.growtopia1.com` ve `www.growtopia2.com` adreslerine
HTTPS istegi atar. Bu domainleri sunucumuza yonlendir:

### macOS / Linux

```bash
sudo tee -a /etc/hosts > /dev/null <<EOF
127.0.0.1 www.growtopia1.com
127.0.0.1 www.growtopia2.com
127.0.0.1 growtopia1.com
127.0.0.1 growtopia2.com
EOF
sudo dscacheutil -flushcache 2>/dev/null || sudo systemd-resolve --flush-caches 2>/dev/null
```

### Windows

`C:\Windows\System32\drivers\etc\hosts` (Notepad'i **Yonetici** olarak ac):

```
127.0.0.1 www.growtopia1.com
127.0.0.1 www.growtopia2.com
127.0.0.1 growtopia1.com
127.0.0.1 growtopia2.com
```

CMD: `ipconfig /flushdns`

## 2. SSL Sertifikasi

GT istemcisi `https://www.growtopia1.com/growtopia/server_data.php` adresine
HTTPS istegi atar. Sunucu self-signed sertifika ile HTTPS sunar:

```bash
npm run gen-cert
```

Bu komut `data/runtime/ssl/server.{key,crt}` dosyalarini olusturur. Sunucu
otomatik olarak baslangicta calistirir. Olusturulan sertifikanin SAN'inda
**www.growtopia1.com, www.growtopia2.com, login.growserver.app, localhost**
bulunur.

**Sistemin sertifikayi guvenilir bulmasi icin:**

- **macOS**: `sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain data/runtime/ssl/server.crt`
- **Linux**:
  ```bash
  sudo cp data/runtime/ssl/server.crt /usr/local/share/ca-certificates/growturk.crt
  sudo update-ca-certificates
  ```
- **Windows**: server.crt dosyasina cift tikla → "Sertifika yukle" → "Yerel Bilgisayar" → "Guvenilir Kok Sertifika Yetkilileri"

## 3. Portlar

`config/default.json`:

```json
"network": {
  "gameHost": "0.0.0.0",
  "gamePort": 17091,
  "webHost": "0.0.0.0",
  "webPort": 8080,
  "loginPort": 8443,
  "publicHost": "127.0.0.1"
}
```

- **17091** UDP - ENet oyun (Growtopia protokolu)
- **8080** TCP - Web paneli + tarayici oyun istemcisi
- **8443** TCP - HTTPS GT istemci dashboard + server_data.php

## 4. Login Akisi

1. GT istemcisi `https://www.growtopia1.com/growtopia/server_data.php`'ye
   istek atar.
2. Sunucu `server|127.0.0.1 port|17091 loginurl|127.0.0.1:8443 type|1 type2|1`
   doner.
3. Istemci ENet ile 17091'e baglanir.
4. Sunucu `REQUEST_LOGIN_INFO` (type 1) gonderir.
5. Istemci `loginurl` adresinde HTTPS uzerinden web view acar:
   `/player/login/dashboard`.
6. Kullanici GrowID + sifre girer, form `/player/login/validate`'a POST eder.
7. Sunucu token uretir ve JSON doner.
8. Istemci token'i alip ENet uzerinden tankIDName/tankIDPass alanlarini
   doldurarak login mesajini gonderir.
9. Sunucu kullaniciyi `players.json`'a kaydeder ve `OnSetBux`, `OnSpawn`
   vb. variant paketlerini gonderir.

## 5. Bilinen Sinirlamalar

Bu sunucu kapsami:
- [OK] ENet handshake + CRC32 + range coder (growtopia.js)
- [OK] HTTPS server_data.php + login dashboard + validate endpoint
- [OK] REQUEST_LOGIN_INFO + login parsing
- [OK] OnSetBux, OnDialogRequest, OnConsoleMessage, OnTalkBubble, OnSpawn
- [OK] Hareket (TankPacket type 0), blok yerleme/kirma (type 3) yansitma
- [OK] Mevcut 116 komut + 10 aktivite + ekonomi entegrasyonu

Henuz eksik (gercek tam istemci uyumlulugu icin uzerine eklenmeli):
- **items.dat sifreli katalog gonderimi** (gercek GT 14k+ esya tanimi var).
  growtopia.js'in `ItemsDat` utility'si var, ama uretilmek icin gerek var.
  `assets/items.dat` koyup yukleme kodu eklenebilir.
- **World data binary kodlama** (gzip-compressed block array, OnSendMapData).
- **Items hash dogrulamasi** - GT istemcisi server'in items.dat hash'ini
  bilmek ister; aksi takdirde "Connection lost" verir.
- Tum gelisen opcode'lar (punch, trade, dropped, vending, vb.).

## 6. Sorun Giderme

**"Connection Lost"**:
- Hosts dosyasi yonlendirme dogru mu? `nslookup www.growtopia1.com` 127.0.0.1 donmeli.
- Sertifika sisteme yuklendi mi (yukarida 2. adim)?
- 17091 UDP firewall'da acik mi?

**Sunucu paket aldigini logluyor mu?**
```bash
DEBUG=1 npm start
```
`recv netID=X type=Y len=Z` log satirlari paket akisini gosterir.

**Items.dat hash hatasi**:
Gercek istemciler items.dat icerigini hashleyip server'a yollar, server
da kendi items.dat'ini hashleyip karsilastirir. Eslesmezse kopar. Bunun
icin gercek bir items.dat dosyasi gerekli (otomatik GT update'inden
elde edilen).

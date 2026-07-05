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

- **17091** UDP - ENet oyun (Growtopia protokolu)
- **8080** TCP - Web paneli + tarayici oyun istemcisi
- **443** TCP - **GT istemcisi sadece bu portu bekler** (HTTPS varsayilani)

GT istemcisi `https://www.growtopia1.com/growtopia/server_data.php` istegini
**her zaman 443'e** yapar. Custom port (8443 vb.) kullanmaz. Bu nedenle
sunucumuzun 443'te dinlemesi sart.

### Port 443 nasil acilir (3 yol)

**Yol 1: Port yonlendirme (onerilen - sudo bir kere, sonra her seferinde sudosuz)**

```bash
./scripts/portfwd.sh
# veya: npm run portfwd
```

macOS'ta `pfctl`, Linux'ta `iptables` ile 443 -> 8443 yonlendirir.
Sunucu makinen yeniden baslatildiktan sonra tekrar yapilmasi gerekir.

**Yol 2: Sudo ile baslat (her seferinde sudo)**

```bash
sudo ./start.sh
```

Node sureci root yetkisiyle calisir, dogrudan 443'u baglar.

**Yol 3: authbind (Linux only)**

```bash
sudo apt install authbind
sudo touch /etc/authbind/byport/443 && sudo chmod 500 /etc/authbind/byport/443
sudo chown $USER /etc/authbind/byport/443
authbind --deep node src/index.js
```

### Sunucu sudo'suz baslatilirsa ne olur?

Otomatik olarak 8443'e duser ve sana asagidaki gibi talimat verir:
```
HTTPS (fallback): https://0.0.0.0:8443/player/login/dashboard
!! GT istemcisi 443 bekler !! Iki secenek var:
   1) Port yonlendirme: ./scripts/portfwd.sh 8443  (sudo, bir kere)
   2) Sudo ile baslat: sudo ./start.sh             (her seferinde)
```

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

## 5. items.dat (Faz 1 ile eklendi)

Sunucu baslarken items.dat su sirayla aranir:

1. `config/default.json` -> `network.itemsDatPath` (ozel yol)
2. `assets/items.dat`
3. `data/items.dat`

Bulunamazsa **minimal bir items.dat uretilir** (cekirdek esyalar: toprak,
bedrock, ana kapi, kapi, tabela, lav, magara arkaplani, yumruk, anahtar).
Bu uretilen dosya sunucu akisini calistirir ama gercek istemcinin 14k+
esyasini icermez. **Gercek GT istemcisi ile tam uyumluluk icin** guncel
istemciden alinan `items.dat` dosyasini `assets/items.dat` olarak koy:

```bash
mkdir -p assets
cp /yol/gt/cache/items.dat assets/items.dat
```

Sunucu dosyanin proton hash'ini hesaplar ve login kabulunde
(`OnSuperMainStartAcceptLogonHrdxs...` ilk parametresi) istemciye bildirir.
Istemcinin lokal hash'i farkliysa `refresh_item_data` ister; sunucu da
items.dat'i `SEND_ITEM_DATABASE_DATA` (tank type 16) ile gonderir.

## 6. Bilinen Sinirlamalar

Bu sunucu kapsami:
- [OK] ENet handshake + CRC32 + range coder (growtopia.js)
- [OK] HTTPS server_data.php + login dashboard + validate endpoint
- [OK] REQUEST_LOGIN_INFO + login parsing
- [OK] **items.dat yukleme/uretme + proton hash + refresh_item_data gonderimi** (Faz 1)
- [OK] **Dunya binary serilestirme (SEND_MAP_DATA, world-pack v20)** (Faz 1)
- [OK] **Dunya secim menusu (OnRequestWorldSelectMenu), join_request, quit_to_exit** (Faz 1)
- [OK] **OnSpawn local/remote, OnRemove, envanter (SEND_INVENTORY_STATE)** (Faz 1)
- [OK] **Yumruk/blok yerlestirme sunucu tarafinda dunya verisine islenir** (Faz 1)
- [OK] OnSetBux, OnDialogRequest, OnConsoleMessage, OnTalkBubble
- [OK] Hareket (TankPacket type 0) netID damgali yayin
- [OK] Mevcut 116 komut + 10 aktivite + ekonomi entegrasyonu

Henuz eksik (sonraki fazlar):
- Dropped item'lar (yere esya dusurme/toplama), agac dikme/hasat.
- Kilit (lock) mekanigi, dunya sahipligi tile bazinda.
- Trade, vending, clothing (giysi giyme goruntusu).
- Tile activate (kapi ile dunyalar arasi gecis), checkpoint.
- World-pack yerlesimi GrowServer v20 formatini izler; farkli istemci
  surumlerinde alan farklari cikarsa `src/network/WorldSerializer.js`
  icinden tek noktadan ayarlanabilir.

## 7. Tani Araci

Sunuda **`./scripts/doctor.sh`** veya **`npm run doctor`** komutu hepsini
tek seferde kontrol eder: hosts dosyasi, DNS, sertifika, SAN, Keychain
guveni (macOS), 443 ve 17091 portlari, sunucu sagligi.

## 8. Sorun Giderme

**"check your internet and make sure you not using VPN"** (en sik):
- GT istemcisi `server_data.php`'ye ulasamiyor demek.
- `npm run doctor` calistir. Genelde port 443 dinlemiyordur (`./scripts/portfwd.sh` veya `sudo ./start.sh`).
- Veya hosts dosyasi/DNS cache sorunu.

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

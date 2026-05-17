# Resmi Growtopia Istemcisini Sunucumuza Yonlendirme

Bu sunucu ENet uzerinden gercek Growtopia protokolu konusur (port 17091).
Resmi GT istemcisi varsayilan olarak `www.growtopia1.com` / `www.growtopia2.com`
adreslerine bagliyor. Bizim sunucumuza yonlendirmek icin **hosts dosyasini**
duzenlemelisin.

> Bu yontem **sadece kisisel/egitim amacli** kullanim icindir. Resmi
> Growtopia kullanim sartlarini ihlal etme; resmi hesabini kullanma.

## macOS / Linux

```bash
sudo tee -a /etc/hosts > /dev/null <<EOF
127.0.0.1 www.growtopia1.com
127.0.0.1 www.growtopia2.com
127.0.0.1 growtopia1.com
127.0.0.1 growtopia2.com
EOF
```

DNS cache'ini temizle:
```bash
# macOS
sudo dscacheutil -flushcache && sudo killall -HUP mDNSResponder
# Linux (systemd-resolved)
sudo systemd-resolve --flush-caches
```

## Windows

`C:\Windows\System32\drivers\etc\hosts` dosyasini Notepad ile (Yonetici olarak)
ac ve sona ekle:
```
127.0.0.1 www.growtopia1.com
127.0.0.1 www.growtopia2.com
127.0.0.1 growtopia1.com
127.0.0.1 growtopia2.com
```

CMD'de: `ipconfig /flushdns`

## HTTPS Sorunu

GT istemcisi `https://www.growtopia1.com/growtopia/server_data.php`'ye HTTPS
istegi atar. Yerel sunucumuz `http://localhost:8080` dinler. Bu yuzden iki
secenek var:

### Secenek A: Proxy aracilik
[GTProxy](https://github.com/derTuga/GTProxy) gibi bir araci kullan.

### Secenek B: Self-signed cert + GT istemcisi MITM patch
Ileri seviye - cert yukleyerek HTTPS'i lokalde karsila.

## Sunucu config

`config/default.json` icindeki `network.gamePort` (17091) ENet port'udur.
`network.webPort` (8080) panel ve `server_data.php` icindir.

Sunucu acilinca log'da goreceksin:
```
[OK] ENet (Growtopia) sunucusu dinliyor: 0.0.0.0:17091
```

## Bilinen Sinirlamalar

Bu base implementasyon:
- ENet handshake + login
- TextPacket / TankPacket encode/decode
- variant_t encoder (OnConsoleMessage, OnDialogRequest, OnTalkBubble, OnSpawn, OnSetBux)
- Mevcut komut sistemine entegre (`/help`, `/daily`, `/slots`, vb. hepsi calisir)
- Hareket (TankPacket type 0) ve blok yerlestirme/kirma (type 3) yansitma

Henuz tam degil:
- Items.dat sifreli katalog gonderimi (gercek GT 14k+ esya tanimi)
- World data binary kodlama (gzip-compressed block array)
- Tum opcode'larin (puch, trade, dropped, vb.) detayli iskini
- `server_data.php` HTTPS karsilama (`/server_data` endpoint var ama HTTPS yok)

Bu sinirlar GT protokolunun resmi olmamasi ve cok genis bir surface'e
sahip olmasindan dolayi acik kaynak repolarda da kismi olur. Bu sunucu,
protokolun **iskeletini ve gercek komut/aktivite/panel altyapisini**
saglar; tam istemci uyumlulugu icin uzerine eklemeler yapmalisin.

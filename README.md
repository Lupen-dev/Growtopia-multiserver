# GrowTurk MultiServer

Eglenceli, cok komutlu, web panelli ozel Growtopia tarzi sunucu.
**macOS** ve **Linux** uzerinde tek komutla calisir, native bagimliligi yoktur.

## Hizli Baslangic

```bash
./start.sh
```

Ilk calistirmada otomatik olarak:
- Node 18+ kontrolu yapilir.
- `npm install` ile `express` ve `ws` paketleri yuklenir.
- Veritabani tohumlanir (esyalar, demo dunyalar, varsayilan admin hesabi).

Acildiginda:
- **Oyun (Web istemcisi)**: http://localhost:8080/play
- **Admin Paneli**: http://localhost:8080/admin
- **Varsayilan admin**: `admin / growtopia123` (ilk giriste degistirin)

Konsol acik kalir — `help` yazarak komutlari gor.

## Ozellikler

### 80+ Komut
- **Genel**: `/help`, `/who`, `/stats`, `/serverinfo`, `/motd`, `/time`, `/uptime`, `/ping`, `/rules`, `/top`, `/report`
- **Gezinme**: `/go`, `/home`, `/sethome`, `/spawn`, `/worlds`, `/create`, `/lock`, `/unlock`
- **Sohbet**: `/msg`, `/r`, `/me`, `/shout` (50g), `/mute`
- **Sosyal**: `/friend`, `/friends`, `/unfriend`, `/clan create|join|leave`
- **Ekonomi**: `/balance`, `/daily`, `/vote`, `/pay`, `/shop`, `/buy`, `/sell`, `/use`
- **Eglence**: `/dance`, `/wave`, `/laugh`, `/cry`, `/flex`, `/8ball`, `/rps`, `/spin`, `/mystery`, `/roll`
- **Aktivite**: `/fish`, `/mine`, `/farm`, `/casino`, `/slots`, `/roulette`, `/blackjack`, `/coinflip`, `/dice`, `/lottery`, `/quiz`, `/parkour`, `/pvp`, `/accept`, `/attack`, `/flee`, `/treasure`, `/boss`, `/event`
- **Moderasyon**: `/kick`, `/modmute`, `/unmute`, `/jail`, `/unjail`, `/warn`, `/tp`, `/tphere`, `/freeze`, `/announce`, `/clearchat`, `/history`, `/modchat`, `/seeinv`, `/eventstart`
- **Admin**: `/ban`, `/unban`, `/promote`, `/demote`, `/give`, `/take`, `/setgems`, `/addgems`, `/setlevel`, `/globalmsg`, `/maintenance`, `/save`, `/reload`, `/spawnboss`, `/startquiz`, `/drawlottery`, `/createworld`, `/delworld`, `/resetplayer`, `/sudo`, `/op`, `/logs`, `/stats-server`, `/restart`, `/shutdown`

### 10 Aktivite Modulu
1. **Kumarhane** — Slot, rulet, blackjack, coinflip, zar
2. **Balik tutma** — Olta sansi, nadir balik, otomatik XP/gem
3. **Madencilik** — Kazma seviyesi, mystic crystal sansi
4. **Tarim** — Tohum ek, bekle, hasat
5. **Piyango** — Bilet al, periyodik cekilis, anlik havuz
6. **Quiz** — Global bilgi yarismasi, ilk dogru cevap kazanir
7. **Parkur** — Belirli sure katilim, 3 sirali odul
8. **PvP Duello** — Tur tabanli, silah/zirh hesabi, bahis
9. **Hazine Avi** — 10x10 izgara, hot/cold ipucu
10. **Boss Raid** — Global, hasara orantili pay dagilimi

### Dinamik Sunucu Olaylari
- Cifte Gem Saati (2x gem)
- Bonus XP (3x XP)
- Meteor Yagmuru, Nadir Dusurme, Flas Indirim

### Detayli Web Paneli
- **Pano**: Online sayisi, RAM, uptime, aktif olaylar, top zenginler, hizli yayinpurple
- **Oyuncular**: Arama, filtre, detay, kick/mute/jail/ban/warn, rol/gem/lvl ayari, reset
- **Dunyalar**: Olustur, sil, ziyaret istatistigi
- **Canli Sohbet**: WebSocket akisi
- **Banlar**: Aktif yasak/susturma listesi
- **Denetim**: Tum yonetim eylemleri kayitli
- **Olaylar**: Manuel baslat/durdur
- **Esyalar**: Tam katalog
- **Ekonomi**: Top 25 zengin
- **Konsol** (sadece owner): Web uzerinden sunucu komutu, canli log akisi
- **Yonetici Hesaplari** (sadece owner): Helper/Mod/Admin/Owner ekle-cikar
- **Hesap**: Sifre degistir

## Manuel Adim

Native bagimlilik yok, sadece Node 18+ yeterli:

```bash
# macOS
brew install node
git clone <repo> && cd Growtopia-multiserver
./start.sh

# Linux (Ubuntu/Debian)
sudo apt update && sudo apt install -y nodejs npm
git clone <repo> && cd Growtopia-multiserver
./start.sh
```

## Yapi

```
Growtopia-multiserver/
  start.sh              # Tek komutla baslatma
  package.json          # Sadece express + ws
  config/default.json   # Tum ayarlar
  data/items.seed.json  # 50+ esya katalogu
  scripts/seed.js       # Veritabani tohumla
  scripts/reset.js      # Tum verileri sifirla
  src/
    index.js                  # Ana giris noktasi
    core/
      Logger, Database, Permissions
      PlayerManager, WorldManager, ItemManager
      EconomyManager, ChatManager, BanManager
      AuditLog, CommandHandler, EventManager
      ActivityManager, Console
    commands/                 # 80+ komut
      player.js, fun.js, mod.js, admin.js
    activities/               # 10 aktivite
      Casino, Fishing, Mining, Farming
      Lottery, Quiz, Parkour, PvP
      TreasureHunt, BossRaid
    network/GameServer.js     # Oyuncu WebSocket
    web/
      WebServer.js, auth.js   # Express + admin auth
      public/                 # HTML/CSS/JS istemciler
```

## Komutlarin Tamami

Bir oyuncu giris yaptiktan sonra `/help` ile tam liste alabilir. Yetki seviyeleri:
`player < vip < helper < mod < admin < owner`.

## Sifirla & Tohumla

```bash
npm run reset    # data/runtime/ icindeki her seyi siler ve yeniden tohumlar
npm run seed     # sadece eksik tablolari olusturur
```

## Notlar

- Veritabani **dosya tabanli JSON** (data/runtime/), her 15 saniyede bir auto-save.
- Tum sifreler `scrypt + salt` ile hashlenir.
- Web admin oturumlari bellekte tutulur (24sn TTL, ayarlanabilir).
- Bu sunucu **resmi Growtopia istemcisini desteklemez**; kendi WebSocket istemcisini kullanir (`/play`). Ozellikle Turkce topluluk icin sifirdan tasarlandi.

## Lisans

MIT.

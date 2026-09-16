# Jarvis: WhatsApp üzerinden arayan sesli sunucu ajanı

Jarvis her sabah (varsayılan 06:00) seni **WhatsApp'tan sesli arar**, gece sunucuda olanları anlatır
ve sorularına cevap verir: "Kimse kızgın mı?", "Kaç kişi kayıt oldu?", "Hata var mı?".
"Beş dakika sonra ara" dersen kapatıp tekrar arar; "görüşürüz" dersen kapatır.

Arama yapılamıyorsa (izin yoksa, limit dolduysa) rapor WhatsApp'a **metin** olarak gelir.
WhatsApp'a yazarak da konuşabilirsin: `ara`, `rapor`, `durum`, `izin` komutları ve serbest sohbet.

## Nasıl çalışıyor

```
06:00 zamanlayıcı ──► Twilio Voice API ──► WhatsApp araması (senin telefonun)
                                              │  ses ⇄ metin (ConversationRelay)
                                              ▼
                       wss://SUNUCU/jarvis/relay  ◄──► Claude (gece raporu + Jarvis kişiliği)
```

1. `src/jarvis/scheduler.js` saat gelince `callNow('briefing')` çağırır.
2. Twilio, `POST /jarvis/voice` adresinden TwiML alır: `<Connect><ConversationRelay url="wss://.../jarvis/relay" language="tr-TR" .../>`.
3. Twilio konuşmayı Türkçe metne çevirip WebSocket'e yollar; `src/jarvis/relay.js` Claude'a sorar, cevabı cümle cümle geri yollar; Twilio Türkçe seslendirir.
4. `src/jarvis/briefing.js` raporu `data/runtime/*.json` ve `logs/` üzerinden üretir: yeni kayıtlar, giriş yapanlar, en yoğun an, şikayetler (`/report`), ban/mute, sohbet sayısı, etkinlikler, piyango, yeniden başlama, hata sayısı.

## Önce bilmen gerekenler (Meta / Twilio kısıtları)

- **İşletme numaran +90 olamaz.** Meta, Türkiye numaralı WhatsApp işletme hesaplarından *işletme başlatmalı* aramaya izin vermiyor (ABD, Kanada, Mısır, Nijerya, Vietnam da yasak). Aranan numara (senin WhatsApp'ın) Türkiye olabilir. Çözüm: Twilio'dan İngiltere/Almanya gibi bir numara alıp WhatsApp sender olarak kaydetmek.
- **Meta Business Verification şart.** Sender'da aramayı açabilmek için WhatsApp Business hesabının mesaj limiti en az 2.000 işletme başlatmalı konuşma olmalı; bu da işletme doğrulaması gerektirir.
- **Arama izni:** Jarvis önce WhatsApp'tan bir "arama izni" isteği yollar, sen "İzin ver"e basarsın. İzin 7 gün geçerli, bu sürede 24 saatte en fazla 5 arama. İzin isteği 24 saatte 1, 7 günde 2 kez gönderilebilir. 4 ardışık cevapsız arama izni iptal eder. Jarvis bu sayaçları `data/runtime/jarvis.json` içinde tutar ve izin bitmeden yenisini ister.
- İzin isteği sadece **açık bir 24 saatlik oturumda** gönderilebilir (sen bota bir şey yazdıktan sonraki 24 saat). Jarvis, sen mesaj yazınca izin gerekiyorsa isteği otomatik yollar. Şablonu Meta'ya onaylatırsan oturum dışında da gönderilebilir.
- Bu şartları karşılayamıyorsan `JARVIS_CHANNEL=phone` ile aynı ajan **normal telefon araması** yapar (Türkiye cep dakikası yaklaşık 0,29 $; Twilio'da +90 numara yok, yurt dışı numaradan arar).

## Kurulum

### 1. Twilio

1. Twilio hesabı aç, **Account SID** ve **Auth Token** al.
2. WhatsApp sender kaydet (Messaging → Senders → WhatsApp senders), numara +90 olmasın.
3. Console → Voice → Settings → Privacy & Security: ConversationRelay için AI/ML addendum'u kabul et.
4. **TwiML App** oluştur (Voice → TwiML Apps): Voice Request URL = `https://SUNUCUN/jarvis/voice`. Sender'ın detay sayfasında *Voice Endpoint Configuration* kısmından bu TwiML App'i seç (bu adım sender'da aramayı açar).
5. Sender'ın **Messaging webhook** adresini `https://SUNUCUN/jarvis/whatsapp` yap (izin cevapları ve yazışma buradan gelir).

### 2. Sunucuyu dışarı aç

Twilio'nun sunucuya HTTPS/WSS ile ulaşması gerekir. Geliştirme için:

```bash
ngrok http 8080
# çıkan https://xxxx.ngrok-free.app adresini JARVIS_PUBLIC_URL yap
```

Kalıcı kullanımda bir VPS + reverse proxy (Caddy/nginx) ile aynı portu HTTPS'e çıkar. WebSocket upgrade'in proxy'den geçtiğinden emin ol.

### 3. `.env`

```bash
cp .env.example .env
```

En az şunlar dolu olmalı: `JARVIS_ENABLED=1`, `JARVIS_PUBLIC_URL`, `JARVIS_TO`, `JARVIS_FROM`,
`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `ANTHROPIC_API_KEY`. Değişkenlerin açıklaması `.env.example` içinde.

### 4. Başlat

```bash
./start.sh
```

Konsolda `Jarvis hazir ... Sonraki arama: ...` satırını görmelisin. Konsol komutları:

| Komut | Ne yapar |
|---|---|
| `jarvis durum` | izin durumu, limitler, sonraki arama |
| `jarvis ara` | hemen ara |
| `jarvis rapor` | raporu konsola yaz |
| `jarvis gonder` | raporu WhatsApp'a metin olarak yolla |
| `jarvis izin` | WhatsApp arama izni iste |
| `jarvis sohbet <metin>` | Claude'a yazılı sor |

### 5. İlk izin

WhatsApp'tan bota herhangi bir mesaj yaz (`jarvis` gibi). Jarvis izin isteğini yollar; "İzin ver"e bas.
Sonra `ara` yazarak hemen test edebilirsin.

## Twilio olmadan test

- **Beyin testi** (sadece Claude anahtarı gerekir, sunucu kapalı olabilir):
  `npm run jarvis:chat` (yazışma) veya `npm run jarvis:chat -- --voice` (sesli mod; kontrol işaretleri görünür).
- **Boru hattı testi** (Claude anahtarı bile gerekmez): `.env` içinde `JARVIS_DRY_RUN=1 JARVIS_VALIDATE_SIGNATURES=0`
  ile sunucuyu başlat, başka bir terminalde `npm run jarvis:simulate`. Twilio'nun yollayacağı mesajları taklit eder;
  yazdıkların "sahibin söyledikleri" olur, `/kes` araya girer.
- **Birim testleri:** `npm test`.

## Admin API

Web panel token'ı (`x-auth` başlığı, admin rolü) ile:

- `GET /jarvis/status`, `GET /jarvis/report`
- `POST /jarvis/call`, `POST /jarvis/permission`, `POST /jarvis/report`

## Maliyet

Günde bir 2-3 dakikalık arama için Twilio ConversationRelay dakika ücreti + WhatsApp arama ücreti (Meta'nın işletme başlatmalı arama tarifesi) + Claude için birkaç sent. Aylık toplam birkaç dolar seviyesindedir; güncel rakamlar için Twilio fiyat sayfasına bak.

## Dosyalar

```
src/jarvis/
  index.js       Jarvis sınıfı: zamanlayıcı, arama, WhatsApp mesajları, durum
  config.js      .env okuma ve doğrulama
  briefing.js    gece raporu (veri + Türkçe metin)
  brain.js       Claude API (streaming), sistem promptu, dry-run beyin
  relay.js       ConversationRelay WebSocket oturumu (prompt/interrupt/end)
  textStream.js  cümle cümle TTS akışı, [[KAPAT]] / [[ERTELE:N]] işaretleri
  twilio.js      arama, mesaj, izin şablonu, TwiML, imza doğrulama
  permissions.js WhatsApp arama izni ve limit sayaçları
  scheduler.js   günlük zamanlayıcı (saat dilimi/DST güvenli)
  routes.js      /jarvis/* Express rotaları
  state.js       data/runtime/jarvis.json
  standalone.js  sunucusuz ctx (scriptler için)
scripts/jarvis-chat.js, scripts/jarvis-simulate.js, test/jarvis.test.js
```

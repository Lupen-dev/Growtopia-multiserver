# Jarvis (Telegram): bedava ve basit kurulum

Twilio, WhatsApp Business hesabı, yurt dışı numara, işletme doğrulaması: hiçbiri gerekmez.
Tek ihtiyacın bir Telegram botu (1 dakika) ve Claude anahtarı. Her şey resmi ve ücretsiz API'lerle çalışır.

Sabah 06:00'da olan şey:

1. **Telefonun çalar** (isteğe bağlı, CallMeBot): Telegram üzerinden gelen aramayı açınca Jarvis kısa özeti okur:
   "Günaydın efendim, ben Jarvis. Gece raporu: 12 oyuncu girdi, 2 yeni kayıt, 1 şikayet, hata yok. Ayrıntılar Telegram'da."
2. **Bot raporu gönderir**: tam rapor metin olarak ve **sesli mesaj** olarak (Türkçe, Edge TTS).
3. **Soru sorarsın**: yazarak ya da sesli mesajla ("kimse kızgın mı?"). Jarvis rapor üzerinden cevaplar, cevap yine metin + sesli mesaj gelir.

Videodaki gibi iki yönlü canlı telefon konuşması istiyorsan o Twilio yolu: `docs/JARVIS_WHATSAPP.md`.

## Kullanılan bedava servisler

| Ne | Servis | Ücret | Hesap |
|---|---|---|---|
| Mesaj, sesli mesaj, komutlar | Telegram Bot API | ücretsiz | @BotFather ile bot |
| Telefonu çaldırıp özeti okuma | [CallMeBot Telegram Call API](https://www.callmebot.com/telegram-call-api/) | ücretsiz (kuyruk/gecikme olabilir) | @CallMeBot_txtbot'a `/start` |
| Türkçe seslendirme | Microsoft Edge okuma servisi (`msedge-tts`) | ücretsiz | yok |
| Sesli mesajı yazıya çevirme | [Groq Whisper](https://console.groq.com) | ücretsiz katman (günde 2.000 istek) | e-posta ile kayıt, kart yok |
| Beyin | Claude API | kullandığın kadar, günde birkaç sent | Anthropic API anahtarı |

Notlar:
- CallMeBot ücretsiz katmanda aramayı sıraya alır, birkaç dakika gecikebilir. Metin en fazla 256 karakter; Jarvis özeti buna göre kısaltır. iPhone'da Telegram aramasında ses çalmama sorunu bildirilmiş; Android'de sorun yok.
- Edge TTS resmi bir API değildir; Microsoft tarafı değişirse ses üretilemeyebilir. O durumda Jarvis sadece metin gönderir, hiçbir şey kırılmaz.
- Groq anahtarı vermezsen sesli mesajla soru soramazsın, yazarak sorabilirsin.

## Kurulum (5 dakika)

1. **Bot oluştur:** Telegram'da @BotFather'a `/newbot` yaz, isim ver, verdiği token'ı kopyala.
2. **`.env` doldur:**
   ```bash
   cp .env.example .env
   ```
   ```
   JARVIS_ENABLED=1
   TELEGRAM_BOT_TOKEN=123456:ABC-DEF
   ANTHROPIC_API_KEY=sk-ant-...
   CALLMEBOT_USER=@telegram_kullanici_adin   # telefon çalsın istiyorsan
   GROQ_API_KEY=gsk_...                       # sesli soru için, isteğe bağlı
   ```
3. **Başlat:** `./start.sh`. Konsolda `Jarvis hazir (telegram)` görmelisin.
4. **Kendini tanıt:** Telegram'da botuna `merhaba` yaz. Bot sana chat ID'ni söyler; `.env`'e `TELEGRAM_CHAT_ID=...` yazıp yeniden başlat. (Ya da `TELEGRAM_CHAT_ID=@kullaniciadin` yaz, ilk mesajında eşleşir.)
5. **Telefon çalsın istiyorsan:** @CallMeBot_txtbot'a `/start` yaz. Bir kere yeter.
6. **Dene:** bota `ara` yaz. Telefonun çalar (CallMeBot açıksa), ardından rapor sesli ve yazılı gelir.

Sunucuyu dışarı açmak gerekmez: bot long polling ile Telegram'a kendisi bağlanır.

## Bot komutları

| Yazdığın | Ne olur |
|---|---|
| `ara` | CallMeBot ile telefon çalar, rapor sesli + yazılı gelir |
| `rapor` | rapor sesli + yazılı gelir |
| `durum` | ajan durumu (sonraki arama, ayarlar) |
| `/start` | yardım |
| başka bir şey ya da sesli mesaj | Claude cevaplar (sesli + yazılı) |

Konsoldan: `jarvis durum`, `jarvis ara`, `jarvis rapor`, `jarvis gonder`, `jarvis sohbet <metin>`.

## Ayarlar

`.env.example` içindeki TELEGRAM bloğu:

- `TELEGRAM_CHAT_ID`: sayısal ID veya `@kullaniciadi`. Bu kişi dışındakilerin mesajları yok sayılır.
- `CALLMEBOT_LANG`: aramada okuyan ses, Google standart sesleri (`tr-TR-Standard-A..E`).
- `JARVIS_TTS=0`: sesli mesajı kapat, sadece metin.
- `JARVIS_TTS_VOICE`: `tr-TR-EmelNeural` (kadın) veya `tr-TR-AhmetNeural` (erkek).
- `JARVIS_CALL_TIME`, `JARVIS_TIMEZONE`, `JARVIS_SCHEDULE`: zamanlama.

## Twilio olmadan test

- `npm run jarvis:chat` sadece beyni dener (Claude anahtarı yeter).
- `JARVIS_DRY_RUN=1` ile Claude yerine sabit cevaplar döner; Telegram akışını anahtarsız görebilirsin.
- `npm test` birim testleri (Telegram, CallMeBot, ses ve rapor mantığı sahte ağ ile).

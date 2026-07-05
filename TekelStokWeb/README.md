# Tekel Stok — Web Sürümü (Telefondan Kullanılır)

iOS uygulamasıyla aynı özelliklere sahip, **her telefonda tarayıcıdan çalışan** sürüm.
Bilgisayarınızda çalışır, telefonunuz Safari/Chrome ile bağlanır. Apple hesabı, Mac veya App Store gerekmez.

## Özellikler

- 📷 Kamera ile barkod okuma (EAN-13/8, UPC, Code 128/39, QR)
- 🆕 Bilinmeyen barkod okutulunca otomatik ürün tanımlama formu
- 🛒 Hızlı satış: okut → sepete eklenir → "Satışı Tamamla" ile stok otomatik düşer
- 📦 Stok takibi: kritik stok uyarısı, stok giriş/çıkış/fire hareket geçmişi
- 📊 Günlük/haftalık/aylık ciro-kâr raporu, çok satanlar, satış geçmişi
- 💾 Veriler bilgisayarınızda `data/db.json` dosyasında saklanır

## Kurulum (Windows veya Mac)

1. [Node.js](https://nodejs.org) indirip kurun (LTS sürüm)
2. Bu klasörde terminal/komut istemi açın:
   ```bash
   npm install
   npm start
   ```
3. Sunucu `http://localhost:3000` adresinde çalışır.

## Telefondan Bağlanma

Kamera erişimi için tarayıcılar **HTTPS** zorunlu tutar. En kolay yol Cloudflare tüneli:

1. [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) indirin (hesap gerekmez)
2. İkinci bir terminalde:
   ```bash
   cloudflared tunnel --url http://localhost:3000
   ```
3. Ekranda çıkan `https://....trycloudflare.com` adresini telefonunuzda açın
4. Safari'de **Paylaş → Ana Ekrana Ekle** derseniz uygulama simgesi gibi görünür

> Not: `trycloudflare.com` adresi her başlatmada değişir. Sabit adres isterseniz
> ücretsiz Cloudflare hesabı + kendi alan adınızla kalıcı tünel kurulabilir.
> Aynı Wi-Fi üzerinden `http://BILGISAYAR-IP:3000` ile de bağlanılır ama bu
> durumda kamera çalışmaz (HTTPS olmadığı için); elle barkod girişi çalışır.

## Veri Yedekleme

Tüm veriler `data/db.json` dosyasındadır — bu dosyayı kopyalamak yedek almak demektir.

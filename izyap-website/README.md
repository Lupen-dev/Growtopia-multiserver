# İZYAP İnşaat — Kurumsal Web Sitesi

Tek sayfa, statik, bağımlılıksız modern bir kurumsal web sitesi.
Lacivert + altın tema, "Yeni Bir Yaşam" sloganı etrafında tasarlandı.

## Bölümler

1. **Hero** — Slogan, CTA butonları, canlı sayaçlar, öne çıkan proje kartı (İz Tower Blue)
2. **Hakkımızda** — Şirket hikayesi + Güven / Kalite / Yenilik / İstikrar değerleri
3. **İstatistikler** — Animasyonlu büyük rakamlar
4. **Hizmetler** — Konut, Ticari, Kentsel Dönüşüm, Lüks Rezidans, Anahtar Teslim, Danışmanlık
5. **Projeler** — İz Tower Blue, İzyap Residence, İzyap Business Center kartları
6. **Süreç** — 4 adımlı çalışma akışı
7. **Kurucu** — Hikmet İzbey kartı + alıntı + Instagram linki
8. **İletişim** — Adres / Telefon / WhatsApp / E-posta + Hızlı teklif formu (WhatsApp deep-link)
9. **Footer** — Logo, kurumsal linkler, sosyal medya
10. **WhatsApp Floating Button** — Sağ altta sabit

## Çalıştırmak

Herhangi bir build aracına ihtiyaç yok. Aşağıdaki yöntemlerden biriyle açabilirsiniz:

```bash
# Yöntem 1 — Doğrudan tarayıcıda
open izyap-website/index.html        # macOS
xdg-open izyap-website/index.html    # Linux

# Yöntem 2 — Yerel sunucu (önerilir, SVG asset'leri için)
cd izyap-website
python3 -m http.server 8000
# tarayıcıda http://localhost:8000
```

## Yayına Almak

Klasör tamamen statiktir. GitHub Pages, Netlify, Vercel veya
herhangi bir CDN/sunucuya doğrudan yüklenebilir.

```bash
# Örnek: GitHub Pages
# Repo Settings → Pages → Branch: main → Folder: /izyap-website
```

## Dosya Yapısı

```
izyap-website/
├── index.html              # Tüm bölümler tek sayfada
├── css/
│   └── style.css           # Tema, layout, animasyonlar
├── js/
│   └── main.js             # Scroll efektleri, sayaçlar, form
└── assets/
    ├── logo.svg            # Koyu zemin için altın logo
    ├── logo-light.svg      # Açık zemin için logo
    ├── hero-pattern.svg    # Skyline arka plan
    ├── project-iztower.svg
    ├── project-residence.svg
    └── project-commercial.svg
```

## İçerik Notu

Şirket bilgileri (adres, telefon, e-posta, projeler) İZYAP İnşaat A.Ş.'nin
kamuya açık kaynaklarından (`izyapinsaat.com`, Instagram `@izyap_insaat`)
derlenmiştir. Gerçek logoya erişim olmadığı için stilize bir
yer tutucu logo üretilmiştir; orijinal markayı kullanmadan önce
resmi logo dosyasıyla `assets/logo*.svg` değiştirilmelidir.

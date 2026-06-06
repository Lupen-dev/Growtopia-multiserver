# Sarı Ticaret — Kurumsal Web Sitesi

Beton · Hafriyat · Malzeme Satışı yapan firma için modern, hızlı ve mobil uyumlu
tek sayfalık (one-page) tanıtım sitesi. **ISM Beton yetkili bayii** vurgusuyla
müşteri çekmeye yönelik UI/UX ile tasarlanmıştır.

> **Site tasarımı: Altuncloud — Morina A.Ş.**

## Özellikler

- 🎨 **Marka uyumlu tasarım** — "Sarı" ismine uygun amber/sarı aksan rengi
- ⚡ **Sıfır bağımlılık** — saf HTML/CSS/JS, build adımı yok, anında açılır
- 📱 **Tam responsive** — mobil, tablet ve masaüstünde kusursuz
- ✨ **Scroll animasyonları** — IntersectionObserver ile akıcı reveal efektleri
- 🔢 **Animasyonlu sayaçlar** — tecrübe, proje, memnuniyet istatistikleri
- 🧭 **Yapışkan menü + mobil drawer** — aktif bölüm takibi (scroll spy)
- 📝 **Teklif formu** — doğrulama + WhatsApp'a otomatik yönlendirme
- 💬 **Yüzen WhatsApp butonu** & yukarı çık butonu
- 🗺️ **Harita** (OpenStreetMap embed) — anahtar gerektirmez
- ♿ **Erişilebilirlik** — ARIA etiketleri, `prefers-reduced-motion` desteği
- 🔍 **SEO** — meta etiketleri, Open Graph, anlamlı başlık yapısı

## Bölümler

1. Hero (kahraman alan + istatistikler)
2. Avantaj şeridi (teslimat, kalite, fiyat, destek)
3. Hizmetler (Hazır Beton · Hafriyat & Kazı · Malzeme Satışı)
4. Hakkımızda
5. İstatistik bandı
6. Çalışma süreci (4 adım)
7. Galeri
8. Müşteri yorumları
9. CTA bandı
10. İletişim + form + harita
11. Footer

## Çalıştırma

Hiçbir kurulum gerekmez. Aşağıdakilerden biri:

```bash
# 1) Doğrudan tarayıcıda aç
xdg-open website/index.html      # Linux
open website/index.html          # macOS

# 2) Basit yerel sunucu (önerilen)
cd website
python3 -m http.server 8000
# http://localhost:8000
```

## Özelleştirme

| Ne | Nerede |
|----|--------|
| Telefon / WhatsApp numarası | `index.html` & `js/main.js` içindeki `905555555555` |
| E-posta, adres | `index.html` (topbar, iletişim, footer) |
| Renkler | `css/style.css` → `:root` değişkenleri (`--accent` vb.) |
| Metinler / hizmetler | `index.html` ilgili bölümler |
| Görseller | `.service__media`, `.gallery__item`, `.about__img` arka planlarına gerçek foto ekleyin |
| Instagram linki | `https://www.instagram.com/sarihafriyat` |

> Görseller şu an placeholder gradyanlardır. Gerçek şantiye fotoğraflarını
> `website/assets/` klasörüne ekleyip ilgili CSS sınıflarındaki `background-image`
> değerlerini güncelleyebilirsiniz.

---

© Sarı Ticaret — Site tasarımı **Altuncloud — Morina A.Ş.**

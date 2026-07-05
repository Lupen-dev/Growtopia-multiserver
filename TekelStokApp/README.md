# Tekel Stok — iOS Barkodlu Stok & Satış Uygulaması

Tekel dükkanları için tasarlanmış, tamamen **cihaz üzerinde çalışan** (internet gerektirmeyen) iOS uygulaması.

## Özellikler

- 📷 **Barkod okuma** — Kamera ile EAN-13, EAN-8, UPC-E, Code 128/39 ve QR kod okuma (VisionKit)
- 🆕 **Barkod tanımlama** — Bilinmeyen bir barkod okutulduğunda otomatik olarak ürün ekleme formu açılır
- 📦 **Stok takibi** — Mevcut stok, kritik stok uyarısı (rozet + rapor), stok giriş/çıkış/fire hareket geçmişi
- 🛒 **Hızlı satış** — Barkodu okut → ürün sepete eklenir → "Satışı Tamamla" ile stok otomatik düşer
- 💳 **Ödeme türü** — Nakit / Kart ayrımı
- 📊 **Raporlar** — Günlük, haftalık, aylık ciro ve kâr; çok satan ürünler grafiği; satış geçmişi ve fiş detayı
- 💾 **Veri saklama** — SwiftData ile tüm veriler cihazda güvenle saklanır

## Gereksinimler

- **Mac** (Xcode yalnızca macOS'ta çalışır) + **Xcode 15 veya üzeri**
- **iOS 17+** yüklü bir iPhone (barkod okuma gerçek cihaz gerektirir; simülatörde elle barkod girişi kullanılabilir)
- Ücretsiz bir Apple ID (kendi telefonunuza kurulum için Apple Developer üyeliği gerekmez)

## Kurulum

Proje dosyası [XcodeGen](https://github.com/yonaskolb/XcodeGen) ile üretilir:

```bash
brew install xcodegen
cd TekelStokApp
xcodegen generate
open TekelStok.xcodeproj
```

Xcode açıldıktan sonra:

1. Sol panelde **TekelStok** hedefini seçin → **Signing & Capabilities** sekmesi
2. **Team** olarak kendi Apple ID'nizi seçin (Xcode → Settings → Accounts'tan ekleyebilirsiniz)
3. iPhone'unuzu USB ile bağlayın, üstteki cihaz listesinden telefonunuzu seçin
4. **▶ Run** (Cmd+R) ile telefona yükleyin
5. Telefonda **Ayarlar → Genel → VPN ve Cihaz Yönetimi**'nden geliştirici profilinize güvenin

> Not: Ücretsiz Apple ID ile kurulan uygulamalar 7 günde bir yeniden yüklenmelidir. Kalıcı kullanım için yıllık Apple Developer üyeliği (99 USD) ile TestFlight/App Store dağıtımı yapılabilir. Veriler yeniden yüklemede silinmez (aynı bundle ID ile).

## Kullanım Akışı

1. **İlk kurulum:** Ürünler sekmesinde barkod okutarak ya da + ile ürünlerinizi tanımlayın (ad, alış/satış fiyatı, stok adedi)
2. **Satış:** Satış sekmesinde müşterinin aldığı ürünlerin barkodlarını okutun; adetleri gerekirse artırın; ödeme türünü seçip **Satışı Tamamla**'ya basın — stok otomatik düşer
3. **Stok yenileme:** Ürün detayına girip "Stok Girişi (Alış)" ile yeni gelen malı ekleyin
4. **Takip:** Raporlar sekmesinden günlük ciro/kâr ve kritik stokları izleyin

## Proje Yapısı

```
TekelStokApp/
├── project.yml              # XcodeGen proje tanımı
└── TekelStok/
    ├── TekelStokApp.swift   # Uygulama girişi (SwiftData container)
    ├── Models/
    │   ├── Product.swift    # Ürün + stok hareketi modelleri
    │   └── Sale.swift       # Satış + satış kalemi modelleri
    ├── Scanner/
    │   └── BarcodeScannerView.swift  # VisionKit barkod okuyucu
    ├── Views/
    │   ├── MainTabView.swift
    │   ├── SaleView.swift           # Hızlı satış (sepet)
    │   ├── ProductsView.swift       # Ürün listesi
    │   ├── ProductFormView.swift    # Ürün ekleme / barkod tanımlama
    │   ├── ProductDetailView.swift  # Ürün detayı + stok hareketleri
    │   └── ReportsView.swift        # Ciro/kâr raporları
    └── Support/
        └── Formatters.swift  # ₺ para birimi biçimlendirme
```

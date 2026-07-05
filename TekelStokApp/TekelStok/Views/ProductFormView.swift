import SwiftUI
import SwiftData

/// Yeni ürün ekleme / bilinmeyen barkodu tanımlama formu.
struct ProductFormView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss

    var barcode: String = ""
    /// Ürün kaydedildikten sonra çağrılır (ör. satış ekranı sepete eklemek için kullanır).
    var onSaved: ((Product) -> Void)?

    @State private var barcodeText = ""
    @State private var name = ""
    @State private var category = "Genel"
    @State private var purchasePrice: Decimal = 0
    @State private var salePrice: Decimal = 0
    @State private var stockQuantity = 0
    @State private var criticalStockLevel = 5
    @State private var errorMessage: String?

    private static let categories = [
        "Genel", "Sigara", "İçecek", "Alkollü İçecek", "Atıştırmalık",
        "Şekerleme", "Dondurma", "Kağıt/Çakmak", "Diğer"
    ]

    var body: some View {
        Form {
            Section("Barkod") {
                TextField("Barkod numarası", text: $barcodeText)
                    .keyboardType(.numberPad)
            }
            Section("Ürün Bilgileri") {
                TextField("Ürün adı", text: $name)
                Picker("Kategori", selection: $category) {
                    ForEach(Self.categories, id: \.self) { Text($0) }
                }
            }
            Section("Fiyat") {
                DecimalField(title: "Alış fiyatı (₺)", value: $purchasePrice)
                DecimalField(title: "Satış fiyatı (₺)", value: $salePrice)
            }
            Section("Stok") {
                Stepper("Mevcut stok: \(stockQuantity)", value: $stockQuantity, in: 0...100_000)
                Stepper("Kritik stok uyarısı: \(criticalStockLevel)", value: $criticalStockLevel, in: 0...1000)
            }
            if let errorMessage {
                Text(errorMessage).foregroundStyle(.red)
            }
        }
        .navigationTitle(barcode.isEmpty ? "Yeni Ürün" : "Barkodu Tanımla")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Vazgeç") { dismiss() }
            }
            ToolbarItem(placement: .confirmationAction) {
                Button("Kaydet") { save() }
                    .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty
                        || barcodeText.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
        .onAppear {
            if barcodeText.isEmpty { barcodeText = barcode }
        }
    }

    private func save() {
        let code = barcodeText.trimmingCharacters(in: .whitespaces)
        let descriptor = FetchDescriptor<Product>(predicate: #Predicate { $0.barcode == code })
        if let existingCount = try? context.fetchCount(descriptor), existingCount > 0 {
            errorMessage = "Bu barkod zaten kayıtlı: \(code)"
            return
        }

        let product = Product(
            barcode: code,
            name: name.trimmingCharacters(in: .whitespaces),
            category: category,
            purchasePrice: purchasePrice,
            salePrice: salePrice,
            stockQuantity: 0,
            criticalStockLevel: criticalStockLevel
        )
        context.insert(product)
        if stockQuantity > 0 {
            product.adjustStock(by: stockQuantity, type: .purchase, note: "İlk stok girişi")
        }
        do {
            try context.save()
            onSaved?(product)
            dismiss()
        } catch {
            errorMessage = "Kaydedilemedi: \(error.localizedDescription)"
        }
    }
}

/// Ondalıklı fiyat girişi için basit alan.
struct DecimalField: View {
    let title: String
    @Binding var value: Decimal

    var body: some View {
        TextField(title, value: $value, format: .number.locale(Locale(identifier: "tr_TR")))
            .keyboardType(.decimalPad)
    }
}

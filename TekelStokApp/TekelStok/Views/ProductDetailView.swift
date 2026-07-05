import SwiftUI
import SwiftData

/// Ürün detayı: bilgileri düzenleme, stok giriş/çıkışı ve hareket geçmişi.
struct ProductDetailView: View {
    @Environment(\.modelContext) private var context
    @Bindable var product: Product

    @State private var stockChange = 1
    @State private var movementType: StockMovementType = .purchase

    private var sortedMovements: [StockMovement] {
        product.movements.sorted { $0.date > $1.date }
    }

    var body: some View {
        Form {
            Section("Ürün Bilgileri") {
                TextField("Ürün adı", text: $product.name)
                LabeledContent("Barkod", value: product.barcode)
                LabeledContent("Kategori", value: product.category)
            }

            Section("Fiyat") {
                DecimalField(title: "Alış fiyatı (₺)", value: $product.purchasePrice)
                DecimalField(title: "Satış fiyatı (₺)", value: $product.salePrice)
                LabeledContent("Birim kâr", value: product.profitPerUnit.liraFormatted)
            }

            Section("Stok") {
                LabeledContent("Mevcut stok") {
                    Text("\(product.stockQuantity)")
                        .bold()
                        .foregroundStyle(product.isOutOfStock ? .red : product.isLowStock ? .orange : .primary)
                }
                Stepper("Kritik stok uyarısı: \(product.criticalStockLevel)",
                        value: $product.criticalStockLevel, in: 0...1000)

                Picker("İşlem türü", selection: $movementType) {
                    Text("Stok Girişi (Alış)").tag(StockMovementType.purchase)
                    Text("Düzeltme (Çıkış)").tag(StockMovementType.correction)
                    Text("Fire/Zayi").tag(StockMovementType.waste)
                }
                Stepper("Miktar: \(stockChange)", value: $stockChange, in: 1...10_000)
                Button(movementType == .purchase ? "Stok Ekle" : "Stoktan Düş") {
                    applyStockChange()
                }
            }

            Section("Son Hareketler") {
                if sortedMovements.isEmpty {
                    Text("Henüz hareket yok").foregroundStyle(.secondary)
                }
                ForEach(sortedMovements.prefix(20), id: \.persistentModelID) { movement in
                    HStack {
                        VStack(alignment: .leading) {
                            Text(movement.type.rawValue)
                            Text(movement.date.dayMonthTimeFormatted)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        Text(movement.delta > 0 ? "+\(movement.delta)" : "\(movement.delta)")
                            .bold()
                            .foregroundStyle(movement.delta > 0 ? .green : .red)
                    }
                }
            }
        }
        .navigationTitle(product.name)
        .navigationBarTitleDisplayMode(.inline)
        .onDisappear { try? context.save() }
    }

    private func applyStockChange() {
        let delta = movementType == .purchase ? stockChange : -stockChange
        product.adjustStock(by: delta, type: movementType)
        try? context.save()
        stockChange = 1
    }
}

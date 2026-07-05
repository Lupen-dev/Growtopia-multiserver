import SwiftUI
import SwiftData

/// Sepetteki bir satır: ürün + adet.
struct CartLine: Identifiable {
    let id = UUID()
    let product: Product
    var quantity: Int

    var lineTotal: Decimal { product.salePrice * Decimal(quantity) }
}

/// Hızlı satış ekranı: üstte kamera, altta sepet.
/// Barkod okutuldukça ürün sepete eklenir; "Satışı Tamamla" stok düşer ve kaydı oluşturur.
struct SaleView: View {
    @Environment(\.modelContext) private var context

    @State private var cart: [CartLine] = []
    @State private var unknownBarcode: ScannedBarcode?
    @State private var paymentMethod: PaymentMethod = .cash
    @State private var showCompletionToast = false
    @State private var lastSaleTotal: Decimal = 0
    @State private var stockWarning: String?

    private var cartTotal: Decimal { cart.reduce(0) { $0 + $1.lineTotal } }
    private var cartItemCount: Int { cart.reduce(0) { $0 + $1.quantity } }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                ScannerContainerView(onScan: handleScan)
                    .frame(maxHeight: 280)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .padding([.horizontal, .top])

                if let warning = stockWarning {
                    Label(warning, systemImage: "exclamationmark.triangle.fill")
                        .font(.footnote)
                        .foregroundStyle(.orange)
                        .padding(.top, 6)
                }

                cartList

                checkoutBar
            }
            .navigationTitle("Satış")
            .toolbar {
                if !cart.isEmpty {
                    Button("Sepeti Boşalt", role: .destructive) {
                        cart.removeAll()
                    }
                }
            }
            .sheet(item: $unknownBarcode) { scanned in
                NavigationStack {
                    ProductFormView(barcode: scanned.code) { newProduct in
                        addToCart(newProduct)
                    }
                }
            }
            .overlay(alignment: .top) {
                if showCompletionToast {
                    Label("Satış tamamlandı: \(lastSaleTotal.liraFormatted)", systemImage: "checkmark.circle.fill")
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                        .background(.green, in: Capsule())
                        .foregroundStyle(.white)
                        .transition(.move(edge: .top).combined(with: .opacity))
                }
            }
        }
    }

    private var cartList: some View {
        List {
            if cart.isEmpty {
                ContentUnavailableView(
                    "Sepet boş",
                    systemImage: "cart",
                    description: Text("Satış için ürünün barkodunu kameraya gösterin.")
                )
            }
            ForEach($cart) { $line in
                HStack {
                    VStack(alignment: .leading) {
                        Text(line.product.name).font(.headline)
                        Text("\(line.product.salePrice.liraFormatted) x \(line.quantity)")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    Text(line.lineTotal.liraFormatted).bold()
                    Stepper("", value: $line.quantity, in: 1...999)
                        .labelsHidden()
                }
            }
            .onDelete { cart.remove(atOffsets: $0) }
        }
        .listStyle(.plain)
    }

    private var checkoutBar: some View {
        VStack(spacing: 10) {
            Picker("Ödeme", selection: $paymentMethod) {
                ForEach(PaymentMethod.allCases) { method in
                    Label(method.rawValue, systemImage: method.icon).tag(method)
                }
            }
            .pickerStyle(.segmented)

            Button {
                completeSale()
            } label: {
                HStack {
                    Text("Satışı Tamamla (\(cartItemCount) ürün)")
                    Spacer()
                    Text(cartTotal.liraFormatted).bold()
                }
                .padding(.vertical, 6)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(cart.isEmpty)
        }
        .padding()
        .background(.bar)
    }

    private func handleScan(_ barcode: String) {
        stockWarning = nil
        let descriptor = FetchDescriptor<Product>(predicate: #Predicate { $0.barcode == barcode })
        if let product = try? context.fetch(descriptor).first {
            addToCart(product)
        } else {
            unknownBarcode = ScannedBarcode(code: barcode)
        }
    }

    private func addToCart(_ product: Product) {
        let inCart = cart.first(where: { $0.product.barcode == product.barcode })?.quantity ?? 0
        if inCart + 1 > product.stockQuantity {
            stockWarning = "\(product.name) için stok yetersiz (kalan: \(product.stockQuantity))"
        }
        if let index = cart.firstIndex(where: { $0.product.barcode == product.barcode }) {
            cart[index].quantity += 1
        } else {
            cart.append(CartLine(product: product, quantity: 1))
        }
    }

    private func completeSale() {
        guard !cart.isEmpty else { return }
        let sale = Sale(paymentMethod: paymentMethod)
        for line in cart {
            let item = SaleItem(
                productName: line.product.name,
                barcode: line.product.barcode,
                quantity: line.quantity,
                unitPrice: line.product.salePrice,
                unitCost: line.product.purchasePrice
            )
            item.sale = sale
            sale.items.append(item)
            sale.totalAmount += item.lineTotal
            sale.totalProfit += item.lineProfit
            line.product.adjustStock(by: -line.quantity, type: .sale, note: "Satış")
        }
        context.insert(sale)
        try? context.save()

        lastSaleTotal = sale.totalAmount
        cart.removeAll()
        stockWarning = nil
        withAnimation { showCompletionToast = true }
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
            withAnimation { showCompletionToast = false }
        }
    }
}

/// `.sheet(item:)` için Identifiable barkod sarmalayıcısı.
struct ScannedBarcode: Identifiable {
    let code: String
    var id: String { code }
}

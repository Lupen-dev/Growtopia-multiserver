import SwiftUI
import SwiftData

/// Ürün listesi: arama, kritik stok filtresi, barkodla ürün ekleme.
struct ProductsView: View {
    @Environment(\.modelContext) private var context
    @Query(sort: \Product.name) private var products: [Product]

    @State private var searchText = ""
    @State private var showLowStockOnly = false
    @State private var showAddForm = false
    @State private var showScanner = false
    @State private var scannedBarcodeForNewProduct: ScannedBarcode?

    private var filteredProducts: [Product] {
        products.filter { product in
            let matchesSearch = searchText.isEmpty
                || product.name.localizedCaseInsensitiveContains(searchText)
                || product.barcode.contains(searchText)
            let matchesFilter = !showLowStockOnly || product.isLowStock
            return matchesSearch && matchesFilter
        }
    }

    var body: some View {
        NavigationStack {
            List {
                ForEach(filteredProducts) { product in
                    NavigationLink(value: product) {
                        ProductRow(product: product)
                    }
                }
                .onDelete(perform: deleteProducts)
            }
            .overlay {
                if filteredProducts.isEmpty {
                    ContentUnavailableView(
                        products.isEmpty ? "Henüz ürün yok" : "Sonuç bulunamadı",
                        systemImage: "shippingbox",
                        description: Text(products.isEmpty
                            ? "Sağ üstteki + ile veya barkod okutarak ürün ekleyin."
                            : "Arama veya filtre kriterlerini değiştirin.")
                    )
                }
            }
            .navigationTitle("Ürünler")
            .searchable(text: $searchText, prompt: "Ürün adı veya barkod ara")
            .navigationDestination(for: Product.self) { product in
                ProductDetailView(product: product)
            }
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Toggle(isOn: $showLowStockOnly) {
                        Label("Kritik Stok", systemImage: "exclamationmark.triangle")
                    }
                    .toggleStyle(.button)
                }
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Button {
                        showScanner = true
                    } label: {
                        Label("Barkodla Ekle", systemImage: "barcode.viewfinder")
                    }
                    Button {
                        showAddForm = true
                    } label: {
                        Label("Ürün Ekle", systemImage: "plus")
                    }
                }
            }
            .sheet(isPresented: $showAddForm) {
                NavigationStack { ProductFormView() }
            }
            .sheet(isPresented: $showScanner) {
                NavigationStack {
                    ScannerContainerView { code in
                        showScanner = false
                        scannedBarcodeForNewProduct = ScannedBarcode(code: code)
                    }
                    .navigationTitle("Barkod Okut")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        Button("Kapat") { showScanner = false }
                    }
                }
            }
            .sheet(item: $scannedBarcodeForNewProduct) { scanned in
                NavigationStack { ProductFormView(barcode: scanned.code) }
            }
        }
    }

    private func deleteProducts(at offsets: IndexSet) {
        for index in offsets {
            context.delete(filteredProducts[index])
        }
    }
}

struct ProductRow: View {
    let product: Product

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(product.name).font(.headline)
                Text(product.barcode)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                Text(product.salePrice.liraFormatted).bold()
                Text("Stok: \(product.stockQuantity)")
                    .font(.caption)
                    .foregroundStyle(product.isOutOfStock ? .red : product.isLowStock ? .orange : .secondary)
            }
        }
    }
}

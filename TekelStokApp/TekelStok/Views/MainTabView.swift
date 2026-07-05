import SwiftUI
import SwiftData

struct MainTabView: View {
    @Query(filter: #Predicate<Product> { $0.stockQuantity <= $0.criticalStockLevel })
    private var lowStockProducts: [Product]

    var body: some View {
        TabView {
            SaleView()
                .tabItem { Label("Satış", systemImage: "cart.badge.plus") }

            ProductsView()
                .tabItem { Label("Ürünler", systemImage: "shippingbox") }
                .badge(lowStockProducts.count)

            ReportsView()
                .tabItem { Label("Raporlar", systemImage: "chart.bar.xaxis") }
        }
    }
}

#Preview {
    MainTabView()
        .modelContainer(for: [Product.self, StockMovement.self, Sale.self, SaleItem.self], inMemory: true)
}

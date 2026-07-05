import SwiftUI
import SwiftData

@main
struct TekelStokApp: App {
    var body: some Scene {
        WindowGroup {
            MainTabView()
        }
        .modelContainer(for: [Product.self, StockMovement.self, Sale.self, SaleItem.self])
    }
}

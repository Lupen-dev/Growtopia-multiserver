import Foundation
import SwiftData

@Model
final class Product {
    @Attribute(.unique) var barcode: String
    var name: String
    var category: String
    var purchasePrice: Decimal
    var salePrice: Decimal
    var stockQuantity: Int
    var criticalStockLevel: Int
    var createdAt: Date
    var updatedAt: Date

    @Relationship(deleteRule: .cascade, inverse: \StockMovement.product)
    var movements: [StockMovement] = []

    init(
        barcode: String,
        name: String,
        category: String = "Genel",
        purchasePrice: Decimal = 0,
        salePrice: Decimal = 0,
        stockQuantity: Int = 0,
        criticalStockLevel: Int = 5
    ) {
        self.barcode = barcode
        self.name = name
        self.category = category
        self.purchasePrice = purchasePrice
        self.salePrice = salePrice
        self.stockQuantity = stockQuantity
        self.criticalStockLevel = criticalStockLevel
        self.createdAt = .now
        self.updatedAt = .now
    }

    var isLowStock: Bool { stockQuantity <= criticalStockLevel }
    var isOutOfStock: Bool { stockQuantity <= 0 }
    var profitPerUnit: Decimal { salePrice - purchasePrice }

    /// Stok değişimini uygular ve hareket kaydı oluşturur.
    func adjustStock(by delta: Int, type: StockMovementType, note: String = "") {
        stockQuantity += delta
        updatedAt = .now
        let movement = StockMovement(delta: delta, type: type, note: note)
        movement.product = self
        movements.append(movement)
    }
}

enum StockMovementType: String, Codable, CaseIterable {
    case purchase = "Alış"
    case sale = "Satış"
    case correction = "Düzeltme"
    case waste = "Fire/Zayi"
    case returned = "İade"
}

@Model
final class StockMovement {
    var delta: Int
    var typeRaw: String
    var note: String
    var date: Date
    var product: Product?

    init(delta: Int, type: StockMovementType, note: String = "", date: Date = .now) {
        self.delta = delta
        self.typeRaw = type.rawValue
        self.note = note
        self.date = date
    }

    var type: StockMovementType {
        StockMovementType(rawValue: typeRaw) ?? .correction
    }
}

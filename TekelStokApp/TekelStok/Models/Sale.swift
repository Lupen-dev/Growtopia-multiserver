import Foundation
import SwiftData

@Model
final class Sale {
    var date: Date
    var totalAmount: Decimal
    var totalProfit: Decimal
    var paymentMethod: String

    @Relationship(deleteRule: .cascade, inverse: \SaleItem.sale)
    var items: [SaleItem] = []

    init(date: Date = .now, paymentMethod: PaymentMethod = .cash) {
        self.date = date
        self.totalAmount = 0
        self.totalProfit = 0
        self.paymentMethod = paymentMethod.rawValue
    }

    var itemCount: Int { items.reduce(0) { $0 + $1.quantity } }
}

enum PaymentMethod: String, Codable, CaseIterable, Identifiable {
    case cash = "Nakit"
    case card = "Kart"

    var id: String { rawValue }
    var icon: String {
        switch self {
        case .cash: "banknote"
        case .card: "creditcard"
        }
    }
}

@Model
final class SaleItem {
    var productName: String
    var barcode: String
    var quantity: Int
    var unitPrice: Decimal
    var unitCost: Decimal
    var sale: Sale?

    init(productName: String, barcode: String, quantity: Int, unitPrice: Decimal, unitCost: Decimal) {
        self.productName = productName
        self.barcode = barcode
        self.quantity = quantity
        self.unitPrice = unitPrice
        self.unitCost = unitCost
    }

    var lineTotal: Decimal { unitPrice * Decimal(quantity) }
    var lineProfit: Decimal { (unitPrice - unitCost) * Decimal(quantity) }
}

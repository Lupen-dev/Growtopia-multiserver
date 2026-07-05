import Foundation

extension Decimal {
    /// Türk Lirası biçiminde gösterim, ör. "₺124,50".
    var liraFormatted: String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.locale = Locale(identifier: "tr_TR")
        formatter.currencyCode = "TRY"
        return formatter.string(from: self as NSDecimalNumber) ?? "₺\(self)"
    }
}

extension Date {
    var dayMonthTimeFormatted: String {
        formatted(.dateTime.day().month(.abbreviated).hour().minute().locale(Locale(identifier: "tr_TR")))
    }
}

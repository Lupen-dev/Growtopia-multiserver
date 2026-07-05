import SwiftUI
import SwiftData
import Charts

/// Raporlar: günlük/haftalık/aylık ciro ve kâr, çok satan ürünler, satış geçmişi.
struct ReportsView: View {
    @Query(sort: \Sale.date, order: .reverse) private var sales: [Sale]
    @Query(filter: #Predicate<Product> { $0.stockQuantity <= $0.criticalStockLevel },
           sort: \Product.stockQuantity)
    private var lowStockProducts: [Product]

    @State private var period: ReportPeriod = .today

    enum ReportPeriod: String, CaseIterable, Identifiable {
        case today = "Bugün"
        case week = "Bu Hafta"
        case month = "Bu Ay"

        var id: String { rawValue }

        var startDate: Date {
            let calendar = Calendar.current
            switch self {
            case .today: return calendar.startOfDay(for: .now)
            case .week: return calendar.dateInterval(of: .weekOfYear, for: .now)?.start ?? .now
            case .month: return calendar.dateInterval(of: .month, for: .now)?.start ?? .now
            }
        }
    }

    private var periodSales: [Sale] {
        sales.filter { $0.date >= period.startDate }
    }

    private var totalRevenue: Decimal { periodSales.reduce(0) { $0 + $1.totalAmount } }
    private var totalProfit: Decimal { periodSales.reduce(0) { $0 + $1.totalProfit } }

    /// Dönem içinde ürün bazında satış adetleri (çok satandan aza).
    private var topProducts: [(name: String, quantity: Int)] {
        var counts: [String: Int] = [:]
        for sale in periodSales {
            for item in sale.items {
                counts[item.productName, default: 0] += item.quantity
            }
        }
        return counts.sorted { $0.value > $1.value }.prefix(5).map { ($0.key, $0.value) }
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Picker("Dönem", selection: $period) {
                        ForEach(ReportPeriod.allCases) { Text($0.rawValue).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets())
                }

                Section("Özet") {
                    LabeledContent("Satış sayısı", value: "\(periodSales.count)")
                    LabeledContent("Ciro", value: totalRevenue.liraFormatted)
                    LabeledContent("Kâr") {
                        Text(totalProfit.liraFormatted)
                            .foregroundStyle(totalProfit >= 0 ? .green : .red)
                            .bold()
                    }
                }

                if !topProducts.isEmpty {
                    Section("Çok Satanlar") {
                        Chart(topProducts, id: \.name) { entry in
                            BarMark(
                                x: .value("Adet", entry.quantity),
                                y: .value("Ürün", entry.name)
                            )
                            .annotation(position: .trailing) {
                                Text("\(entry.quantity)").font(.caption)
                            }
                        }
                        .frame(height: CGFloat(topProducts.count) * 44)
                    }
                }

                if !lowStockProducts.isEmpty {
                    Section("Kritik Stok (\(lowStockProducts.count))") {
                        ForEach(lowStockProducts.prefix(10)) { product in
                            HStack {
                                Text(product.name)
                                Spacer()
                                Text("Stok: \(product.stockQuantity)")
                                    .foregroundStyle(product.isOutOfStock ? .red : .orange)
                                    .bold()
                            }
                        }
                    }
                }

                Section("Satış Geçmişi") {
                    if periodSales.isEmpty {
                        Text("Bu dönemde satış yok").foregroundStyle(.secondary)
                    }
                    ForEach(periodSales.prefix(50)) { sale in
                        NavigationLink {
                            SaleDetailView(sale: sale)
                        } label: {
                            HStack {
                                VStack(alignment: .leading) {
                                    Text(sale.date.dayMonthTimeFormatted)
                                    Text("\(sale.itemCount) ürün • \(sale.paymentMethod)")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                Spacer()
                                Text(sale.totalAmount.liraFormatted).bold()
                            }
                        }
                    }
                }
            }
            .navigationTitle("Raporlar")
        }
    }
}

/// Tek bir satışın fiş görünümü.
struct SaleDetailView: View {
    let sale: Sale

    var body: some View {
        List {
            Section("Satış") {
                LabeledContent("Tarih", value: sale.date.dayMonthTimeFormatted)
                LabeledContent("Ödeme", value: sale.paymentMethod)
                LabeledContent("Toplam", value: sale.totalAmount.liraFormatted)
                LabeledContent("Kâr", value: sale.totalProfit.liraFormatted)
            }
            Section("Ürünler") {
                ForEach(sale.items, id: \.persistentModelID) { item in
                    HStack {
                        VStack(alignment: .leading) {
                            Text(item.productName)
                            Text("\(item.unitPrice.liraFormatted) x \(item.quantity)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        Text(item.lineTotal.liraFormatted)
                    }
                }
            }
        }
        .navigationTitle("Satış Detayı")
        .navigationBarTitleDisplayMode(.inline)
    }
}

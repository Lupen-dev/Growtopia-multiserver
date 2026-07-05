import SwiftUI
import VisionKit

/// VisionKit DataScannerViewController'ı SwiftUI'a bağlayan barkod okuyucu.
/// EAN-13, EAN-8, UPC-E, Code 128 ve QR formatlarını okur.
struct BarcodeScannerView: UIViewControllerRepresentable {
    /// Bir barkod okunduğunda çağrılır. Aynı barkod arka arkaya
    /// okunursa `debounceInterval` süresi boyunca tekrar tetiklenmez.
    var onScan: (String) -> Void
    var debounceInterval: TimeInterval = 1.5

    static var isSupported: Bool {
        DataScannerViewController.isSupported && DataScannerViewController.isAvailable
    }

    func makeUIViewController(context: Context) -> DataScannerViewController {
        let scanner = DataScannerViewController(
            recognizedDataTypes: [
                .barcode(symbologies: [.ean13, .ean8, .upce, .code128, .code39, .qr])
            ],
            qualityLevel: .balanced,
            recognizesMultipleItems: false,
            isHighFrameRateTrackingEnabled: false,
            isGuidanceEnabled: true,
            isHighlightingEnabled: true
        )
        scanner.delegate = context.coordinator
        return scanner
    }

    func updateUIViewController(_ controller: DataScannerViewController, context: Context) {
        if !controller.isScanning {
            try? controller.startScanning()
        }
    }

    static func dismantleUIViewController(_ controller: DataScannerViewController, coordinator: Coordinator) {
        controller.stopScanning()
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(onScan: onScan, debounceInterval: debounceInterval)
    }

    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        let onScan: (String) -> Void
        let debounceInterval: TimeInterval
        private var lastCode: String?
        private var lastScanDate: Date = .distantPast

        init(onScan: @escaping (String) -> Void, debounceInterval: TimeInterval) {
            self.onScan = onScan
            self.debounceInterval = debounceInterval
        }

        func dataScanner(_ scanner: DataScannerViewController, didAdd added: [RecognizedItem], allItems: [RecognizedItem]) {
            for item in added {
                guard case let .barcode(barcode) = item,
                      let code = barcode.payloadStringValue, !code.isEmpty else { continue }
                let now = Date()
                if code == lastCode, now.timeIntervalSince(lastScanDate) < debounceInterval { continue }
                lastCode = code
                lastScanDate = now
                UINotificationFeedbackGenerator().notificationOccurred(.success)
                onScan(code)
            }
        }
    }
}

/// Kamera desteklenmiyorsa (simülatör vb.) elle barkod girişi sunan sarmalayıcı.
struct ScannerContainerView: View {
    var onScan: (String) -> Void
    @State private var manualCode = ""

    var body: some View {
        if BarcodeScannerView.isSupported {
            BarcodeScannerView(onScan: onScan)
        } else {
            VStack(spacing: 16) {
                Image(systemName: "camera.on.rectangle")
                    .font(.largeTitle)
                    .foregroundStyle(.secondary)
                Text("Bu cihazda kamera ile tarama desteklenmiyor.\nBarkodu elle girebilirsiniz.")
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)
                HStack {
                    TextField("Barkod numarası", text: $manualCode)
                        .textFieldStyle(.roundedBorder)
                        .keyboardType(.numberPad)
                    Button("Ekle") {
                        let code = manualCode.trimmingCharacters(in: .whitespaces)
                        guard !code.isEmpty else { return }
                        onScan(code)
                        manualCode = ""
                    }
                    .buttonStyle(.borderedProminent)
                }
                .padding(.horizontal)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color(.systemGroupedBackground))
        }
    }
}

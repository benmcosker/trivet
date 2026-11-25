import UIKit
import VisionKit
import WebKit

/// Opens the iPhone's document scanner for the upload page, and leaves what it
/// scanned where a share would be left.
///
/// The upload page's "Scan a card" button (src/components/UploadWorkflow.tsx,
/// src/lib/scan-bridge.ts) posts `{type: "open"}` over
/// `window.webkit.messageHandlers.trivetScan`. VisionKit finds the edges of a
/// card or a cookbook page and straightens it, and can scan several pages.
///
/// The pages are then read on the phone (`ScanReader`). A printed card with
/// enough clean words is left as text, a handwritten one as the scanned pages,
/// through `PendingShare.store` exactly as the share sheet leaves screenshots'
/// words or photos, marked with how many pages were scanned. `onScanned`
/// brings the upload page forward (`/upload?shared=1`), which reads it over
/// `ShareBridge` the way it reads a share and labels it "Scanned".
///
/// Like the other bridges it answers Trivet's own pages in the main frame only.
@MainActor
final class ScanBridge: NSObject, WKScriptMessageHandler, VNDocumentCameraViewControllerDelegate {
    /// Must match `SCAN_BRIDGE` in src/lib/scan-bridge.ts.
    static let name = "trivetScan"

    /// The most pages one import takes. Must match `MAX_SHARED_FILES` in
    /// src/lib/shared-item.ts; pages past it are left out.
    private static let maxPages = 6
    /// The longest side of a saved page, in pixels, as for shared photos.
    private static let maxSide: CGFloat = 2000

    private let allowedHosts: Set<String>
    private let onScanned: () -> Void

    init(allowedHosts: Set<String>, onScanned: @escaping () -> Void) {
        self.allowedHosts = allowedHosts
        self.onScanned = onScanned
    }

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        let origin = message.frameInfo.securityOrigin
        guard message.frameInfo.isMainFrame,
              origin.protocol == "https",
              allowedHosts.contains(origin.host.lowercased()),
              let body = message.body as? [String: Any],
              body["type"] as? String == "open",
              VNDocumentCameraViewController.isSupported,
              let presenter = Self.topViewController()
        else { return }

        let scanner = VNDocumentCameraViewController()
        scanner.delegate = self
        presenter.present(scanner, animated: true)
    }

    func documentCameraViewController(
        _ controller: VNDocumentCameraViewController,
        didFinishWith scan: VNDocumentCameraScan
    ) {
        controller.dismiss(animated: true)

        var pages: [Data] = []
        for index in 0..<min(scan.pageCount, Self.maxPages) {
            guard let data = Self.jpeg(scan.imageOfPage(at: index)) else { continue }
            pages.append(data)
        }
        guard !pages.isEmpty else { return }

        // Read off the main actor; the scanner has already gone.
        Task {
            let reading = await ScanReader.read(pages)
            let stored: Bool
            if reading.isEnough {
                stored = PendingShare.store(text: reading.text, scannedPages: pages.count)
            } else {
                let files = pages.enumerated().map { index, data in
                    PendingShare.NewFile(data: data, name: "scan-\(index + 1).jpg", type: "image/jpeg")
                }
                stored = PendingShare.store(files: files, scannedPages: pages.count)
            }
            if stored { onScanned() }
        }
    }

    func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) {
        controller.dismiss(animated: true)
    }

    func documentCameraViewController(
        _ controller: VNDocumentCameraViewController,
        didFailWithError error: Error
    ) {
        controller.dismiss(animated: true)
    }

    /// A page as a JPEG no larger than `maxSide` on its longest side.
    private static func jpeg(_ image: UIImage) -> Data? {
        let longest = max(image.size.width, image.size.height)
        guard longest > 0 else { return nil }
        let scale = min(1, maxSide / longest)
        let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        let resized = UIGraphicsImageRenderer(size: size, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: size))
        }
        return resized.jpegData(compressionQuality: 0.8)
    }

    /// The view controller to present the scanner from.
    private static func topViewController() -> UIViewController? {
        let scene = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first { $0.activationState == .foregroundActive }
        var top = scene?.windows.first(where: \.isKeyWindow)?.rootViewController
        while let presented = top?.presentedViewController { top = presented }
        return top
    }
}

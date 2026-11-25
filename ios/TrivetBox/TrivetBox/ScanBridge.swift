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
/// The page's `open` is answered once the scan is done with: `{scanned: true}`
/// once it has been left for the page (which the app then brings forward),
/// null if the person cancelled, or an error - a sentence the page shows as it
/// is - when the scanner failed, the scan had more pages than one import
/// takes, or it could not be saved. Before this, all three failed silently.
///
/// Like the other bridges it answers Trivet's own pages in the main frame only.
@MainActor
final class ScanBridge: NSObject, WKScriptMessageHandlerWithReply, VNDocumentCameraViewControllerDelegate {
    /// Must match `SCAN_BRIDGE` in src/lib/scan-bridge.ts.
    static let name = "trivetScan"

    /// The most pages one import takes. Must match `MAX_SHARED_FILES` in
    /// src/lib/shared-item.ts. A longer scan is refused with a reason rather
    /// than silently cut short.
    private static let maxPages = 6
    /// The longest side of a saved page, in pixels, as for shared photos.
    private static let maxSide: CGFloat = 2000

    private let allowedHosts: Set<String>
    private let onScanned: () -> Void
    /// Answers the page's `open` when the scan is done with.
    private var pendingReply: ((Any?, String?) -> Void)?

    init(allowedHosts: Set<String>, onScanned: @escaping () -> Void) {
        self.allowedHosts = allowedHosts
        self.onScanned = onScanned
    }

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage,
        replyHandler: @escaping @MainActor @Sendable (Any?, String?) -> Void
    ) {
        let origin = message.frameInfo.securityOrigin
        guard message.frameInfo.isMainFrame,
              origin.protocol == "https",
              allowedHosts.contains(origin.host.lowercased()),
              let body = message.body as? [String: Any],
              body["type"] as? String == "open"
        else {
            replyHandler(nil, "Not available on this page")
            return
        }
        guard VNDocumentCameraViewController.isSupported else {
            replyHandler(nil, "This iPhone can't scan documents. Choose a photo of the card instead.")
            return
        }
        guard pendingReply == nil, let presenter = Self.topViewController() else {
            replyHandler(nil, "The scanner is already open.")
            return
        }

        pendingReply = replyHandler
        let scanner = VNDocumentCameraViewController()
        scanner.delegate = self
        presenter.present(scanner, animated: true)
    }

    /// Answer the page once, however the scan ended.
    private func answer(_ result: Any?, _ error: String? = nil) {
        let reply = pendingReply
        pendingReply = nil
        reply?(result, error)
    }

    func documentCameraViewController(
        _ controller: VNDocumentCameraViewController,
        didFinishWith scan: VNDocumentCameraScan
    ) {
        controller.dismiss(animated: true)

        guard scan.pageCount <= Self.maxPages else {
            answer(nil, "That's \(scan.pageCount) pages, and one recipe can take \(Self.maxPages). Scan fewer, or save it as a PDF and choose that instead.")
            return
        }
        var pages: [Data] = []
        for index in 0..<scan.pageCount {
            guard let data = Self.jpeg(scan.imageOfPage(at: index)) else { continue }
            pages.append(data)
        }
        guard !pages.isEmpty else {
            answer(nil, "The scan came back empty. Try again.")
            return
        }

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
            guard stored else {
                answer(nil, "The scan couldn't be saved. Try again, or choose a photo instead.")
                return
            }
            // The page first, so it can say it is opening the scan, then the
            // upload page comes forward to read it.
            answer(["scanned": true])
            onScanned()
        }
    }

    func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) {
        controller.dismiss(animated: true)
        answer(nil)
    }

    func documentCameraViewController(
        _ controller: VNDocumentCameraViewController,
        didFailWithError error: Error
    ) {
        controller.dismiss(animated: true)
        answer(nil, "The scan didn't work. Try again, or choose a photo of the card instead.")
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

import UIKit
import Vision
import VisionKit
import WebKit

/// Scans a recipe card with the iPhone's own document scanner, reads it on
/// the phone, and hands the result to the upload page.
///
/// The page's "Scan a card" button (src/components/UploadWorkflow.tsx) talks
/// to this over `window.webkit.messageHandlers.trivetScan`, in the same three
/// messages as `ShareBridge`, so the page takes a scan exactly as it takes a
/// share (`takeSharedItem` in src/lib/shared-item.ts):
///
/// - `scan` → opens the scanner. Answered when it closes: a summary of what
///   was scanned, or null if the person cancelled.
/// - `file` with an `index` → that page as a JPEG, base64.
/// - `taken` → the scan is forgotten.
///
/// The scanner finds the card's edges, squares it up and cleans it, and takes
/// several pages for a card with two sides. Its pages are then read with the
/// text recognition behind Live Text, on the phone, and sent the way the share
/// sheet sends screenshots (`ScreenshotReader`, whose rule this follows):
/// enough clean text goes to the text import, which is quicker, cheaper and
/// sends only words; a handwritten card reads as a few uncertain words and
/// goes to the photo import as images, which reads handwriting far better.
///
/// Like the other bridges, it answers Trivet's own pages in the main frame
/// only. It is only installed where the scanner works (`isAvailable`), so the
/// page shows the button only then.
final class ScanBridge: NSObject, WKScriptMessageHandlerWithReply, VNDocumentCameraViewControllerDelegate {
    /// Must match `SCAN_BRIDGE` in src/lib/shared-item.ts.
    static let name = "trivetScan"

    /// The scanner needs a camera: not the simulator, not every iPad.
    static var isAvailable: Bool { VNDocumentCameraViewController.isSupported }

    /// Must match `MAX_SHARED_FILES` in src/lib/shared-item.ts: the photo
    /// import reads at most this many images as one recipe.
    static let maxPages = 6

    private let allowedHosts: Set<String>
    /// Answers the page's `scan` once the scanner closes.
    private var pendingReply: ((Any?, String?) -> Void)?
    private weak var scanner: VNDocumentCameraViewController?
    /// The scanned pages, kept until the page has them all.
    private var pages: [Data] = []

    init(allowedHosts: Set<String>) {
        self.allowedHosts = allowedHosts
    }

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage,
        replyHandler: @escaping @MainActor @Sendable (Any?, String?) -> Void
    ) {
        let origin = message.frameInfo.securityOrigin
        guard message.frameInfo.isMainFrame,
              origin.protocol == "https",
              allowedHosts.contains(origin.host.lowercased())
        else {
            replyHandler(nil, "Not available on this page")
            return
        }
        guard let body = message.body as? [String: Any], let type = body["type"] as? String else {
            replyHandler(nil, "Unreadable message")
            return
        }

        switch type {
        case "scan":
            guard Self.isAvailable else {
                replyHandler(nil, "This device can't scan documents")
                return
            }
            guard pendingReply == nil,
                  let presenter = Self.topController(from: message.webView)
            else {
                replyHandler(nil, "The scanner is already open")
                return
            }
            pages = []
            pendingReply = replyHandler
            let camera = VNDocumentCameraViewController()
            camera.delegate = self
            scanner = camera
            presenter.present(camera, animated: true)
        case "file":
            guard let index = body["index"] as? Int, pages.indices.contains(index) else {
                replyHandler(nil, "That page isn't here")
                return
            }
            replyHandler(pages[index].base64EncodedString(), nil)
        case "taken":
            pages = []
            replyHandler(nil, nil)
        default:
            replyHandler(nil, "Unknown message")
        }
    }

    // MARK: The scanner

    nonisolated func documentCameraViewController(
        _ controller: VNDocumentCameraViewController,
        didFinishWith scan: VNDocumentCameraScan
    ) {
        // The page images out of the scan first, so nothing but finished
        // images crosses to the main actor.
        let images = (0..<scan.pageCount).map { scan.imageOfPage(at: $0) }
        Task { @MainActor in
            self.scanner?.dismiss(animated: true)
            await self.finish(images)
        }
    }

    nonisolated func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) {
        Task { @MainActor in
            self.scanner?.dismiss(animated: true)
            self.answer(nil, nil)
        }
    }

    nonisolated func documentCameraViewController(
        _ controller: VNDocumentCameraViewController,
        didFailWithError error: Error
    ) {
        Task { @MainActor in
            self.scanner?.dismiss(animated: true)
            self.answer(nil, "The scan didn't work. Try again, or choose a photo instead.")
        }
    }

    /// Read the pages, then answer the page with words or with images.
    private func finish(_ images: [UIImage]) async {
        guard !images.isEmpty else {
            answer(nil, nil)
            return
        }
        let jpegs = await Self.prepare(images)
        let reading = await Self.read(jpegs)

        if reading.isEnough {
            answer(["kind": "text", "text": reading.text, "pages": jpegs.count], nil)
            return
        }
        guard jpegs.count <= Self.maxPages else {
            answer(nil, "That's more than \(Self.maxPages) pages to read as one recipe. Scan fewer, or save it as a PDF.")
            return
        }
        pages = jpegs
        answer([
            "kind": "files",
            "pages": jpegs.count,
            "files": jpegs.enumerated().map { index, data in
                ["name": "scan-\(index + 1).jpg", "type": "image/jpeg", "size": data.count]
            },
        ], nil)
    }

    private func answer(_ result: Any?, _ error: String?) {
        let reply = pendingReply
        pendingReply = nil
        reply?(result, error)
    }

    // MARK: Reading, off the main actor

    /// Each page as a JPEG at most 2,000 pixels on its long side: what the
    /// photo import reads, and small enough to send several at once.
    @concurrent private static func prepare(_ images: [UIImage]) async -> [Data] {
        images.compactMap { jpeg($0, maxPixels: 2_000) }
    }

    nonisolated private static func jpeg(_ image: UIImage, maxPixels: CGFloat) -> Data? {
        let width = image.size.width * image.scale
        let height = image.size.height * image.scale
        let factor = min(1, maxPixels / max(width, height, 1))
        let size = CGSize(width: (width * factor).rounded(), height: (height * factor).rounded())
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let resized = UIGraphicsImageRenderer(size: size, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: size))
        }
        return resized.jpegData(compressionQuality: 0.8)
    }

    /// The words on every page, in order, with how sure the recognition was.
    /// The same rule and thresholds as `ScreenshotReader` in the share
    /// extension; change them together.
    @concurrent private static func read(_ pages: [Data]) async -> ScanReading {
        var texts: [String] = []
        var lines = 0
        var total: Float = 0
        for page in pages {
            var request = RecognizeTextRequest()
            request.recognitionLevel = .accurate
            request.usesLanguageCorrection = true
            let observations = (try? await request.perform(on: page)) ?? []
            var pageLines: [String] = []
            for observation in observations {
                guard let candidate = observation.topCandidates(1).first else { continue }
                pageLines.append(candidate.string)
                total += candidate.confidence
            }
            lines += pageLines.count
            if !pageLines.isEmpty { texts.append(pageLines.joined(separator: "\n")) }
        }
        return ScanReading(
            text: String(texts.joined(separator: "\n\n").prefix(ScanReading.maxCharacters)),
            lines: lines,
            confidence: lines > 0 ? total / Float(lines) : 0
        )
    }

    /// Where to show the scanner: the topmost screen over the web view.
    private static func topController(from webView: WKWebView?) -> UIViewController? {
        guard var top = webView?.window?.rootViewController else { return nil }
        while let presented = top.presentedViewController { top = presented }
        return top
    }
}

/// What text recognition made of a scan.
nonisolated struct ScanReading: Sendable {
    let text: String
    let lines: Int
    let confidence: Float

    /// Must match `ScreenshotReader` in the share extension.
    static let minLines = 6
    static let minCharacters = 120
    static let minConfidence: Float = 0.6
    /// Must match `MAX_PASTED_CHARS` in src/lib/pasted-text.ts.
    static let maxCharacters = 20_000

    /// Enough words, read cleanly enough, to send as text.
    var isEnough: Bool {
        lines >= Self.minLines && text.count >= Self.minCharacters && confidence >= Self.minConfidence
    }
}

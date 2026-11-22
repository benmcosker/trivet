import UIKit
import WebKit

/// Opens the iPhone's print sheet when a Trivet page asks to print.
///
/// `window.print()` does nothing inside a web view, so the planner's and the
/// recipe's Print buttons call `printPage` (src/lib/print-page.ts), which posts
/// here over `window.webkit.messageHandlers.trivetPrint` when the app is
/// running it. The page's own print rules (`@media print`) still decide what
/// lands on paper; this only hands the web view's print formatter to iOS.
///
/// Like `ShareBridge`, it answers Trivet's own pages in the main frame only.
@MainActor
final class PrintBridge: NSObject, WKScriptMessageHandler {
    /// Must match `PRINT_BRIDGE` in src/lib/print-page.ts.
    static let name = "trivetPrint"

    private let allowedHosts: Set<String>
    private let webView: () -> WKWebView?

    init(allowedHosts: Set<String>, webView: @escaping () -> WKWebView?) {
        self.allowedHosts = allowedHosts
        self.webView = webView
    }

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        let origin = message.frameInfo.securityOrigin
        guard message.frameInfo.isMainFrame,
              origin.protocol == "https",
              allowedHosts.contains(origin.host.lowercased()),
              let webView = webView()
        else { return }

        let info = UIPrintInfo(dictionary: nil)
        info.outputType = .general
        info.jobName = webView.title ?? "Trivet"

        let controller = UIPrintInteractionController.shared
        controller.printInfo = info
        controller.printFormatter = webView.viewPrintFormatter()
        // `from:in:` is what iPad needs to anchor its popover; on iPhone the
        // sheet slides up and the rectangle is ignored.
        controller.present(from: webView.bounds, in: webView, animated: true, completionHandler: nil)
    }
}

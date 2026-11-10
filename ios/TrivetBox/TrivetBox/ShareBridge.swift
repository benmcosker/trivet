import Foundation
import WebKit

/// Hands the upload page what the share sheet left, when the page asks for it.
///
/// A link fits in the page's address; words read off screenshots, photos and
/// PDFs do not. For those the app opens `/upload?shared=1`, and the page asks
/// here over `window.webkit.messageHandlers.trivetShare` (src/lib/
/// shared-item.ts):
///
/// - `ready` → a summary of what is waiting, or null.
/// - `file` with an `index` → that file, base64.
/// - `taken` → the share is forgotten. The page sends it once everything has
///   arrived, so one that fails part-way leaves the share for next time.
final class ShareBridge: NSObject, WKScriptMessageHandlerWithReply {
    /// Must match `SHARE_BRIDGE` in src/lib/shared-item.ts.
    static let name = "trivetShare"

    private let allowedHosts: Set<String>
    private let onTaken: () -> Void

    init(allowedHosts: Set<String>, onTaken: @escaping () -> Void) {
        self.allowedHosts = allowedHosts
        self.onTaken = onTaken
    }

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage,
        replyHandler: @escaping @MainActor @Sendable (Any?, String?) -> Void
    ) {
        // Only Trivet's own pages, in the main frame, ever see a share.
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

        guard let item = PendingShare.item(), item.needsBridge else {
            // Nothing waiting: a reload, or a share already taken.
            replyHandler(nil, nil)
            return
        }

        switch type {
        case "ready":
            replyHandler(Self.summary(of: item), nil)
        case "file":
            guard case .files(let files) = item,
                  let index = body["index"] as? Int,
                  files.indices.contains(index),
                  let data = try? Data(contentsOf: files[index].url)
            else {
                replyHandler(nil, "That file isn't here")
                return
            }
            replyHandler(data.base64EncodedString(), nil)
        case "taken":
            PendingShare.clear()
            onTaken()
            replyHandler(nil, nil)
        default:
            replyHandler(nil, "Unknown message")
        }
    }

    /// What `readSharedSummary` in src/lib/shared-item.ts reads.
    private static func summary(of item: PendingShare.Item) -> [String: Any]? {
        switch item {
        case .link:
            return nil
        case .text(let text, let screenshots):
            var summary: [String: Any] = ["kind": "text", "text": text]
            if let screenshots { summary["screenshots"] = screenshots }
            return summary
        case .files(let files):
            return [
                "kind": "files",
                "files": files.map { ["name": $0.name, "type": $0.type, "size": $0.size] },
            ]
        }
    }
}

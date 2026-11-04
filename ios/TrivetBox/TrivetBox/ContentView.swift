import SwiftUI
import WebKit

/// Trivet's paper colour, light and dark, so the edges match the site.
private let paper = Color(UIColor { traits in
    traits.userInterfaceStyle == .dark
        ? UIColor(red: 0x14 / 255, green: 0x11 / 255, blue: 0x0d / 255, alpha: 1)
        : UIColor(red: 0xf7 / 255, green: 0xf4 / 255, blue: 0xed / 255, alpha: 1)
})

/// The whole app: trivetbox.com, full screen. The site does everything; this
/// gives it a home-screen icon and keeps the family signed in.
struct ContentView: View {
    var body: some View {
        TrivetWebView(url: URL(string: "https://trivetbox.com")!)
            .background(paper.ignoresSafeArea())
    }
}

struct TrivetWebView: UIViewRepresentable {
    let url: URL

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default() // stay signed in between launches
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true // swipe back
        webView.load(URLRequest(url: url))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        /// Trivet's own pages stay in the app; a tapped link to any other
        /// site (a recipe's source, Instagram) opens in Safari.
        func webView(
            _ webView: WKWebView,
            decidePolicyFor action: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            guard let url = action.request.url, let host = url.host else {
                decisionHandler(.allow)
                return
            }
            let isTrivet = host == "trivetbox.com" || host.hasSuffix(".trivetbox.com")
            if !isTrivet && action.navigationType == .linkActivated {
                UIApplication.shared.open(url)
                decisionHandler(.cancel)
            } else {
                decisionHandler(.allow)
            }
        }

        /// Links that open a new tab (a recipe's original card) go to Safari
        /// rather than nowhere.
        func webView(
            _ webView: WKWebView,
            createWebViewWith configuration: WKWebViewConfiguration,
            for navigationAction: WKNavigationAction,
            windowFeatures: WKWindowFeatures
        ) -> WKWebView? {
            if let url = navigationAction.request.url {
                UIApplication.shared.open(url)
            }
            return nil
        }
    }
}

import Observation
import SwiftUI
import UIKit
import WebKit

/// One colour in light and dark, read from the system appearance.
nonisolated private func dynamic(light: UInt32, dark: UInt32) -> Color {
    Color(UIColor { traits in
        let hex = traits.userInterfaceStyle == .dark ? dark : light
        return UIColor(
            red: CGFloat((hex >> 16) & 0xff) / 255,
            green: CGFloat((hex >> 8) & 0xff) / 255,
            blue: CGFloat(hex & 0xff) / 255,
            alpha: 1
        )
    })
}

/// Trivet's palette, light and dark, matching src/theme/theme.ts. Nonisolated so
/// the Canvas that draws the mark can read them.
nonisolated private let paper = dynamic(light: 0xf7f4ed, dark: 0x14110d)
nonisolated private let ink = dynamic(light: 0x1a1815, dark: 0xf4efe4)
nonisolated private let softInk = dynamic(light: 0x2c2820, dark: 0xe9e3d6)
nonisolated private let green = dynamic(light: 0x2f6f4e, dark: 0x5fae86)
nonisolated private let clay = dynamic(light: 0xa44a24, dark: 0xe08f63)
nonisolated private let muted = dynamic(light: 0x4a453c, dark: 0xcfc7b6)
nonisolated private let rule = dynamic(light: 0xcfc6b2, dark: 0x403830)

/// The hosts that stay inside the app. Must match WKAppBoundDomains in
/// ios/TrivetBox/Info.plist: a navigation to any other host fails in the web
/// view, so those go to Safari instead.
private let trivetHosts: Set<String> = ["trivetbox.com", "www.trivetbox.com"]

/// What the web view and the screen around it share.
@Observable
final class WebState {
    let home: URL
    /// The no-connection screen is showing.
    var showOffline = false
    /// No page has appeared yet: the opening screen covers the web view.
    var isOpening = true
    /// A page has loaded since launch. After that a failed load leaves the
    /// page on screen, as Safari would, instead of covering it.
    @ObservationIgnored var hasLoaded = false
    @ObservationIgnored weak var webView: WKWebView?
    /// A share has been sent to the upload page, which is loading.
    @ObservationIgnored var deliveringShare = false
    /// The upload page has loaded for a share it asks for itself (anything
    /// but a link). It is not opened again until the app next comes forward,
    /// so a page that never asks cannot be reloaded over and over.
    @ObservationIgnored var offeredShare = false

    init(home: URL) { self.home = home }

    func retry() {
        showOffline = false
        webView?.load(URLRequest(url: home))
    }

    /// Pages where a waiting share would interrupt somebody mid-sign-in. The
    /// share waits; the app tries again when it next comes forward.
    private static let signInPaths: Set<String> = [
        "/sign-in", "/sign-up", "/forgot-password", "/reset-password",
    ]

    /// Open a share on the upload page, which reads it on arrival. Called
    /// when the app comes forward and after each page loads. If the person is
    /// signed out, the site sends them to sign in and the share keeps waiting.
    func deliverPendingShare() {
        guard let webView, !deliveringShare, !offeredShare, let item = PendingShare.item() else { return }
        if Self.signInPaths.contains(webView.url?.path ?? "") { return }
        deliveringShare = true
        webView.load(URLRequest(url: PendingShare.uploadURL(for: item, home: home)))
    }

    /// The app came forward: try a waiting share again, even one the page
    /// was offered before.
    func cameForward() {
        offeredShare = false
        deliverPendingShare()
    }

    /// A page finished loading. A link is done once the upload page has it in
    /// its address; anything else once the page says it has taken it
    /// (`ShareBridge`).
    func pageLoaded(_ url: URL?) {
        if deliveringShare {
            deliveringShare = false
            if url?.path == "/upload" {
                if let item = PendingShare.item(), item.needsBridge {
                    offeredShare = true
                } else {
                    PendingShare.clear()
                }
                return
            }
        }
        deliverPendingShare()
    }
}

/// The whole app: trivetbox.com, full screen. The site does everything; this
/// gives it a home-screen icon, keeps the family signed in, and says plainly
/// when there is no connection to open it with.
struct ContentView: View {
    @State private var state = WebState(home: URL(string: "https://trivetbox.com")!)
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        ZStack {
            TrivetWebView(state: state)
            if state.isOpening && !state.showOffline {
                OpeningView(retry: state.retry)
                    .transition(.opacity)
                    // Kept above the web view while it fades out. Without
                    // this, SwiftUI drops a view that is leaving a ZStack
                    // behind its siblings, and the fade happens out of sight.
                    .zIndex(1)
            }
            if state.showOffline {
                NoConnectionView(retry: state.retry)
            }
        }
        .background(paper.ignoresSafeArea())
        // Back from sharing a recipe to Trivet: open it on the upload page.
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { state.cameForward() }
        }
    }
}

struct TrivetWebView: UIViewRepresentable {
    let state: WebState

    func makeCoordinator() -> Coordinator { Coordinator(state: state) }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default() // stay signed in between launches
        config.limitsNavigationsToAppBoundDomains = true // service workers need it
        // How the upload page takes screenshots' words, photos and PDFs from
        // the share sheet. Answers Trivet's own pages only.
        config.userContentController.addScriptMessageHandler(
            ShareBridge(allowedHosts: trivetHosts) { [weak state] in state?.offeredShare = false },
            contentWorld: .page,
            name: ShareBridge.name
        )
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true // swipe back
        state.webView = webView
        webView.load(URLRequest(url: state.home))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        let state: WebState

        init(state: WebState) { self.state = state }

        /// Trivet's own pages stay in the app. A page on any other site opens
        /// in Safari, and links like sms: and mailto: (Text it, an invite
        /// email) go to the app that handles them.
        func webView(
            _ webView: WKWebView,
            decidePolicyFor action: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            guard let url = action.request.url, let scheme = url.scheme?.lowercased() else {
                decisionHandler(.allow)
                return
            }
            switch scheme {
            case "http", "https":
                let host = url.host?.lowercased() ?? ""
                let mainFrame = action.targetFrame?.isMainFrame ?? true
                if !trivetHosts.contains(host) && mainFrame {
                    UIApplication.shared.open(url)
                    decisionHandler(.cancel)
                } else {
                    decisionHandler(.allow)
                }
            case "about", "blob", "data":
                decisionHandler(.allow)
            default:
                UIApplication.shared.open(url)
                decisionHandler(.cancel)
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

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            if state.isOpening {
                // The first page fades in over the opening screen. A beat
                // first: "finished" means the page has loaded, not that it
                // has been drawn, and fading to a half-painted page reads as
                // a jump.
                let state = state
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
                    withAnimation(.easeOut(duration: 0.35)) { state.isOpening = false }
                }
            }
            state.hasLoaded = true
            state.showOffline = false
            state.pageLoaded(webView.url)
        }

        func webView(
            _ webView: WKWebView,
            didFailProvisionalNavigation navigation: WKNavigation!,
            withError error: Error
        ) {
            showOfflineIfNeeded(error)
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            showOfflineIfNeeded(error)
        }

        /// Only a launch that never reached the site gets the screen, and only
        /// for a network failure. A cancelled load, or one handed to Safari,
        /// fails too, and must not look like a lost connection.
        private func showOfflineIfNeeded(_ error: Error) {
            let error = error as NSError
            // A share whose page failed tries again later. A cancelled load is
            // not a failure: it is usually the home page giving way to it.
            if error.code != NSURLErrorCancelled { state.deliveringShare = false }
            guard !state.hasLoaded, error.domain == NSURLErrorDomain,
                  Self.offlineCodes.contains(error.code) else { return }
            state.showOffline = true
        }

        private static let offlineCodes: Set<Int> = [
            NSURLErrorNotConnectedToInternet,
            NSURLErrorNetworkConnectionLost,
            NSURLErrorCannotFindHost,
            NSURLErrorCannotConnectToHost,
            NSURLErrorDNSLookupFailed,
            NSURLErrorTimedOut,
            NSURLErrorInternationalRoamingOff,
            NSURLErrorDataNotAllowed,
        ]
    }
}

/// From the launch screen to the first page. Drawn in
/// design_handoff_trivet_loading/ (states 2 and 3).
///
/// The mark sits exactly where the launch screen put it, so the app seems to
/// wake up rather than change screens: its clay centre simmers, a slow pulse.
/// After a second, *Opening your kitchen* fades in beneath; after eight,
/// it says the connection is slow and offers Try again. A lost connection is
/// still NoConnectionView's. With Reduce Motion on, the mark stays still.
struct OpeningView: View {
    let retry: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var simmering = false
    @State private var showLine = false
    @State private var slow = false
    /// Restarts the timers when Try again is pressed.
    @State private var attempt = 0

    var body: some View {
        ZStack {
            paper
            TrivetMark(drawsHub: false)
                .frame(width: 72, height: 72)
                .overlay {
                    Circle()
                        .fill(clay)
                        .frame(width: 72 * 7 / 32, height: 72 * 7 / 32)
                        .scaleEffect(simmering ? 0.72 : 1)
                        .opacity(simmering ? 0.55 : 1)
                }
                .overlay(alignment: .top) {
                    VStack(spacing: 18) {
                        Text(slow ? "Still opening. The connection is slow." : "Opening your kitchen")
                            .font(.system(size: 17, weight: .light, design: .serif))
                            .italic()
                            .foregroundStyle(muted)
                            .multilineTextAlignment(.center)
                        if slow {
                            Button {
                                attempt += 1
                                retry()
                            } label: {
                                Text("Try again")
                                    .textCase(.uppercase)
                                    .font(.system(size: 12, weight: .bold))
                                    .tracking(1.8)
                                    .foregroundStyle(ink)
                                    .padding(.horizontal, 18)
                                    .frame(minHeight: 44)
                                    .overlay(Rectangle().stroke(rule, lineWidth: 1))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .frame(width: 300)
                    .fixedSize(horizontal: false, vertical: true)
                    .offset(y: 72 + 18)
                    .opacity(showLine ? 1 : 0)
                }
                .accessibilityElement(children: .contain)
                .accessibilityLabel("Opening Trivet")
        }
        // Centred on the whole screen, as the launch screen centres its image.
        .ignoresSafeArea()
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(.easeInOut(duration: 0.8).repeatForever(autoreverses: true)) {
                simmering = true
            }
        }
        .task(id: attempt) {
            slow = false
            try? await Task.sleep(for: .seconds(1.2))
            withAnimation(.easeOut(duration: 0.4)) { showLine = true }
            try? await Task.sleep(for: .seconds(6.8))
            withAnimation(.easeOut(duration: 0.3)) { slow = true }
        }
    }
}

/// Launch with no connection, before the site has ever loaded. Drawn from
/// design_handoff_trivet_offline/04. Until the offline shopping list ships,
/// the copy only says what is true today: the app needs a connection to open.
struct NoConnectionView: View {
    let retry: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            TrivetMark()
                .frame(width: 56, height: 56)
                .accessibilityLabel("Trivet")
            Text("No connection yet")
                .font(.system(size: 40, design: .serif))
                .foregroundStyle(ink)
                .padding(.top, 28)
            Rectangle()
                .fill(ink)
                .frame(height: 1)
                .padding(.top, 18)
            Text("Trivet needs a connection to open. Check your signal or Wi-Fi, then try again.")
                .font(.system(size: 18, design: .serif))
                .foregroundStyle(softInk)
                .lineSpacing(4)
                .padding(.top, 18)
            Button(action: retry) {
                Text("Try again")
                    .textCase(.uppercase)
                    .font(.system(size: 12, weight: .bold))
                    .tracking(1.8)
                    .foregroundStyle(paper)
                    .frame(maxWidth: .infinity, minHeight: 48)
                    .background(ink)
            }
            .buttonStyle(.plain)
            .padding(.top, 32)
        }
        .padding(.horizontal, 32)
        .frame(maxWidth: 560, maxHeight: .infinity)
        .frame(maxWidth: .infinity)
        .background(paper.ignoresSafeArea())
    }
}

/// The Trivet mark: a ring on three legs with a clay hub, from ios/app-icon.svg.
/// `drawsHub: false` leaves the hub for the caller to draw, so it can move.
struct TrivetMark: View {
    var drawsHub = true

    var body: some View {
        // A plain copy for the drawing closure, which runs off the main actor.
        let hub = drawsHub
        Canvas { context, size in
            let s = min(size.width, size.height) / 32
            func point(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: x * s, y: y * s) }
            let line = StrokeStyle(lineWidth: 3.2 * s, lineCap: .round)

            let ring = Path(ellipseIn: CGRect(x: 7 * s, y: 7 * s, width: 18 * s, height: 18 * s))
            var legs = Path()
            legs.move(to: point(16, 25)); legs.addLine(to: point(16, 29.2))
            legs.move(to: point(8.2, 11.5)); legs.addLine(to: point(4.5, 9.4))
            legs.move(to: point(23.8, 11.5)); legs.addLine(to: point(27.5, 9.4))

            context.stroke(ring, with: .color(green), style: line)
            context.stroke(legs, with: .color(green), style: line)
            if hub {
                context.fill(
                    Path(ellipseIn: CGRect(x: 12.5 * s, y: 12.5 * s, width: 7 * s, height: 7 * s)),
                    with: .color(clay)
                )
            }
        }
    }
}

#Preview("Opening") {
    OpeningView(retry: {})
}

#Preview("No connection") {
    NoConnectionView(retry: {})
}

import Observation
import SwiftUI
import UIKit
import UniformTypeIdentifiers

/// Share to Trivet: the sheet that opens when somebody picks Trivet in the
/// iPhone share sheet. Replaces Xcode's compose-sheet template, since there is
/// nothing to compose here, only a link to hand to the app.
///
/// The extension cannot see the app's sign-in (it lives in the app's web view),
/// and Apple does not let it open the app. So it leaves the link in the App
/// Group folder (`SharedLink.save`) and the app picks it up the next time it
/// comes forward. See SHARE-SHEET-PLAN.md.
final class ShareViewController: UIViewController {
    private let model = ShareModel()

    override func viewDidLoad() {
        super.viewDidLoad()

        let host = UIHostingController(
            rootView: ShareSheetView(model: model) { [weak self] in
                self?.extensionContext?.completeRequest(returningItems: nil)
            }
        )
        addChild(host)
        host.view.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(host.view)
        NSLayoutConstraint.activate([
            host.view.topAnchor.constraint(equalTo: view.topAnchor),
            host.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            host.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            host.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])
        host.didMove(toParent: self)

        let items = extensionContext?.inputItems as? [NSExtensionItem] ?? []
        Task { await model.read(items) }
    }
}

/// What the sheet is showing.
enum ShareState: Equatable {
    case reading
    /// A recipe link, left for the app. `host` is the site, as people say it.
    case ready(host: String)
    /// A TikTok or Instagram link, whose caption cannot be read.
    case social(name: String)
    /// Nothing that looks like a link.
    case noLink
    /// The App Group folder could not be written.
    case failed
}

@MainActor
@Observable
final class ShareModel {
    var state: ShareState = .reading
    /// Show how to pin Trivet in the share sheet. Only for the first few
    /// shares: by then it is pinned, or iOS has moved it up by itself.
    var showPinTip = false

    private static let tipShares = 3
    private static let sharesKey = "readyShares"

    /// Find the link in what was shared: a URL if the app shared one (Safari,
    /// Chrome), otherwise the first link in shared text ("Look at this!
    /// https://…"). File URLs (a photo, a PDF) are not links; they come with
    /// the second phase.
    func read(_ items: [NSExtensionItem]) async {
        for item in items {
            for provider in item.attachments ?? [] {
                guard provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) else { continue }
                let loaded = try? await provider.loadItem(forTypeIdentifier: UTType.url.identifier)
                if let url = loaded as? URL, !url.isFileURL, SharedLink.isWeb(url) {
                    settle(url)
                    return
                }
            }
        }

        for item in items {
            for provider in item.attachments ?? [] {
                guard provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) else { continue }
                let loaded = try? await provider.loadItem(forTypeIdentifier: UTType.plainText.identifier)
                if let text = loaded as? String, let url = SharedLink.firstLink(in: text) {
                    settle(url)
                    return
                }
            }
            if let text = item.attributedContentText?.string, let url = SharedLink.firstLink(in: text) {
                settle(url)
                return
            }
        }

        state = .noLink
    }

    private func settle(_ url: URL) {
        if let name = SharedLink.socialSite(url) {
            state = .social(name: name)
            return
        }
        do {
            try SharedLink.save(url)
            let shares = UserDefaults.standard.integer(forKey: Self.sharesKey) + 1
            UserDefaults.standard.set(shares, forKey: Self.sharesKey)
            showPinTip = shares <= Self.tipShares
            state = .ready(host: SharedLink.hostLabel(url))
        } catch {
            state = .failed
        }
    }
}

/// The sheet itself, in the app's colours and the same shape as the app's
/// no-connection screen: the mark, a serif heading over a rule, one line of
/// copy, one button.
struct ShareSheetView: View {
    let model: ShareModel
    let done: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            TrivetMark()
                .frame(width: 44, height: 44)
                .accessibilityLabel("Trivet")

            if model.state == .reading {
                ProgressView()
                    .padding(.top, 28)
            } else {
                Text(heading)
                    .font(.system(size: 32, design: .serif))
                    .foregroundStyle(ink)
                    .padding(.top, 24)
                Rectangle()
                    .fill(ink)
                    .frame(height: 1)
                    .padding(.top, 16)
                Text(message)
                    .font(.system(size: 18, design: .serif))
                    .foregroundStyle(softInk)
                    .lineSpacing(4)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 16)
                Button(action: done) {
                    Text("Done")
                        .textCase(.uppercase)
                        .font(.system(size: 12, weight: .bold))
                        .tracking(1.8)
                        .foregroundStyle(paper)
                        .frame(maxWidth: .infinity, minHeight: 48)
                        .background(ink)
                }
                .buttonStyle(.plain)
                .padding(.top, 28)

                // Apps cannot pin themselves in the share sheet, so say how,
                // once it has proved worth pinning.
                if model.showPinTip {
                    Text("Tip")
                        .textCase(.uppercase)
                        .font(.system(size: 11, weight: .bold))
                        .tracking(1.6)
                        .foregroundStyle(green)
                        .padding(.top, 32)
                    Text("Keep Trivet up front: in any share sheet, tap More, then Edit, then the + beside Trivet.")
                        .font(.system(size: 15))
                        .foregroundStyle(softInk)
                        .lineSpacing(3)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 6)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 32)
        .padding(.top, 40)
        .frame(maxWidth: 560)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(paper.ignoresSafeArea())
    }

    private var heading: String {
        switch model.state {
        case .reading: return ""
        case .ready: return "Ready for Trivet"
        case .social: return "Screenshot it instead"
        case .noLink: return "No link in that"
        case .failed: return "That didn't save"
        }
    }

    private var message: String {
        switch model.state {
        case .reading:
            return ""
        case .ready(let host):
            return "The recipe from \(host) is waiting. Open Trivet and it will be read on the Add a recipe page."
        case .social(let name):
            return "\(name) doesn't share captions with other apps. Take a screenshot of the caption and add it in Trivet, under Upload."
        case .noLink:
            return "Share the recipe page itself. For a recipe in a message or a note, copy the text and paste it in Trivet, under Upload."
        case .failed:
            return "Trivet couldn't keep that link. Copy it and paste it in Trivet, under Upload."
        }
    }
}

/// Trivet's palette, light and dark. A copy of the one at the top of the app's
/// ContentView.swift: an extension is a separate program and cannot use the
/// app's code. If either changes, change both.
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

nonisolated private let paper = dynamic(light: 0xf7f4ed, dark: 0x14110d)
nonisolated private let ink = dynamic(light: 0x1a1815, dark: 0xf4efe4)
nonisolated private let softInk = dynamic(light: 0x2c2820, dark: 0xe9e3d6)
nonisolated private let green = dynamic(light: 0x2f6f4e, dark: 0x5fae86)
nonisolated private let clay = dynamic(light: 0xa44a24, dark: 0xe08f63)

/// The Trivet mark, as drawn in the app's ContentView.swift.
struct TrivetMark: View {
    var body: some View {
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
            context.fill(
                Path(ellipseIn: CGRect(x: 12.5 * s, y: 12.5 * s, width: 7 * s, height: 7 * s)),
                with: .color(clay)
            )
        }
    }
}

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
/// comes forward. Screenshots are read here, on the phone, so usually only
/// their words are left. See SHARE-SHEET-PLAN.md.
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
    /// Looking at what was shared. Brief for a link or text.
    case reading
    /// Reading the words in shared screenshots or photos, on the phone.
    case readingImages(count: Int)
    /// A recipe link, left for the app. `host` is the site, as people say it.
    case ready(host: String)
    /// Words left for the app: read off `screenshots` screenshots, or shared
    /// as text when that is nil. `excerpt` is how they start.
    case readyText(screenshots: Int?, excerpt: String, moreLines: Int)
    /// Photos with too few printed words to read on the phone, left for the
    /// photo import.
    case readyPhotos(count: Int)
    case readyPDF(name: String, size: String)
    /// A TikTok or Instagram link, whose caption cannot be read.
    case social(name: String)
    /// Nothing Trivet can read.
    case noLink
    /// Something the upload page would refuse, said here instead of after
    /// the trip to the app.
    case refused(Refusal)
    /// The App Group folder could not be written, or a file could not be read.
    case failed

    enum Refusal: Equatable {
        case tooMany(Int)
        case tooBig(megabytes: Int)
        /// A PDF with photos, or two PDFs: the upload reads one or the other.
        case mixed
    }

    var isReady: Bool {
        switch self {
        case .ready, .readyText, .readyPhotos, .readyPDF: return true
        default: return false
        }
    }
}

@MainActor
@Observable
final class ShareModel {
    var state: ShareState = .reading
    /// Show how to pin Trivet in the share sheet. Only for the first few
    /// shares: by then it is pinned, or iOS has moved it up by itself.
    var showPinTip = false
    /// Small copies of the shared images, so the sheet shows what it read.
    var thumbnails: [UIImage] = []
    /// Images whose words have been read, for the progress bar.
    var imagesRead = 0

    private static let tipShares = 3
    private static let sharesKey = "readyShares"

    /// Must match `MAX_PHOTOS` in src/app/api/upload/route.ts.
    private static let maxImages = 6
    /// Must match `MAX_PDF_BYTES` in src/app/api/upload/route.ts.
    private static let maxPDFBytes = 20 * 1024 * 1024
    /// Shared text with this much besides its link is a recipe to read as
    /// text, rather than a message carrying a link ("Look at this! https://…").
    private static let recipeTextCharacters = 120

    /// Find what to send in what was shared, in this order:
    ///
    /// 1. A web link, if the app shared one (Safari, Chrome, TikTok).
    /// 2. Screenshots, photos or a PDF (Photos, the screenshot editor, Mail,
    ///    Files).
    /// 3. Text: a recipe's text if there is enough of it (Notes, Messages),
    ///    otherwise the first link in it.
    func read(_ items: [NSExtensionItem]) async {
        let providers = items.flatMap { $0.attachments ?? [] }

        for provider in providers {
            guard provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) else { continue }
            let loaded = try? await provider.loadItem(forTypeIdentifier: UTType.url.identifier)
            if let url = loaded as? URL, !url.isFileURL, SharedLink.isWeb(url) {
                settle(url)
                return
            }
        }

        let pdfs = providers.filter { $0.hasItemConformingToTypeIdentifier(UTType.pdf.identifier) }
        let images = providers.filter {
            !pdfs.contains($0) && $0.hasItemConformingToTypeIdentifier(UTType.image.identifier)
        }
        if !pdfs.isEmpty || !images.isEmpty {
            await readFiles(pdfs: pdfs, images: images)
            return
        }

        var texts: [String] = []
        for provider in providers {
            guard provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) else { continue }
            let loaded = try? await provider.loadItem(forTypeIdentifier: UTType.plainText.identifier)
            if let text = loaded as? String { texts.append(text) }
        }
        for item in items {
            if let text = item.attributedContentText?.string { texts.append(text) }
        }
        for text in texts {
            if Self.isRecipeText(text) {
                settleText(text, screenshots: nil)
                return
            }
            if let url = SharedLink.firstLink(in: text) {
                settle(url)
                return
            }
        }

        state = .noLink
    }

    private func readFiles(pdfs: [NSItemProvider], images: [NSItemProvider]) async {
        if pdfs.count > 1 || (!pdfs.isEmpty && !images.isEmpty) {
            state = .refused(.mixed)
            return
        }
        if images.count > Self.maxImages {
            state = .refused(.tooMany(images.count))
            return
        }

        if let pdf = pdfs.first {
            let loaded = try? await pdf.loadItem(forTypeIdentifier: UTType.pdf.identifier)
            guard let data = Self.data(from: loaded) else {
                state = .failed
                return
            }
            if data.count > Self.maxPDFBytes {
                let megabytes = Int((Double(data.count) / 1_048_576).rounded(.up))
                state = .refused(.tooBig(megabytes: megabytes))
                return
            }
            let name = Self.pdfName(loaded, provider: pdf)
            keep(.readyPDF(name: name, size: Self.sizeLabel(data.count))) {
                try SharedLink.save(files: [.init(data: data, name: name, type: "application/pdf")])
            }
            return
        }

        // Every image is made a JPEG of at most 2,000 pixels first: the size
        // the photo import wants, small enough for six to fit the extension's
        // memory, and still plenty for the text recognition.
        state = .readingImages(count: images.count)
        var prepared: [Data] = []
        for provider in images {
            let loaded = try? await provider.loadItem(forTypeIdentifier: UTType.image.identifier)
            guard let original = Self.data(from: loaded),
                  let jpeg = await ScreenshotReader.jpeg(original)
            else {
                state = .failed
                return
            }
            prepared.append(jpeg)
            if let small = await ScreenshotReader.jpeg(jpeg, maxPixels: 300),
               let thumbnail = UIImage(data: small) {
                thumbnails.append(thumbnail)
            }
        }

        var pages: [ScreenshotReader.Page] = []
        for jpeg in prepared {
            pages.append(await ScreenshotReader.read(jpeg))
            imagesRead += 1
        }
        let reading = ScreenshotReader.combine(pages)

        if reading.isEnough {
            settleText(reading.text, screenshots: images.count)
            return
        }

        let files = prepared.enumerated().map { index, data in
            SharedLink.SharedFile(data: data, name: "Photo \(index + 1).jpg", type: "image/jpeg")
        }
        keep(.readyPhotos(count: files.count)) { try SharedLink.save(files: files) }
    }

    private func settle(_ url: URL) {
        if let name = SharedLink.socialSite(url) {
            state = .social(name: name)
            return
        }
        keep(.ready(host: SharedLink.hostLabel(url))) { try SharedLink.save(url) }
    }

    private func settleText(_ text: String, screenshots: Int?) {
        let (excerpt, moreLines) = Self.excerpt(of: text)
        keep(.readyText(screenshots: screenshots, excerpt: excerpt, moreLines: moreLines)) {
            try SharedLink.save(text: text, screenshots: screenshots)
        }
    }

    /// Leave the share for the app and show `ready`, or say it failed.
    private func keep(_ ready: ShareState, _ save: () throws -> Void) {
        do {
            try save()
            let shares = UserDefaults.standard.integer(forKey: Self.sharesKey) + 1
            UserDefaults.standard.set(shares, forKey: Self.sharesKey)
            showPinTip = shares <= Self.tipShares
            state = ready
        } catch {
            state = .failed
        }
    }

    private static func isRecipeText(_ text: String) -> Bool {
        var rest = text
        if let url = SharedLink.firstLink(in: text) {
            rest = rest.replacingOccurrences(of: url.absoluteString, with: "")
        }
        return rest.trimmingCharacters(in: .whitespacesAndNewlines).count >= recipeTextCharacters
    }

    /// The first lines, run together to about two sentences, and how many
    /// lines are left after them.
    private static func excerpt(of text: String) -> (String, Int) {
        let lines = text.split(whereSeparator: \.isNewline)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
        var used = 0
        var excerpt = ""
        for line in lines {
            excerpt += excerpt.isEmpty ? line : " " + line
            used += 1
            if excerpt.count >= 160 { break }
        }
        if excerpt.count > 180 { excerpt = String(excerpt.prefix(177)) + "…" }
        else if used < lines.count { excerpt += "…" }
        return (excerpt, lines.count - used)
    }

    /// A shared image or PDF arrives as a file, as data or, from the
    /// screenshot editor, as an image.
    private static func data(from item: Any?) -> Data? {
        if let url = item as? URL { return try? Data(contentsOf: url) }
        if let data = item as? Data { return data }
        if let image = item as? UIImage { return image.jpegData(compressionQuality: 0.9) }
        return nil
    }

    private static func pdfName(_ item: Any?, provider: NSItemProvider) -> String {
        if let url = item as? URL, !url.lastPathComponent.isEmpty { return url.lastPathComponent }
        guard let name = provider.suggestedName, !name.isEmpty else { return "Recipe.pdf" }
        return name.lowercased().hasSuffix(".pdf") ? name : name + ".pdf"
    }

    private static func sizeLabel(_ bytes: Int) -> String {
        ByteCountFormatter.string(fromByteCount: Int64(bytes), countStyle: .file)
    }
}

/// The sheet itself, in the app's colours and the same shape as the app's
/// no-connection screen: the mark, a serif heading over a rule, one line of
/// copy, one button. Drawn in design_handoff_trivet_share/.
struct ShareSheetView: View {
    let model: ShareModel
    let done: () -> Void

    var body: some View {
        ScrollView {
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

                    details

                    // No Done while reading: leaving now would lose it.
                    if !isReadingImages {
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
                    }

                    // Apps cannot pin themselves in the share sheet, so say
                    // how, once it has proved worth pinning.
                    if model.showPinTip && model.state.isReady {
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
            }
            .padding(.horizontal, 32)
            .padding(.top, 40)
            .padding(.bottom, 32)
            .frame(maxWidth: 560, alignment: .leading)
            .frame(maxWidth: .infinity, alignment: .top)
        }
        .background(paper.ignoresSafeArea())
    }

    /// What sits under the message: progress and the images being read, what
    /// was read, or the file.
    @ViewBuilder private var details: some View {
        switch model.state {
        case .readingImages(let count):
            ProgressView(value: Double(model.imagesRead), total: Double(count))
                .tint(green)
                .padding(.top, 28)
                .accessibilityLabel("Reading the screenshots")
            thumbnails(numbered: true)
        case .readyText(let screenshots, let excerpt, let moreLines) where screenshots != nil:
            Text("What it read")
                .textCase(.uppercase)
                .font(.system(size: 11, weight: .bold))
                .tracking(1.8)
                .foregroundStyle(green)
                .padding(.top, 26)
            VStack(alignment: .leading, spacing: 10) {
                Text(excerpt)
                    .font(.system(size: 15, weight: .light, design: .serif).italic())
                    .foregroundStyle(softInk)
                    .lineSpacing(3)
                    .fixedSize(horizontal: false, vertical: true)
                if moreLines > 0 {
                    Text("And \(moreLines) more \(moreLines == 1 ? "line" : "lines")")
                        .font(.system(size: 12))
                        .foregroundStyle(muted)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(raised)
            .overlay(alignment: .top) { Rectangle().fill(divider).frame(height: 1) }
            .overlay(alignment: .bottom) { Rectangle().fill(divider).frame(height: 1) }
            .padding(.top, 8)
        case .readyPhotos:
            thumbnails(numbered: false)
        case .readyPDF(let name, let size):
            HStack(spacing: 14) {
                Image(systemName: "doc.text")
                    .font(.system(size: 24, weight: .light))
                    .foregroundStyle(ink)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 3) {
                    Text(name)
                        .font(.system(size: 18, design: .serif))
                        .foregroundStyle(ink)
                        .lineLimit(1)
                        .truncationMode(.middle)
                    Text("PDF · \(size)")
                        .font(.system(size: 12))
                        .foregroundStyle(muted)
                }
            }
            .padding(.vertical, 14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .overlay(alignment: .top) { Rectangle().fill(divider).frame(height: 1) }
            .overlay(alignment: .bottom) { Rectangle().fill(divider).frame(height: 1) }
            .padding(.top, 26)
        default:
            EmptyView()
        }
    }

    private func thumbnails(numbered: Bool) -> some View {
        HStack(alignment: .top, spacing: 12) {
            ForEach(Array(model.thumbnails.prefix(4).enumerated()), id: \.offset) { index, image in
                VStack(alignment: .leading, spacing: 8) {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFit()
                        .frame(maxWidth: 72, maxHeight: 132)
                    if numbered {
                        Text("\(index + 1)")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundStyle(muted)
                    }
                }
            }
            if model.thumbnails.count > 4 {
                Text("+\(model.thumbnails.count - 4)")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(muted)
                    .padding(.top, 12)
            }
        }
        .accessibilityHidden(true)
        .padding(.top, 26)
    }

    private var isReadingImages: Bool {
        if case .readingImages = model.state { return true }
        return false
    }

    private var heading: String {
        switch model.state {
        case .reading: return ""
        case .readingImages(let count):
            return count == 1 ? "Reading the image" : "Reading \(count) images"
        case .ready, .readyText, .readyPhotos, .readyPDF: return "Ready for Trivet"
        case .social: return "Screenshot it instead"
        case .noLink: return "Nothing to read in that"
        case .refused(.tooMany): return "Six at a time"
        case .refused(.tooBig): return "That file is too big"
        case .refused(.mixed): return "One kind at a time"
        case .failed: return "That didn't save"
        }
    }

    private var message: String {
        switch model.state {
        case .reading:
            return ""
        case .readingImages:
            return "Finding the words, here on your phone. Nothing has been sent anywhere."
        case .ready(let host):
            return "The recipe from \(host) is waiting. Open Trivet and it will be read on the Add a recipe page."
        case .readyText(let screenshots?, _, _):
            let what = screenshots == 1 ? "1 screenshot is" : "\(screenshots) screenshots are"
            return "The words from \(what) waiting. Open Trivet and they will be read on the Add a recipe page."
        case .readyText:
            return "The recipe's text is waiting. Open Trivet and it will be read on the Add a recipe page."
        case .readyPhotos(let count):
            return count == 1
                ? "Your photo is waiting. Open Trivet and it will be read as a card on the Add a recipe page."
                : "Your \(count) photos are waiting. Open Trivet and they will be read as one recipe on the Add a recipe page."
        case .readyPDF:
            return "Your PDF is waiting. Open Trivet and it will be read on the Add a recipe page."
        case .social(let name):
            return "\(name) doesn't share captions with other apps. Take screenshots of the caption and share those to Trivet."
        case .noLink:
            return "Share the recipe page itself, screenshots of the recipe, or its text."
        case .refused(.tooMany(let count)):
            return "Trivet reads up to six screenshots or photos as one recipe, and you picked \(count). Share the six that hold the recipe."
        case .refused(.tooBig(let megabytes)):
            return "Trivet takes PDFs up to 20 MB, and this one is \(megabytes) MB. A screenshot of each page will go through."
        case .refused(.mixed):
            return "Share one PDF on its own, or up to six screenshots and photos."
        case .failed:
            return "Trivet couldn't keep that. Try sharing it again, or add it in Trivet under Upload."
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
// Only the sheet uses these; they are src/theme/theme.ts's `text.secondary`,
// `background.raised` and `divider`.
nonisolated private let muted = dynamic(light: 0x746c5c, dark: 0xa09788)
nonisolated private let raised = dynamic(light: 0xefe9dc, dark: 0x1f1a13)
nonisolated private let divider = dynamic(light: 0xded7c8, dark: 0x2e2820)

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

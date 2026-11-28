import PhotosUI
import SwiftUI
import UIKit
import UniformTypeIdentifiers
import WebKit

/// Reads a recipe video the person picked, on the phone, and shows them what it
/// found before anything is imported.
///
/// The upload page's "From a video" button (src/components/UploadWorkflow.tsx,
/// src/lib/video-bridge.ts) posts `{type: "open"}` over
/// `window.webkit.messageHandlers.trivetVideo`. The photo picker opens, filtered to
/// videos (it needs no photo-library permission). The chosen video is copied to a
/// temporary file, read by `VideoReader` (the words on screen, and the speech,
/// both on the phone), and the result is shown for the person to correct. On
/// Import it is left through `PendingShare.store(text:)` exactly as the share
/// sheet leaves screenshots' words, and `onImported` brings `/upload?shared=1`
/// forward to read it. The video is never uploaded, and the temporary copy is
/// deleted.
///
/// The page's `open` is answered once it is done with: `{imported: true}` once the
/// text has been left, null if the person cancelled, or a sentence the page shows
/// as it is when the video was too long or could not be opened.
///
/// Like the other bridges it answers Trivet's own pages in the main frame only.
@MainActor
final class VideoBridge: NSObject, WKScriptMessageHandlerWithReply, PHPickerViewControllerDelegate {
    /// Must match `VIDEO_BRIDGE` in src/lib/video-bridge.ts.
    static let name = "trivetVideo"

    private let allowedHosts: Set<String>
    private let onImported: () -> Void
    /// Answers the page's `open` when the whole thing is done with.
    private var pendingReply: ((Any?, String?) -> Void)?
    private var reading: Task<Void, Never>?

    init(allowedHosts: Set<String>, onImported: @escaping () -> Void) {
        self.allowedHosts = allowedHosts
        self.onImported = onImported
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
        guard pendingReply == nil, let presenter = Self.topViewController() else {
            replyHandler(nil, "A video is already being read.")
            return
        }

        pendingReply = replyHandler
        var configuration = PHPickerConfiguration()
        configuration.filter = .videos
        configuration.selectionLimit = 1
        configuration.preferredAssetRepresentationMode = .current
        let picker = PHPickerViewController(configuration: configuration)
        picker.delegate = self
        presenter.present(picker, animated: true)
    }

    /// Answer the page once, however it ended.
    private func answer(_ result: Any?, _ error: String? = nil) {
        let reply = pendingReply
        pendingReply = nil
        reply?(result, error)
    }

    func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        let presenter = picker.presentingViewController
        picker.dismiss(animated: true) { [weak self] in
            Task { @MainActor in self?.begin(results.first, from: presenter) }
        }
    }

    /// Copy the chosen video and read it, with a progress alert that can cancel.
    private func begin(_ result: PHPickerResult?, from presenter: UIViewController?) {
        guard let provider = result?.itemProvider, let presenter else {
            answer(nil)
            return
        }
        let progress = UIAlertController(
            title: "Reading the video",
            message: "Listening and reading the screen, on this phone. This can take a minute.",
            preferredStyle: .alert
        )
        progress.addAction(UIAlertAction(title: "Cancel", style: .cancel) { [weak self] _ in
            self?.reading?.cancel()
            self?.answer(nil)
        })
        presenter.present(progress, animated: true)

        reading = Task { [weak self] in
            // The picker's file is only valid inside this callback, so copy it.
            let copy: URL? = await withCheckedContinuation { continuation in
                provider.loadFileRepresentation(forTypeIdentifier: UTType.movie.identifier) { url, _ in
                    guard let url else {
                        continuation.resume(returning: nil)
                        return
                    }
                    let destination = FileManager.default.temporaryDirectory
                        .appendingPathComponent(UUID().uuidString + "-" + url.lastPathComponent)
                    do {
                        try FileManager.default.copyItem(at: url, to: destination)
                        continuation.resume(returning: destination)
                    } catch {
                        continuation.resume(returning: nil)
                    }
                }
            }
            guard let copy else {
                progress.dismiss(animated: true)
                self?.answer(nil, "That video couldn't be opened. Try another.")
                return
            }
            defer { try? FileManager.default.removeItem(at: copy) }

            do {
                let reading = try await VideoReader.read(copy)
                guard !Task.isCancelled else { return }
                progress.dismiss(animated: true) { [weak self] in
                    Task { @MainActor in self?.review(reading) }
                }
            } catch VideoReader.Failure.tooLong(let seconds) {
                guard !Task.isCancelled else { return }
                progress.dismiss(animated: true)
                let limit = Int(VideoReader.maxSeconds / 60)
                self?.answer(nil, "That video is \(Int(seconds.rounded())) seconds long. Choose one of \(limit) minutes or less.")
            } catch {
                guard !Task.isCancelled else { return }
                progress.dismiss(animated: true)
                self?.answer(nil, "That video couldn't be read. Try another, or screenshot the recipe instead.")
            }
        }
    }

    /// Show what was found, for the person to correct before it goes anywhere.
    private func review(_ reading: VideoReader.Reading) {
        let view = VideoReviewView(
            reading: reading,
            onImport: { [weak self] text in self?.finish(text) },
            onCancel: { [weak self] in self?.answer(nil) }
        )
        let host = UIHostingController(rootView: view)
        host.modalPresentationStyle = .pageSheet
        host.isModalInPresentation = true
        guard let presenter = Self.topViewController() else {
            answer(nil, "The result couldn't be shown. Try again.")
            return
        }
        presenter.present(host, animated: true)
    }

    private func finish(_ text: String) {
        guard PendingShare.store(text: text) else {
            answer(nil, "What was read couldn't be saved. Try again.")
            return
        }
        // The page first, so it can say it is opening the text, then the upload
        // page comes forward to read it.
        answer(["imported": true])
        onImported()
    }

    /// The view controller to present from.
    private static func topViewController() -> UIViewController? {
        let scene = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first { $0.activationState == .foregroundActive }
        var top = scene?.windows.first(where: \.isKeyWindow)?.rootViewController
        while let presented = top?.presentedViewController { top = presented }
        return top
    }
}

/// What the video gave, shown to be corrected, with the numbers a person (or a
/// tester) needs to judge it.
private struct VideoReviewView: View {
    let reading: VideoReader.Reading
    let onImport: (String) -> Void
    let onCancel: () -> Void

    @State private var text: String
    @Environment(\.dismiss) private var dismiss

    init(reading: VideoReader.Reading, onImport: @escaping (String) -> Void, onCancel: @escaping () -> Void) {
        self.reading = reading
        self.onImport = onImport
        self.onCancel = onCancel
        _text = State(initialValue: reading.text)
    }

    private var summary: String {
        let words = reading.spoken.split(whereSeparator: \.isWhitespace).count
        return "\(Int(reading.videoSeconds.rounded())) second video, read in \(Int(reading.tookSeconds.rounded())) seconds. "
            + "\(words) spoken words, \(reading.onScreen.count) lines on screen."
    }

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 12) {
                if reading.isEmpty {
                    Text("Nothing was found. Try a video where the steps are spoken, or the ingredients are shown on screen.")
                        .font(.body)
                } else {
                    Text("Check what was read. You can correct it before it is imported.")
                        .font(.subheadline)
                    TextEditor(text: $text)
                        .font(.body)
                        .overlay(RoundedRectangle(cornerRadius: 8).stroke(.quaternary))
                }
                ForEach(reading.notes, id: \.self) { note in
                    Text(note).font(.footnote).foregroundStyle(.orange)
                }
                Text(summary).font(.footnote).foregroundStyle(.secondary)
            }
            .padding()
            .navigationTitle("From a video")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                        onCancel()
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Import") {
                        dismiss()
                        onImport(text)
                    }
                    .disabled(reading.isEmpty || text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }
}

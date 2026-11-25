import Foundation
import Vision

/// Reading a scanned card on the phone, with the text recognition behind Live
/// Text, before anything is sent.
///
/// `ScanBridge` scans the card; this decides how it travels, by the same rule
/// the share sheet uses for screenshots (`ScreenshotReader` in TrivetShare,
/// whose thresholds these must match). A printed card is nearly all clean text:
/// it goes to the text import as words, which is quicker, cheaper, and sends
/// only the words. A handwritten card reads as a few uncertain words and goes
/// to the photo import as the scanned pages, which reads handwriting far better.
nonisolated enum ScanReader {
    /// What the recognition found across every page, in order.
    nonisolated struct Reading: Sendable {
        let text: String
        let lines: Int
        let confidence: Float

        /// Enough words, read cleanly enough, to send as text.
        var isEnough: Bool {
            lines >= ScanReader.minLines
                && text.count >= ScanReader.minCharacters
                && confidence >= ScanReader.minConfidence
        }
    }

    /// Must match `ScreenshotReader` in the share extension.
    static let minLines = 6
    static let minCharacters = 120
    static let minConfidence: Float = 0.6
    /// Must match `MAX_PASTED_CHARS` in src/lib/pasted-text.ts.
    static let maxCharacters = 20_000

    /// The words on every page, pages separated by a blank line.
    @concurrent static func read(_ pages: [Data]) async -> Reading {
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
        return Reading(
            text: String(texts.joined(separator: "\n\n").prefix(maxCharacters)),
            lines: lines,
            confidence: lines > 0 ? total / Float(lines) : 0
        )
    }
}

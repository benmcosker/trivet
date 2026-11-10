import Foundation
import ImageIO
import UniformTypeIdentifiers
import Vision

/// Reading shared screenshots and photos on the phone, with the text
/// recognition behind Live Text. Nothing leaves the phone here: the words, or
/// the images if there are too few words, are left for the app.
///
/// A caption screenshot is nearly all text and reads well, so it goes to the
/// text import, which is cheaper than reading images and sends only words. A
/// photo of a handwritten card or a dish reads as a few stray words, and goes
/// to the photo import instead, which reads the picture itself.
nonisolated enum ScreenshotReader {
    /// What the recognition found across every image, in share order.
    nonisolated struct Reading: Sendable {
        let text: String
        let lines: Int
        let confidence: Float

        /// Enough words, read cleanly enough, to send as text. Below this the
        /// photo import does better: it can read handwriting and layout.
        var isEnough: Bool {
            lines >= ScreenshotReader.minLines
                && text.count >= ScreenshotReader.minCharacters
                && confidence >= ScreenshotReader.minConfidence
        }
    }

    static let minLines = 6
    static let minCharacters = 120
    static let minConfidence: Float = 0.6
    /// Must match `MAX_PASTED_CHARS` in src/lib/pasted-text.ts.
    static let maxCharacters = 20_000

    /// The lines read off one image, with how sure the recognition was of
    /// each.
    nonisolated struct Page: Sendable {
        let lines: [String]
        let confidences: [Float]
    }

    /// Read the words in one image.
    @concurrent static func read(_ data: Data) async -> Page {
        var request = RecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = true
        let observations = (try? await request.perform(on: data)) ?? []

        var lines: [String] = []
        var confidences: [Float] = []
        for observation in observations {
            guard let candidate = observation.topCandidates(1).first else { continue }
            lines.append(candidate.string)
            confidences.append(candidate.confidence)
        }
        return Page(lines: lines, confidences: confidences)
    }

    /// The pages in share order, as one reading. Screenshots are separated by
    /// a blank line, so a caption that runs across two keeps its order.
    static func combine(_ pages: [Page]) -> Reading {
        let lines = pages.reduce(0) { $0 + $1.lines.count }
        let total = pages.reduce(Float(0)) { $0 + $1.confidences.reduce(0, +) }
        let text = pages
            .filter { !$0.lines.isEmpty }
            .map { $0.lines.joined(separator: "\n") }
            .joined(separator: "\n\n")
        return Reading(
            text: String(text.prefix(maxCharacters)),
            lines: lines,
            confidence: lines > 0 ? total / Float(lines) : 0
        )
    }

    /// A JPEG of an image at most `maxPixels` on its long side, upright.
    ///
    /// 2,000 for the photo import: the model reads at about 1,600 whatever it
    /// is sent, and the page sends several photos in one request with a cap of
    /// a few megabytes. Also turns HEIC from Photos into something every
    /// later step can read.
    @concurrent static func jpeg(_ data: Data, maxPixels: Int = 2000) async -> Data? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixels,
        ]
        guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else {
            return nil
        }
        let output = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(
            output, UTType.jpeg.identifier as CFString, 1, nil
        ) else { return nil }
        CGImageDestinationAddImage(
            destination, image,
            [kCGImageDestinationLossyCompressionQuality: 0.8] as CFDictionary
        )
        guard CGImageDestinationFinalize(destination) else { return nil }
        return output as Data
    }
}

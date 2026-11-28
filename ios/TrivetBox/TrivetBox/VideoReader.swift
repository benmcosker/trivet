import AVFoundation
import Foundation
import Speech
import Vision

/// Reading a recipe video on the phone, before anything is sent: the words on
/// screen, and the words spoken.
///
/// A reel or a cooking video carries a recipe two ways: as text on screen (the
/// ingredients, a caption) and as speech ("add two cups of flour..."). Both are
/// read here, on the phone, and only the resulting text ever leaves it, after the
/// person has seen it (`VideoBridge`) and agreed to the AI reading it. The video
/// itself is never uploaded or kept.
///
/// - **On screen:** a frame every few seconds, read with the same text
///   recognition as `ScanReader`. The same line shows in many frames, so each
///   distinct line is kept once, in the order it first appeared.
/// - **Spoken:** Apple's speech recognition, **on-device only**. A language the
///   phone cannot recognise itself is skipped with a note, rather than sending the
///   audio to Apple's servers.
nonisolated enum VideoReader {
    nonisolated struct Reading: Sendable {
        /// Distinct lines read off the screen, in order.
        let onScreen: [String]
        /// The transcript of the speech, or empty.
        let spoken: String
        /// The length of the video, in seconds.
        let videoSeconds: Double
        /// How long reading it took, in seconds. Shown so the spike can judge it.
        let tookSeconds: Double
        /// Things the person should know: speech skipped, nothing heard.
        let notes: [String]

        var isEmpty: Bool { onScreen.isEmpty && spoken.isEmpty }

        /// Both, labelled, as one block for the text import.
        var text: String {
            var parts: [String] = []
            if !spoken.isEmpty { parts.append("Spoken in the video:\n" + spoken) }
            if !onScreen.isEmpty { parts.append("Shown on screen:\n" + onScreen.joined(separator: "\n")) }
            return String(parts.joined(separator: "\n\n").prefix(VideoReader.maxCharacters))
        }
    }

    nonisolated enum Failure: Error {
        case tooLong(seconds: Double)
        case unreadable
    }

    /// Longer videos are refused with the length, not cut short.
    static let maxSeconds: Double = 180
    /// A frame this often. A recipe's on-screen text stays up for a few seconds.
    static let frameEvery: Double = 3
    /// Lines read with less confidence than this are noise.
    static let minConfidence: Float = 0.5
    /// A line shorter than this is a stray mark, not a recipe line.
    static let minLineLength = 4
    /// Must match `MAX_PASTED_CHARS` in src/lib/pasted-text.ts.
    static let maxCharacters = 20_000

    /// Read the video at `url`. Throws if it is too long or cannot be opened;
    /// otherwise returns whatever was found, which may be nothing.
    @concurrent static func read(_ url: URL) async throws -> Reading {
        let started = Date()
        let asset = AVURLAsset(url: url)
        guard let duration = try? await asset.load(.duration).seconds,
              duration.isFinite, duration > 0
        else { throw Failure.unreadable }
        guard duration <= maxSeconds else { throw Failure.tooLong(seconds: duration) }

        async let screen = onScreenLines(asset, duration: duration)
        async let speech = spokenText(url)
        let lines = await screen
        let (spoken, note) = await speech

        var notes: [String] = []
        if let note { notes.append(note) }
        if spoken.isEmpty && lines.count < 8 {
            notes.append("Very little was found. Many videos keep the recipe in the caption, not in the video: open the caption, copy it and paste it into the text box, or screenshot it.")
        }
        return Reading(
            onScreen: lines,
            spoken: spoken,
            videoSeconds: duration,
            tookSeconds: Date().timeIntervalSince(started),
            notes: notes
        )
    }

    /// Distinct lines of text on screen, from a frame every `frameEvery` seconds.
    private static func onScreenLines(_ asset: AVURLAsset, duration: Double) async -> [String] {
        let generator = AVAssetImageGenerator(asset: asset)
        generator.appliesPreferredTrackTransform = true
        generator.maximumSize = CGSize(width: 1280, height: 1280)

        var seen = Set<String>()
        var lines: [String] = []
        var second = 0.5
        while second < duration {
            defer { second += frameEvery }
            guard let (frame, _) = try? await generator.image(at: CMTime(seconds: second, preferredTimescale: 600))
            else { continue }

            var request = RecognizeTextRequest()
            request.recognitionLevel = .accurate
            request.usesLanguageCorrection = true
            let observations = (try? await request.perform(on: frame)) ?? []
            for observation in observations {
                guard let candidate = observation.topCandidates(1).first,
                      candidate.confidence >= minConfidence
                else { continue }
                let line = candidate.string.trimmingCharacters(in: .whitespacesAndNewlines)
                guard line.count >= minLineLength else { continue }
                let key = line.lowercased().filter { $0.isLetter || $0.isNumber }
                if seen.insert(key).inserted { lines.append(line) }
            }
        }
        return lines
    }

    /// The transcript, and a note if there is something to say about it.
    private static func spokenText(_ url: URL) async -> (String, String?) {
        let status = await withCheckedContinuation { (continuation: CheckedContinuation<SFSpeechRecognizerAuthorizationStatus, Never>) in
            SFSpeechRecognizer.requestAuthorization { continuation.resume(returning: $0) }
        }
        guard status == .authorized else {
            return ("", "Speech recognition isn't allowed for Trivet, so only the words on screen were read. You can allow it in Settings.")
        }
        guard let recognizer = SFSpeechRecognizer(locale: .current) ?? SFSpeechRecognizer(locale: Locale(identifier: "en-US")),
              recognizer.isAvailable
        else {
            return ("", "Speech recognition isn't available right now.")
        }
        guard recognizer.supportsOnDeviceRecognition else {
            return ("", "This language can't be recognised on the phone, so the spoken words were skipped. Trivet only uses on-device recognition.")
        }

        let request = SFSpeechURLRecognitionRequest(url: url)
        request.requiresOnDeviceRecognition = true
        request.shouldReportPartialResults = false
        request.addsPunctuation = true
        do {
            let text = try await transcribe(recognizer, request)
            return text.isEmpty ? ("", "No speech was found in the audio.") : (text, nil)
        } catch {
            return ("", "No speech was found in the audio.")
        }
    }

    /// Holds the task, so it is not released before it answers, and makes sure
    /// the continuation resumes once.
    private nonisolated final class Pending: @unchecked Sendable {
        var finished = false
        var task: SFSpeechRecognitionTask?
    }

    private static func transcribe(
        _ recognizer: SFSpeechRecognizer,
        _ request: SFSpeechURLRecognitionRequest
    ) async throws -> String {
        try await withCheckedThrowingContinuation { continuation in
            let pending = Pending()
            pending.task = recognizer.recognitionTask(with: request) { result, error in
                guard !pending.finished else { return }
                if let result, result.isFinal {
                    pending.finished = true
                    pending.task = nil
                    continuation.resume(returning: result.bestTranscription.formattedString)
                } else if let error {
                    pending.finished = true
                    pending.task = nil
                    continuation.resume(throwing: error)
                }
            }
        }
    }
}

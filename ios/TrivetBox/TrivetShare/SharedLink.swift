import Foundation

/// Reading a shared link, and leaving it where the app will find it.
enum SharedLink {
    /// The App Group both targets belong to. Must match both .entitlements
    /// files and `PendingShare.appGroup` in the app.
    static let appGroup = "group.com.trivetbox.app"

    /// The file the app reads. Must match `PendingShare` in the app.
    static let fileName = "pending-share.json"

    /// Hosts whose captions cannot be read by link. Must match
    /// `TIKTOK_HOSTS` and `INSTAGRAM_HOSTS` in src/lib/social-links.ts.
    private static let socialHosts: [String: String] = [
        "tiktok.com": "TikTok",
        "www.tiktok.com": "TikTok",
        "m.tiktok.com": "TikTok",
        "vm.tiktok.com": "TikTok",
        "vt.tiktok.com": "TikTok",
        "instagram.com": "Instagram",
        "www.instagram.com": "Instagram",
        "m.instagram.com": "Instagram",
        "instagr.am": "Instagram",
    ]

    /// An address on the web, rather than a file or another app's scheme.
    static func isWeb(_ url: URL) -> Bool {
        let scheme = url.scheme?.lowercased()
        return (scheme == "http" || scheme == "https") && !(url.host ?? "").isEmpty
    }

    /// The first web address in shared text, as `linkFromShare` reads it on
    /// the upload page.
    static func firstLink(in text: String) -> URL? {
        guard let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue) else {
            return nil
        }
        let range = NSRange(text.startIndex..., in: text)
        for match in detector.matches(in: text, range: range) {
            if let url = match.url, isWeb(url) { return url }
        }
        return nil
    }

    /// "TikTok" or "Instagram" for a link to either, else nil.
    static func socialSite(_ url: URL) -> String? {
        socialHosts[(url.host ?? "").lowercased()]
    }

    /// The site as a person would say it: `nytimes.com`, not `www.nytimes.com`.
    static func hostLabel(_ url: URL) -> String {
        let host = (url.host ?? "").lowercased()
        return host.hasPrefix("www.") ? String(host.dropFirst(4)) : host
    }

    /// The folder beside the record that holds shared files.
    /// Must match `PendingShare.filesFolder` in the app.
    static let filesFolder = "pending-share-files"

    /// Leave the link for the app. One share at a time: a new one replaces the
    /// last. The time is kept so the app can drop a share left for a day.
    static func save(_ url: URL) throws {
        try write(["kind": "link", "link": url.absoluteString])
    }

    /// Leave text for the app: words read off screenshots (`screenshots` is
    /// how many), or a recipe shared as text (`screenshots` nil).
    static func save(text: String, screenshots: Int?) throws {
        var record: [String: Any] = ["kind": "text", "text": text]
        if let screenshots { record["screenshots"] = screenshots }
        try write(record)
    }

    /// A file to leave for the app: its bytes, the name and type the upload
    /// page will give it.
    struct SharedFile {
        let data: Data
        let name: String
        let type: String
    }

    /// Leave photos or a PDF for the app, copied into the App Group folder.
    static func save(files: [SharedFile]) throws {
        let folder = try groupFolder()
        let filesURL = folder.appendingPathComponent(filesFolder, isDirectory: true)
        try? FileManager.default.removeItem(at: filesURL)
        try FileManager.default.createDirectory(at: filesURL, withIntermediateDirectories: true)

        var entries: [[String: Any]] = []
        for (index, file) in files.enumerated() {
            let stored = "\(index)"
            try file.data.write(to: filesURL.appendingPathComponent(stored), options: .atomic)
            entries.append(["name": file.name, "type": file.type, "size": file.data.count, "file": stored])
        }
        try write(["kind": "files", "files": entries], keepFiles: true)
    }

    private static func groupFolder() throws -> URL {
        guard let folder = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: appGroup
        ) else {
            throw CocoaError(.fileNoSuchFile)
        }
        return folder
    }

    /// The record the app reads. A share that is not files removes the files
    /// a previous share left, so they cannot outlive it.
    private static func write(_ record: [String: Any], keepFiles: Bool = false) throws {
        let folder = try groupFolder()
        if !keepFiles {
            try? FileManager.default.removeItem(at: folder.appendingPathComponent(filesFolder))
        }
        var record = record
        record["sharedAt"] = Date().timeIntervalSince1970
        let data = try JSONSerialization.data(withJSONObject: record)
        try data.write(to: folder.appendingPathComponent(fileName), options: .atomic)
    }
}

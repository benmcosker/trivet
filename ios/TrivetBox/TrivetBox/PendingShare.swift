import Foundation

/// What the share sheet (TrivetShare/SharedLink.swift) left in the App Group
/// folder, waiting for the app to open it on the upload page.
enum PendingShare {
    /// Must match both .entitlements files and `SharedLink.appGroup`.
    static let appGroup = "group.com.trivetbox.app"
    /// Must match `SharedLink.fileName`.
    private static let fileName = "pending-share.json"
    /// Must match `SharedLink.filesFolder`.
    private static let filesFolder = "pending-share-files"
    /// A share left this long is dropped rather than opened as a surprise.
    private static let maxAge: TimeInterval = 24 * 60 * 60

    /// A file the share sheet copied in, as the upload page will name it.
    struct File {
        let name: String
        let type: String
        let size: Int
        /// Where it is, inside the App Group folder.
        let url: URL
    }

    enum Item {
        /// Opened as `/upload?url=…`.
        case link(URL)
        /// Words read off `screenshots` screenshots, or text shared as text.
        case text(String, screenshots: Int?)
        case files([File])

        /// Only a link fits in the page's address. The rest the page asks
        /// for over the share bridge (`ShareBridge`).
        var needsBridge: Bool {
            if case .link = self { return false }
            return true
        }
    }

    private static var folder: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup)
    }

    /// The waiting share, if there is a fresh one. A stale one is removed.
    static func item() -> Item? {
        guard let folder,
              let data = try? Data(contentsOf: folder.appendingPathComponent(fileName)),
              let record = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let sharedAt = record["sharedAt"] as? Double
        else { return nil }

        if Date().timeIntervalSince1970 - sharedAt > maxAge {
            clear()
            return nil
        }

        // A record from the first share sheet has a link and no kind.
        switch record["kind"] as? String ?? "link" {
        case "link":
            guard let string = record["link"] as? String, let link = URL(string: string) else { return nil }
            return .link(link)
        case "text":
            guard let text = record["text"] as? String else { return nil }
            return .text(text, screenshots: record["screenshots"] as? Int)
        case "files":
            guard let entries = record["files"] as? [[String: Any]] else { return nil }
            let filesURL = folder.appendingPathComponent(filesFolder, isDirectory: true)
            var files: [File] = []
            for entry in entries {
                guard let name = entry["name"] as? String,
                      let type = entry["type"] as? String,
                      let size = entry["size"] as? Int,
                      let stored = entry["file"] as? String,
                      // A bare name, so a record cannot point outside the folder.
                      !stored.contains("/")
                else { return nil }
                files.append(File(name: name, type: type, size: size, url: filesURL.appendingPathComponent(stored)))
            }
            return files.isEmpty ? nil : .files(files)
        default:
            return nil
        }
    }

    static func clear() {
        guard let folder else { return }
        try? FileManager.default.removeItem(at: folder.appendingPathComponent(fileName))
        try? FileManager.default.removeItem(at: folder.appendingPathComponent(filesFolder))
    }

    /// Where to open the share: `/upload?url=…` for a link, which reads it on
    /// arrival (`linkFromShare`), and `/upload?shared=1` for the rest, which
    /// asks for it.
    static func uploadURL(for item: Item, home: URL) -> URL {
        guard case .link(let link) = item else {
            return URL(string: home.absoluteString + "/upload?shared=1")!
        }
        // Encoded by hand: URLComponents leaves `&` and `=` in a value alone,
        // which would cut a recipe address with its own query string short.
        var allowed = CharacterSet.urlQueryAllowed
        allowed.remove(charactersIn: "&=+?#/:")
        let encoded = link.absoluteString.addingPercentEncoding(withAllowedCharacters: allowed)
            ?? link.absoluteString
        return URL(string: home.absoluteString + "/upload?url=" + encoded)!
    }
}

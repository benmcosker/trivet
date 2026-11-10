import Foundation

/// A link left by the share sheet (TrivetShare/SharedLink.swift) in the App
/// Group folder, waiting for the app to open it on the upload page.
enum PendingShare {
    /// Must match both .entitlements files and `SharedLink.appGroup`.
    static let appGroup = "group.com.trivetbox.app"
    /// Must match `SharedLink.fileName`.
    private static let fileName = "pending-share.json"
    /// A share left this long is dropped rather than opened as a surprise.
    private static let maxAge: TimeInterval = 24 * 60 * 60

    private static var fileURL: URL? {
        FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: appGroup)?
            .appendingPathComponent(fileName)
    }

    /// The waiting link, if there is a fresh one. A stale one is removed.
    static func link() -> URL? {
        guard let file = fileURL,
              let data = try? Data(contentsOf: file),
              let record = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let string = record["link"] as? String,
              let link = URL(string: string),
              let sharedAt = record["sharedAt"] as? Double
        else { return nil }

        if Date().timeIntervalSince1970 - sharedAt > maxAge {
            clear()
            return nil
        }
        return link
    }

    static func clear() {
        guard let file = fileURL else { return }
        try? FileManager.default.removeItem(at: file)
    }

    /// `/upload?url=…`, which reads the link on arrival (`linkFromShare`).
    /// Encoded by hand: URLComponents leaves `&` and `=` in a value alone,
    /// which would cut a recipe address with its own query string short.
    static func uploadURL(for link: URL, home: URL) -> URL {
        var allowed = CharacterSet.urlQueryAllowed
        allowed.remove(charactersIn: "&=+?#/:")
        let encoded = link.absoluteString.addingPercentEncoding(withAllowedCharacters: allowed)
            ?? link.absoluteString
        return URL(string: home.absoluteString + "/upload?url=" + encoded)!
    }
}

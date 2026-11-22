import UserNotifications
import WebKit

/// Schedules a notification for a cooking timer, so it rings with the phone
/// locked.
///
/// A web page is suspended the moment the phone locks, so a timer counting in
/// it cannot ring. Cooking mode (src/components/CookingTimers.tsx) tells the
/// app over `window.webkit.messageHandlers.trivetTimer`
/// (src/lib/timer-bridge.ts):
///
/// - `schedule` with `id`, `at` (epoch milliseconds), `title` and `body` →
///   a local notification at that time. Scheduling an id again replaces the
///   pending one, which is what adding a minute or restoring a timer needs.
/// - `cancel` with `id` → forgets it, pending or already delivered.
///
/// Permission is asked for the first time a timer is scheduled, the moment its
/// reason is obvious. A refusal is not an error: the page still counts and
/// rings while it is open.
///
/// Like `ShareBridge` and `PrintBridge`, it answers Trivet's own pages in the
/// main frame only.
@MainActor
final class TimerBridge: NSObject, WKScriptMessageHandler {
    /// Must match `TIMER_BRIDGE` in src/lib/timer-bridge.ts.
    static let name = "trivetTimer"

    /// Held strongly: the notification centre keeps its delegate weakly.
    private static let delegate = TimerNotificationDelegate()

    private let allowedHosts: Set<String>

    init(allowedHosts: Set<String>) {
        self.allowedHosts = allowedHosts
        super.init()
        UNUserNotificationCenter.current().delegate = Self.delegate
    }

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        let origin = message.frameInfo.securityOrigin
        guard message.frameInfo.isMainFrame,
              origin.protocol == "https",
              allowedHosts.contains(origin.host.lowercased()),
              let body = message.body as? [String: Any],
              let type = body["type"] as? String,
              let id = body["id"] as? String
        else { return }

        switch type {
        case "schedule":
            guard let at = (body["at"] as? NSNumber)?.doubleValue,
                  let title = body["title"] as? String,
                  let text = body["body"] as? String
            else { return }
            Task { await Self.schedule(id: id, at: at / 1000, title: title, body: text) }
        case "cancel":
            let center = UNUserNotificationCenter.current()
            center.removePendingNotificationRequests(withIdentifiers: [id])
            center.removeDeliveredNotifications(withIdentifiers: [id])
        default:
            break
        }
    }

    private static func schedule(id: String, at: TimeInterval, title: String, body: String) async {
        let center = UNUserNotificationCenter.current()

        var settings = await center.notificationSettings()
        if settings.authorizationStatus == .notDetermined {
            _ = try? await center.requestAuthorization(options: [.alert, .sound])
            settings = await center.notificationSettings()
        }
        guard settings.authorizationStatus == .authorized
                || settings.authorizationStatus == .provisional
        else { return }

        // Already over, or about to be: the page rings it.
        let seconds = at - Date().timeIntervalSince1970
        guard seconds > 1 else { return }

        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default

        let request = UNNotificationRequest(
            identifier: id,
            content: content,
            trigger: UNTimeIntervalNotificationTrigger(timeInterval: seconds, repeats: false)
        )
        center.removePendingNotificationRequests(withIdentifiers: [id])
        try? await center.add(request)
    }
}

/// While Trivet is open the page rings itself (the screen is kept awake in
/// cooking mode), so the system banner and its sound are held back: otherwise
/// the cook hears two alarms.
final class TimerNotificationDelegate: NSObject, UNUserNotificationCenterDelegate {
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        []
    }
}

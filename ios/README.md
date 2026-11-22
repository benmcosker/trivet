# Trivet for iPhone

A thin native shell around [trivetbox.com](https://trivetbox.com): one screen,
the site full-screen, the family kept signed in. Everything Trivet does still
happens on the site, so a change merged to `main` reaches the app with no new
build. A new build is only needed when the Swift code here changes.

- App ID: `com.trivetbox.app`
- Home-screen name: Trivet
- iPhone and iPad, iOS 18 and later
- Distributed to the family through TestFlight, not the public App Store

## Run it

1. Open `ios/TrivetBox/TrivetBox.xcodeproj` in Xcode.
2. Under the TrivetBox target, Signing & Capabilities, choose your team.
3. Pick an iPhone simulator at the top and press Run.

## Send a build to TestFlight

1. In App Store Connect, create the app once, with the App ID above.
2. On the Mac, `git pull` on `main` first. An archive is built from whatever
   is checked out, and a build made before pulling quietly lacks the latest
   Swift changes - build 7 was nearly that.
3. Raise the build number (below).
4. In Xcode, set the destination to "Any iOS Device", then Product → Archive.
5. In the Organizer window that opens, Distribute App → App Store Connect →
   Upload. Generate Privacy Report there too, to check both manifests are in.
6. On the iPhone, open the TestFlight app → Trivet Box and install the new
   build. Closing and reopening Trivet does not: it keeps running whatever was
   installed, and App Store Connect's Installs column shows which builds ever
   reached a phone.
7. Check it: sign out, and the app should land on Sign in rather than the
   front page (that is the app identifying itself, `TrivetApp`, see
   "Staying on trivetbox.com").
8. To send it to the family, add the build to the Family group under External
   Testing. An external group's first look at a build goes through Apple's
   beta review, usually within a day. Each build expires after 90 days; upload
   a fresh one before then.

Raise the build number (target → General → Build) before each upload. It is
`CURRENT_PROJECT_VERSION` in `project.xcproj`; build 2 added the
no-connection screen and app-bound domains.

## Staying on trivetbox.com

The web view is limited to Trivet's own hosts (app-bound domains): iOS only
runs a site's service worker inside an app that declares its domains, and the
offline shopping list needs one. The hosts are listed twice and must match:
`WKAppBoundDomains` in `ios/TrivetBox/Info.plist` and `trivetHosts` in
`ContentView.swift`. A page on any other site opens in Safari, and links like
`sms:` and `mailto:` (Text it, invite emails) open the app that handles them.

The web view adds `TrivetApp` to its user agent
(`applicationNameForUserAgent` in `ContentView.swift`), and the site reads it
(`isTrivetApp` in `src/lib/site.ts`): signed out, the app opens on Sign in,
where a browser gets the public front page. A build older than build 7 lacks
it and shows the front page instead.

`Info.plist` sits beside the `TrivetBox` folder, not in it. That folder syncs
into the target, and an Info.plist inside it would also be copied as a
resource and fail the build.

## No connection

If the app opens with no connection and the site has never loaded, it shows a
native screen in Trivet's colours (`NoConnectionView`) with a Try again button,
instead of WebKit's blank error page. Only network failures trigger it, and
only before the first page loads; after that, a failed load leaves the page on
screen. To see it, turn on Airplane Mode and launch the app from closed. Its
copy says the app needs a connection; it changes to the designed wording when
the offline shopping list ships.

## Launch and opening

The launch screen is the paper colour with the Trivet mark (`UILaunchScreen` in
`Info.plist`, assets `LaunchBackground` and `LaunchMark`, light and dark). The
mark PNGs are drawn from the same SVG as the app icon; redraw them if it
changes. Until the first page loads, `OpeningView` in `ContentView.swift` shows
the mark in the same place with its centre simmering, then _Opening your
kitchen_, then after eight seconds a Try again. See
`design_handoff_trivet_loading/`.

## Share to Trivet

`TrivetShare` is a share extension: it puts **Trivet** in the iPhone share
sheet for web links, text, screenshots, photos and PDFs (`SHARE-SHEET-PLAN.md`;
the sheet's states are drawn in `design_handoff_trivet_share/`).

- The extension cannot see the app's sign-in and Apple does not let it open
  the app, so it leaves the share in the App Group folder
  (`group.com.trivetbox.app`: `pending-share.json`, and files in
  `pending-share-files/`) and says "Open Trivet". The app checks for it when it
  comes forward and after each page loads. On the sign-in pages it waits. A
  share older than a day is dropped.
- A link opens `/upload?url=…` and is cleared once the upload page has loaded.
- Screenshots and photos are read on the phone with Vision's text recognition
  (`ScreenshotReader.swift`). With enough words, only the words are left, as
  text; otherwise the images are left as JPEGs of at most 2,000 pixels. A
  recipe shared as text (Notes, Messages) is left as text. Text, photos and a
  PDF open `/upload?shared=1`, and the page asks for them over a script
  message handler (`ShareBridge.swift`, `src/lib/shared-item.ts`), which
  answers Trivet's own pages only. They are cleared once the page says it has
  them.
- The sheet refuses what the upload would: more than six images, a PDF over
  20 MB, a PDF with photos. The limits in `ShareViewController.swift` must
  match `src/app/api/upload/route.ts`.
- TikTok and Instagram links are answered in the sheet with the screenshot
  route, without reaching the app. The host list in
  `TrivetShare/SharedLink.swift` must match `src/lib/social-links.ts`.
- The App Group name appears in both `.entitlements` files,
  `SharedLink.appGroup` and `PendingShare.appGroup`; all four must match.
- The extension is a separate program, so the palette and the Trivet mark are
  copied into `ShareViewController.swift`. If either changes, change both.
- Its build number must match the app's (`CURRENT_PROJECT_VERSION` on both
  targets), or App Store Connect rejects the upload.

To test on a phone: Safari, a recipe page, Share, **Trivet** (under "More" the
first time, then it can be moved up), Done, then open Trivet. The upload page
should be reading that link. For screenshots: Photos, select two screenshots of
a caption, Share, **Trivet**; the sheet reads them, then Trivet opens on the
words being read.

## App icon

`TrivetBox/Assets.xcassets/AppIcon.appiconset/AppIcon.png`, drawn from
`ios/app-icon.svg`: the site's own mark (`src/app/icon.svg`) on a full-bleed
green square, since iOS rounds the corners itself. It must stay 1024 x 1024
with no transparency, or App Store Connect rejects the upload.

## Known gaps

- Links in emails and texts (invites, password resets, shopping lists) open
  the website, not the app.

## Printing

`window.print()` does nothing in a web view, so the Print buttons (the planner's
and the recipe's) call `printPage` (`src/lib/print-page.ts`). In the app that
posts to `PrintBridge`, which opens the iPhone's print sheet with the web view's
print formatter; elsewhere it is the browser's own print. The handler name
(`trivetPrint`) must match `PRINT_BRIDGE` there. The page's `@media print` rules
decide what is on paper. Needs a new build (the Swift changed); not yet tested
on a device. To test: the planner's Print and a recipe's Print should each open
the print sheet showing the print layout, not the screen layout.

## Cooking timers

Cooking mode's timers (`src/components/CookingTimers.tsx`) run in the page, which
iOS suspends when the phone locks. So each timer also tells the app over
`trivetTimer` (`TimerBridge.swift`, `src/lib/timer-bridge.ts`), which schedules a
local notification for its end time: `schedule` (id, end time in epoch
milliseconds, title, body) replaces any pending one with that id, `cancel`
removes it. Notification permission is asked at the first timer. Timers are
**time-sensitive** notifications, so they can break through a Focus: turn on the
Time Sensitive Notifications capability for the TrivetBox target (Signing &
Capabilities, + Capability), which adds the entitlement and the App ID setting.
Without it they are ordinary notifications and a Focus can silence them. A
person can still turn it off per app in Settings. While Trivet is
open the system banner is held back (`TimerNotificationDelegate`), because the
page rings itself. The handler name must match `TIMER_BRIDGE`. Needs a new build;
not yet tested on a device. To test: start a one-minute timer on a step, lock
the phone, and wait; the notification should arrive with the recipe's title.
Then start one, stop it, and check nothing arrives; start another with the app
open and check it rings once, not twice.

## Privacy manifests

Each target carries a `PrivacyInfo.xcprivacy` (the folders are synchronized
with the project, so a file placed in `TrivetBox/` or `TrivetShare/` belongs to
that target). Apple requires one wherever the code calls a "required reason"
API, and rejects uploads that call one undeclared.

- `TrivetBox/PrivacyInfo.xcprivacy`: no tracking, no required-reason APIs.
  The App Group folder (`containerURL`) is not one.
- `TrivetShare/PrivacyInfo.xcprivacy`: `UserDefaults`, reason `CA92.1`, for the
  share count `ShareViewController` keeps in the extension's own defaults.
  Reading or writing an App Group suite instead would need `1C8F.1`.

Adding a call to a file's timestamps, disk space, system boot time or the
active keyboards means declaring it here too. After an archive, the Organizer's
**Generate Privacy Report** shows what Apple will read. What the service
collects (name, email, recipes, photos, crash data) is declared in App Store
Connect's privacy labels, not in these files.

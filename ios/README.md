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
2. In Xcode, set the destination to "Any iOS Device", then Product → Archive.
3. In the Organizer window that opens, Distribute App → App Store Connect →
   Upload.
4. In App Store Connect → TestFlight, add the family as testers once the build
   has processed. Each build expires after 90 days; upload a fresh one before
   then.

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

## Share to Trivet

`TrivetShare` is a share extension: it puts **Trivet** in the iPhone share
sheet for web links and for text with a link in it (Phase 1 of
`SHARE-SHEET-PLAN.md`; photos and PDFs come next).

- The extension cannot see the app's sign-in and Apple does not let it open
  the app, so it leaves the link in the App Group folder
  (`group.com.trivetbox.app`, file `pending-share.json`) and says "Open
  Trivet". The app checks for it when it comes forward and after each page
  loads, opens `/upload?url=…`, and clears it once the upload page has loaded.
  On the sign-in pages it waits. A share older than a day is dropped.
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
should be reading that link.

## App icon

`TrivetBox/Assets.xcassets/AppIcon.appiconset/AppIcon.png`, drawn from
`ios/app-icon.svg`: the site's own mark (`src/app/icon.svg`) on a full-bleed
green square, since iOS rounds the corners itself. It must stay 1024 x 1024
with no transparency, or App Store Connect rejects the upload.

## Known gaps

- The planner's Print button does nothing in the app yet; it needs a small
  bridge from the page to iOS printing.
- Links in emails and texts (invites, password resets, shopping lists) open
  the website, not the app.

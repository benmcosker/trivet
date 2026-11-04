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

Raise the build number (target → General → Build) before each upload.

## Known gaps

- The planner's Print button does nothing in the app yet; it needs a small
  bridge from the page to iOS printing.
- Links in emails and texts (invites, password resets, shopping lists) open
  the website, not the app.

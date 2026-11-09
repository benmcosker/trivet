# Share to Trivet: plan

## Context

Adding a recipe today means opening Trivet, going to Add a recipe, and then
pasting a link or picking a file. On a phone that is the slow part: copy the
link in Safari, switch apps, find the field, paste. A share extension puts
**Trivet** in the iPhone share sheet, so the same thing is one tap from
wherever the recipe was found.

It also gives the iPhone app something the website cannot do, which matters
for App Store review (guideline 4.2, "more than a repackaged website").

The import itself already exists and does not change. The upload page takes a
shared link on arrival (`/upload?url=…`, read through `linkFromShare` in
`src/lib/social-links.ts`), and reads PDFs and photos. This plan is about
getting a shared item from another app to that page, signed in, with as few
taps as possible.

The offline shopping list (`OFFLINE-BROWSING-PLAN.md`) is parked behind this.
Phase 0 of it has shipped; Phase 1 picks up after this plan.

## What it accepts

| Shared from                                            | What arrives           | What Trivet does                                      |
| ------------------------------------------------------ | ---------------------- | ----------------------------------------------------- |
| Safari, Chrome, any recipe site                        | A web link             | The existing link import                              |
| Apps that share a sentence ("Look at this! https://…") | Text with a link in it | Takes the first link, as `linkFromShare` already does |
| Photos, or the screenshot preview                      | One image              | The existing photo import                             |
| Mail, Files                                            | One PDF                | The existing PDF import                               |
| TikTok, Instagram                                      | A link to the post     | Answered on the spot, see below                       |
| Anywhere, as copied text (a caption, a message)        | Text with no link      | A text import, see Captions as text                   |

One item per share. Several photos of one card (front and back) is a later
addition; the upload page handles one file at a time today.

### TikTok and Instagram

Neither will give a post's caption to another app or to a server; both answer
with a login wall (see the comment at the top of `social-links.ts`). Reading
them anyway means scraping with a logged-in browser, which both forbid, which
breaks whenever they change a page, and which puts the app's own accounts and
App Store listing at risk if either complains. Some recipe apps do it. Trivet
does not, in this version.

What works instead, and is faster with the share sheet than without it:
screenshot the caption, tap the screenshot preview, Share, **Trivet**. The
caption is read like a recipe card.

So a TikTok or Instagram link shared to Trivet is answered inside the share
sheet, without a trip to the server: "TikTok doesn't share captions with other
apps. Copy the caption, or take a screenshot of it, and share that to Trivet
instead." The extension recognises the same hosts as `socialSite()`; the two
lists must match, like `trivetHosts` and `WKAppBoundDomains` already do.

### Captions as text

The cheaper path, where a post allows it: **copy the caption** and give Trivet
the text. It is the person handing over words they can already see, like a
screenshot, so it stays inside both sites' rules, and it costs one model call
on a few hundred words, the same as a link import. Reading a video was
considered and set aside: far more expensive per import.

- **In the share sheet:** shared text with no link in it, or a social link
  with text around it, is treated as a recipe caption when it is long enough to
  be one (a few lines, with something that looks like an ingredient or a
  step). Short text with no link gets the "no link" answer.
- **On the upload page:** a **Paste a recipe** option beside the link field,
  for text copied anywhere: a caption, a message from a relative, a note.
- **On the server:** a text import route that calls `extractRecipeFromPage`
  with the pasted text and no page fetch. If a social link came with the text,
  it is kept as the source address, so the recipe credits the post.

How often a caption can be copied varies by app and by post, which is why
the screenshot route stays alongside it.

Logging in to Instagram or TikTok inside Trivet to read captions was also
considered and set aside: it needs those sites added to the app-bound domains
from Phase 0, App Store guideline 5.2.2 requires permission from the service
whose content an app collects, and people would have to give a recipe app
their Instagram login.

## How a shared item reaches the signed-in app

The share sheet runs a small separate program (the extension), not Trivet
itself. It cannot see the app's sign-in, because that lives in the app's web
view. Two ways to bridge that:

**A. Hand off to the app (this plan).** The extension saves the item where the
app can find it (a shared App Group folder), then the app picks it up and opens
the upload page with it, signed in as usual. No server changes for links, and
nothing new to secure.

**B. A server inbox.** The extension sends the item straight to Trivet's
server with a token of its own; the server reads it in the background and it
waits in an inbox for review. One tap, no app switch, but it needs a token
system, a new table, an endpoint and an inbox screen.

A is a fraction of the work and reuses everything. Its cost is one extra tap:
Apple does not let a share extension open its own app, so the sheet ends with
"Open Trivet to finish" and the person taps Trivet. (Some apps work around this
through an undocumented route that App Review can reject; not here.) If A gets
used a lot and the extra tap grates, B is the follow-up.

## Phase 1: links

**iOS.**

- A new **Share Extension** target, `TrivetShare`, added in Xcode (File → New
  → Target → Share Extension). Adding a target by hand to `project.xcproj` is
  error-prone; the Swift and the Info.plist keys come in the PR.
- An **App Group**, `group.com.trivetbox.app`, on both targets (Signing &
  Capabilities → App Groups). This is the shared folder.
- Activation rule in the extension's Info.plist: web links (max 1) and text.
  Images and files come in Phase 2.
- The extension's sheet, in Trivet's colours with the Trivet mark:
  - a link: "Ready for Trivet" with the site's name (`nytimes.com`), then
    **Open Trivet** guidance and **Done**;
  - a TikTok or Instagram link: the screenshot advice above, and **Done**;
  - text with no link in it: "There's no link in that. Share the page itself,
    or a screenshot." and **Done**.
- The item is written to the App Group as a small JSON file: kind, value,
  when. One pending item; a new share replaces it.
- The app, whenever it comes to the foreground (`scenePhase` becomes
  active), looks for a pending item. For a link it loads
  `https://trivetbox.com/upload?url=<encoded link>`. The item is cleared only
  once that page has loaded on `/upload`. If the person is signed out, the
  site sends them to sign-in, and the item is still waiting the next time the
  app comes forward after they have signed in.
- A pending item older than a day is dropped, so a share forgotten last week
  does not surprise anyone.

**Web.** Nothing, for links. `/upload?url=` already starts the import.

## Phase 2: photos and PDFs

**iOS.**

- The activation rule adds one image and one PDF.
- The extension copies the file into the App Group folder, with its name and
  type. Images over 8 MB and PDFs over 20 MB are refused in the sheet with the
  same limits the upload route enforces (`MAX_CARD_IMAGE_BYTES`,
  `MAX_PDF_BYTES`), so nobody waits for an app switch to be told no.
- The app loads `/upload?shared=file` and hands the file to the page through a
  script message handler: the page says it is ready, the app sends the bytes.

**Web.**

- `UploadWorkflow` gains one more way in: inside the app, on
  `?shared=file`, it posts `ready` to `window.webkit.messageHandlers.trivetShare`
  and turns what comes back into a `File`, then carries on exactly as if it had
  been picked. Outside the app the parameter is ignored.

## Design

One board for the share sheet's three states (link, social link, no link), and
the upload page's arrival state, which already exists for links and needs a
matching one for a shared file. Same handoff format as
`design_handoff_trivet_offline/`.

## Explicitly out of scope

- Reading TikTok or Instagram captions from a link (see above).
- Reading recipes out of videos.
- Saving without review. Every import still goes through the review step
  before it joins the library.
- Several photos in one share.
- Android. The web app manifest can declare a `share_target`, which gives the
  installed web app a place in Android's share sheet using the same
  `/upload?url=` route; it is a small, separate change.
- Option B, the server inbox.

## Testing

On a real phone, since the simulator's share sheet is limited:

1. Safari → a recipe page → Share → Trivet → Open Trivet: the import starts
   with that link.
2. The same while signed out: sign in, and the import starts afterwards.
3. Chrome, and an app that shares text with a link in it.
4. A TikTok link: the advice appears in the sheet; nothing is sent.
5. A copied caption shared as text, and the same text pasted on the upload
   page: both import, and a social link alongside is kept as the source.
6. Phase 2: a screenshot from the preview, a photo from Photos, a PDF from
   Mail. Each opens the upload page with the file already read.
7. A file over the limit: refused in the sheet.
8. Share something, don't open Trivet for a day: nothing happens when it is
   next opened.

## Effort

Phase 1 is small: the extension, the App Group and about forty lines in the
app. Captions as text add one server route, a paste field and the text case in
the extension; small, and testable on the web before any iOS work. Phase 2 adds the file handoff on both sides and is the larger half. Both
need a build in Xcode on a phone to test, as Phase 0 did.

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

| Shared from                                              | What arrives           | What Trivet does                                      |
| -------------------------------------------------------- | ---------------------- | ----------------------------------------------------- |
| Safari, Chrome, any recipe site                          | A web link             | The existing link import                              |
| Apps that share a sentence ("Look at this! https://…")   | Text with a link in it | Takes the first link, as `linkFromShare` already does |
| Photos, or the screenshot preview                        | Up to 6 images         | Text read on the phone, else the photo import         |
| Mail, Files                                              | One PDF                | The existing PDF import                               |
| TikTok, Instagram                                        | A link to the post     | Answered on the spot, see below                       |
| Anywhere, as copied text (a message, a note, a web page) | Text with no link      | A text import, see Pasted text                        |

One link, one PDF, or up to 6 images per share. Six is the upload route's own
limit for photos of one recipe (`MAX_PHOTOS`); a long caption usually takes
two screenshots, and a card front and back takes two.

### TikTok and Instagram

Neither will give a post's caption to another app or to a server; both answer
with a login wall (see the comment at the top of `social-links.ts`). Reading
them anyway means scraping with a logged-in browser, which both forbid, which
breaks whenever they change a page, and which puts the app's own accounts and
App Store listing at risk if either complains. Some recipe apps do it. Trivet
does not, in this version.

**Screenshots are the main path for social posts, not a fallback.** Neither
app lets you copy a caption: long-pressing one in Instagram or TikTok offers
no Copy (checked against 2026 how-to guides, November 2026). Every guide's
workaround starts with a screenshot and then copies the text out of it with
Live Text. Sharing the screenshot straight to Trivet skips that second step:
screenshot (expand "…more" first), tap the preview, Share, **Trivet**. A long
caption is two screenshots, shared together.

So a TikTok or Instagram link shared to Trivet is answered inside the share
sheet, without a trip to the server: "TikTok doesn't share captions with other
apps. Take a screenshot of the caption (two if it's long) and share that to
Trivet." The extension recognises the same hosts as `socialSite()`; the two
lists must match, like `trivetHosts` and `WKAppBoundDomains` already do.

Reading the recipe out of a saved video was considered and set aside: far more
expensive per import than a screenshot or text.

### Pasted text

Text copied anywhere a copy is possible: a web page, a message from a
relative, a note, a caption on Instagram's website (the one place a caption
can be selected). It is one model call on a few hundred words, the same cost
as a link import.

- **In the share sheet:** shared text with no link in it is treated as a
  recipe when it is long enough to be one (a few lines, with something that
  looks like an ingredient or a step). Short text with no link gets the "no
  link" answer.
- **On the upload page:** a **Paste a recipe** option beside the link field.
- **On the server:** a text import route that calls `extractRecipeFromPage`
  with the text and no page fetch. A link that came with the text is kept as
  the source address, so the recipe credits where it came from.

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

## Phase 1: links and pasted text

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

**Web.** Nothing, for links: `/upload?url=` already starts the import. Pasted
text is new: the **Paste a recipe** option and the text import route. It ships
on the web first and helps everyone, before any iOS work; the extension then
passes shared text to the same route through the handoff described in Phase 2.

## Phase 2: screenshots, photos and PDFs

**Reading text on the phone.** iOS can find the words in an image without
sending it anywhere: the Vision framework's text recognition, the engine behind
Live Text. The extension runs it on each shared image, in share order:

- **Text found** (enough lines, read with good confidence): the words go to the
  text import, joined in the order the screenshots were shared. A caption
  screenshot is all text, so this is the usual case for social posts. It is
  cheaper than an image import and nothing but the words leaves the phone.
- **Little or no text** (a photo of a handwritten card, a dish): the images go
  to the existing photo import (`extractRecipeFromImages`), which already reads
  up to 6 photos as one recipe.

A screenshot read this way does not become the recipe's photo; a caption is
not a picture of the dish. The review step shows what was read, as it does
for every import.

**iOS.**

- The activation rule adds images and PDFs, with no count: a rule capped at
  six would hide Trivet when seven are selected, without saying why, so the
  sheet refuses past six instead.
- Text read on the phone is written to the App Group as text. Images that go
  to the photo import, and PDFs, are copied in as files with their names and
  types. Images are made JPEGs of at most 2,000 pixels first, so none is too
  big; more than six images, a PDF over 20 MB (`MAX_PDF_BYTES`) and a PDF with
  photos are refused in the sheet, so nobody waits for an app switch to be
  told no.
- A recipe shared as text (Notes, Messages) is left as text when it has 120
  characters or more besides its link; shorter text is read for its link, as
  in Phase 1.
- The app loads `/upload?shared=1` and hands the item to the page through a
  script message handler: the page says it is ready, the app sends the text or
  the files.

**Web.**

- `UploadWorkflow` gains one more way in: inside the app, on `?shared=1`, it
  posts `ready` to `window.webkit.messageHandlers.trivetShare` and takes what
  comes back: text goes to the text import, files become `File`s and carry on
  exactly as if they had been picked. Outside the app the parameter is ignored.

## Design

Phase 2's states, and the decisions behind them, are in
`design_handoff_trivet_share/`: the sheet reading screenshots and showing
what it read, a photo, a PDF, the refusals, and the upload page arriving with
each.

## Explicitly out of scope

- Reading TikTok or Instagram captions from a link (see above).
- Reading recipes out of videos.
- Saving without review. Every import still goes through the review step
  before it joins the library.
- More than 6 images in one share.
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
5. Text copied from a web page, shared and pasted on the upload page: both
   import, and a link alongside is kept as the source.
6. Phase 2: two screenshots of a long TikTok caption, shared together: read
   on the phone, imported as one recipe from the text.
7. A photo of a handwritten card, a photo from Photos and a PDF from Mail:
   each goes to the file import and opens already read.
8. A file over the limit: refused in the sheet.
9. Share something, don't open Trivet for a day: nothing happens when it is
   next opened.

## Effort

Phase 1 is small: the extension, the App Group and about forty lines in the
app, plus the text import route and paste field on the web, which can ship and
be tested before any iOS work. Phase 2 adds reading text on the phone and the
handoff of text and files to the page, and is the larger half. Both need a
build in Xcode on a phone to test, as Phase 0 did.

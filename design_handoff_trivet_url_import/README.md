# Trivet — bringing a recipe in from a link

A handoff for `benmcosker/trivet`. Written rather than exported from Claude
Design, so there is no `.dc.html` beside it: the change is a page's structure
and its copy, and both are better said in words than drawn.

**This is an addition, not a redesign.** The review screen, `RecipeForm`,
`saveExtractedRecipeAction` and the library are untouched. What changes is that
`/upload` grows a second way in, and the page is restructured so the two ways
read as siblings.

---

## What was measured first

Six real recipe sites were fetched from a browser-equivalent client before any
of this was designed. The result is why the page looks the way it does below.

| site | fetch | `schema.org/Recipe` markup |
| --- | --- | --- |
| America's Test Kitchen | 200 | yes |
| PureWow | 200 | yes |
| Once Upon a Chef | 301 → 200 | yes |
| A Pinch of Joy | 200 | yes |
| Half Baked Harvest | 403 | - |
| Saveur | 403 | - |

Two of six refuse outright. Not paywalls: Cloudflare-style fingerprinting that
looks past the User-Agent at the TLS handshake, which a server cannot get
around. These are ordinary free recipe blogs, and one of them is among the most
followed recipe accounts there is.

So a third of attempts failing is the normal case, not an edge case, and the
design is shaped around making that failure useful rather than rare.

A third category exists and is the dangerous one. A site can answer 200 with
full ingredients and no method - the ingredients are what Google wants, the
method is what the subscription is for. A parse of that succeeds silently and
drops half the recipe.

## A wider measurement, 24 October

Twenty-one sites, reached from a residential connection with a browser User-Agent.
This one tests the door rather than the room: a 200 here says the site answers a
server, not that the recipe page carries markup. The six in the table above were
checked for both.

**Answering** - [NYT Cooking](https://cooking.nytimes.com),
[Bon Appetit](https://www.bonappetit.com), [Epicurious](https://www.epicurious.com),
[Smitten Kitchen](https://smittenkitchen.com),
[King Arthur Baking](https://www.kingarthurbaking.com),
[BBC Good Food](https://www.bbcgoodfood.com), [Delish](https://www.delish.com),
[Love and Lemons](https://www.loveandlemons.com),
[America's Test Kitchen](https://www.americastestkitchen.com),
[PureWow](https://www.purewow.com), [Once Upon a Chef](https://onceuponachef.com),
[A Pinch of Joy](https://www.apinchofjoy.com)

**Refusing with 403** - [Serious Eats](https://www.seriouseats.com),
[Simply Recipes](https://www.simplyrecipes.com),
[Allrecipes](https://www.allrecipes.com), [The Kitchn](https://www.thekitchn.com),
[Half Baked Harvest](https://www.halfbakedharvest.com),
[Budget Bytes](https://www.budgetbytes.com),
[The Woks of Life](https://thewoksoflife.com), [Saveur](https://www.saveur.com)

**Rate limited with 429** - [Food52](https://food52.com)

### The failures are not random, which matters

Every Dotdash Meredith property refused: Serious Eats, Simply Recipes,
Allrecipes, The Kitchn, four for four. Every Conde Nast title answered - Bon
Appetit, Epicurious - and so did Hearst's Delish. This is not about paywalls or
about how big a site is. It is a handful of corporate edge configurations, and
the independent blogs split along what looks like shared ad-network security
rather than three separate decisions: Half Baked Harvest, Budget Bytes and The
Woks of Life refuse, while Smitten Kitchen, Love and Lemons, Once Upon a Chef
and A Pinch of Joy do not.

That makes a known-bad list tractable. It is a few publishers rather than a long
tail discovered one disappointment at a time.

### Two corrections to the design above

**NYT Cooking answers, and answered with a usable recipe.** It was the paywall
example this was designed around and it is not one. The truncated-method case
the model pass exists to catch is still real - a site can serve ingredients for
Google and keep the method - but no site has yet been seen doing it. The pass
stays: it costs one call and it is the only thing standing between a teaser and
a saved half-recipe.

**A 429 is not a refusal.** Food52 is rate limiting, not refusing, and the
remedy is to wait rather than to print a PDF. It had fallen into `refused` and
was being told to open a browser, which is wrong advice for a site that would
have answered a minute later.

Now its own outcome, `busy`, with a note that ends where the others carry the
print-to-PDF tail - there is nothing to hand off to, because the site said yes,
later:

> **Try that one again in a minute**
>
> food52.com asked us to slow down. Nothing is wrong with the address - paste
> it again shortly and it should come through.

503 deliberately stays with the refusals. Cloudflare serves its challenge page
as a 503, so on this path it is overwhelmingly the bot wall talking rather than
an origin under load, and "try again in a minute" would be a promise nothing is
going to keep.

## The architecture this assumes

Every URL goes through the model. Parsed `schema.org/Recipe` markup is an
*input* to extraction rather than a bypass of it, handed to Claude against the
same schema the PDF and photograph paths use, and Claude sets the same
`confidence`.

That is what catches the truncated page: a teaser comes back `confidence: low`
exactly as a blurry card does, and lands in the review screen that already
knows how to say so. No heuristic for "does this look complete", because every
heuristic for that is wrong on some site nobody has tried yet.

---

## 1. The page

One card, two addressed halves, **link above file**. Not tabs, not a second
route, not a second nav item.

### Why one action rather than two

The test is the destination, not the input. Both end at the same review screen,
the same `RecipeForm`, the same save action, the same library. A link and a file
are two ways of handing over the same thing, and two actions would imply two
outcomes.

### Why the link goes on top

This is the load-bearing decision and it is not about which path is more
popular.

Two of six sites refuse, and the designed answer to a refusal is *print the page
yourself and bring that in*. If the file picker sits directly beneath the link
field, that instruction has its referent on the same screen - the sentence says
"below" and the control is already in view. Behind a tab, a route or a scroll,
the handoff becomes a navigation instruction, and a handoff that requires
navigation reads as a dead end however it is worded.

The fallback has to be visible from the thing that falls back to it.

### Layout

Drop the centred dropzone stack and the `UploadFileIcon`. Left-align both
halves. Each is addressed by an overline shelf label in `text.secondary`, the
same treatment `Collections` and `Search` carry: small uppercase Karla is
everything you can operate, and these are the two things you can operate here.
A `borderTop: 1, borderColor: "divider"` hairline separates them.

```
Card > CardContent
  A LINK                         <- overline, a real <label htmlFor>
  [ Paste the address of a recipe page          ]   InputBase, Karla
  ----------------------------------------------   hairline, field zone only
  [ READ THE PAGE ]              <- contained, size large
  (LinearProgress while busy, the width of this half)
  (PaperNote here when there is one - see 2)

  ----------------------------------------------   divider between halves

  A FILE
  A PDF, or a photograph of a printed or handwritten card. Up to 20 MB.
  [ SELECT A PDF OR PHOTO ]      <- contained, size large
  (LinearProgress while busy, the width of this half)
```

Two `contained` buttons in one card is deliberate. The theme's rule is that
*the* action is contained; each half has exactly one action and they are
siblings rather than a primary and a secondary. The hairline between them is
what makes each its own zone. An `outlined` button on one half would rank them,
and an outlined control beside a text field already reads as a third empty box -
which is exactly the geometry of the link half.

### The field, and where it departs from `RecipeSearchBar`

Borrow the idiom that made the search field legible: a real `<label htmlFor>` in
`overline`/`text.secondary` beside rather than above an `InputBase`, with a
hairline belonging to the field's own zone that stops where the field stops.

**But the text is Karla at `1rem`, not serif at `1.625rem`.** The theme's own
line is that prose is serif and data is not, and a pasted URL is the most
data-like string anybody will put into this app. There is a practical half: at
the search field's size a ninety-character URL shows about twenty-five
characters, and somebody who cannot see what they pasted cannot check it.
Placeholder in `text.secondary` and **not italic** - the italic placeholder is
the serif field's idiom, and carrying it over would say the two fields are the
same kind of thing.

Say this in the code comment. Otherwise the next reader sees two underlined
fields in different voices and reads it as drift.

Mechanics: `type="url"`, `inputMode="url"`, `autoComplete="off"`,
`spellCheck={false}`, Enter submits. Accept an address with no scheme - people
paste `smittenkitchen.com/...` constantly - and prepend `https://` silently
rather than making it an error.

Placeholder `Paste the address of a recipe page`, with the short form `Paste a
recipe address` if it would truncate at 360px. Say it in fewer words rather than
show half of it; never let it ellipsis.

### Page copy

The `h1` has to change - "Upload a recipe card" excludes half the page. Nav
labels and titles already diverge here (nav "Household", `h1` "Your household"),
so the nav item stays **Upload**.

- **`h1`: `Add a recipe`**

"Bring in a recipe" was the alternative and reads slightly precious in a title.
The objection to `Add a recipe` is that `/recipes/new` is titled "New recipe",
but those are different acts - one brings something in, the other types it out -
and the deck below distinguishes them immediately.

Deck, replacing the current one:

> A link to a recipe online, a PDF, or a photograph of a printed or handwritten
> card. Whichever you give it, it is read automatically, and you get a chance to
> correct anything before it joins the shared library.

---

## 2. When the site refuses

### Component

`PaperNote`, not `Alert`. `PaperNote` exists because a coloured fill, an icon
and a radius are three things this design has nowhere else, and spending all
three on a site's bot policy would make it the loudest object on the page -
the opposite of what this state is for. `tone="note"`, `live` so a screen
reader is told.

Placement: **inside the card, in the link half, directly below the field and
button.** Not above the card where the current error `Alert` goes, which would
put it above the thing it points down at. `PaperNote` draws its own top and
bottom hairlines, so when one is present **do not also render the divider
between the halves** - its bottom border becomes that divider, or two touching
rules read as one 2px line.

The label is a short plain sentence rather than a severity word.

### Copy - refused

**Label:** `This one needs your browser`

**Body**, with the hostname as an inline link:

> halfbakedharvest.com only answers a real browser, so there was nothing for
> Trivet to read. Open it yourself, print the page to a PDF - choose Print, then
> Save as PDF - and bring that in below. It reads just as well.

Four things that sentence is doing:

- It locates the cause in the site. Nobody did anything wrong and nothing is
  broken.
- It names the site by hostname, which is what we reliably have.
- "choose Print, then Save as PDF" is OS-neutral and is the whole procedure.
  A keyboard shortcut would be wrong on half the machines that see it.
- "below" is literally true because of the ordering in section 1. If that
  ordering ever changes, this word changes with it.

No apology, no "sorry", no "failed", no "unfortunately". The absence of an
apology is the reassurance; adding one would say something went wrong.

### Copy - timed out

Same label, same tail, first clause swapped:

> halfbakedharvest.com didn't answer in time. Open it yourself, print the page
> to a PDF - choose Print, then Save as PDF - and bring that in below. It reads
> just as well.

A timeout and a refusal have the same remedy, so they are one object with two
first clauses. Do not reuse the card path's "add the recipe by hand" here; it
sends people to the wrong door.

### Copy - nothing at that address

A 404 or a hostname that does not resolve. Different from the handoff because
the remedy is different: there is nothing to print.

**Label:** `That address didn't lead anywhere`

> Nothing is at halfbakedharvest.com/soup. Check the address, or paste it again
> from wherever you found it.

### Copy - not an address at all

Client-side, before any fetch, after the lenient scheme-prepend has had its go.
Inline `body2` under the field in `secondary.main`, not a `PaperNote` - a note
is the page telling you something, this is the field telling you about itself.

> That isn't a web address.

Worth the state only because a round trip and a model call for a typo is a rude
four seconds.

---

## 3. What the review screen shows

### Do not badge the path

The person is not told whether their recipe came from structured markup or from
a read of the page. The only thing that should change what they do next is how
much to check, and `confidence` carries that - set the same way on both paths
now. A second signal that changes no action is noise, and a "structured data"
badge on four sites and nothing on two would read as a quality mark nobody can
act on. Worse, it would make a `low` confidence on a marked-up page - exactly
the truncated-method case this architecture exists to catch - look like the app
contradicting itself.

It is a fact about the pipeline, not about the recipe.

### But do carry the provenance

`RecipeForm` already has `Source name` and `Source URL` fields, and the upload
path currently hardcodes `sourceUrl: null`. The URL path fills both: `sourceUrl`
from the normalised address, `sourceName` from the page's own name in the markup
where there is one, otherwise the bare hostname with `www.` stripped.

That is the whole of "tell them where it came from" - provenance as editable
data on the recipe, nothing in the chrome.

### A truncated page is a low-confidence recipe

It gets no screen of its own. The only way to know a method is thin is to read
it, and the review screen is where the method is.

**But the existing `low` copy is wrong for a URL.** "This may not be a recipe,
or it read badly" is about a blurry photograph of a shopping list. A URL is a
page the person chose, and the real state is that the ingredients came through
and the method did not - whose remedy is the handoff, not "check every field".

Branch the string on `source === "URL" && confidence === "low"`, nothing else:

> Only part of that page came through. Some sites show the full method to a
> browser and a teaser to everything else, so read the steps before saving - and
> if they are missing, discard this, print the page from halfbakedharvest.com
> yourself and upload the PDF.

The longest string in the flow, and it earns it: this is the one place somebody
can save half a recipe without noticing.

### Two more source-aware strings

The image fallback currently branches `PHOTO` / else-PDF. Add a URL branch:

> No photo came back from that page. You can add one after saving.

And the discard button:

- file, unchanged: `Discard and upload a different card`
- URL: `Discard and start again`

---

## 4. The wait

The app already has a settled position on this and it is in `UploadWorkflow.tsx`
with its reasoning: *without a counter there is no way to tell a slow extraction
from a wedged one, and people re-submit.*

Five parts, reused unchanged:

1. The action button becomes the status line, its label a present participle.
2. An elapsed-seconds counter appended after the first tick.
3. The button disabled while busy, still reading as the button it is.
4. An indeterminate `LinearProgress` beneath it.
5. A client timeout slightly beyond the server's ceiling, with copy of its own.

- Resting: `Read the page`
- Busy, first second: `Reading the page...`
- Busy, after: `Reading the page... 4s`

"Read the page" pairs with "Reading the page..." the way "Select a PDF or photo"
pairs with "Reading the card...", and it describes the act rather than promising
an outcome. Not "Fetch" - a developer's word for the one thing on this page that
is not a developer's business.

A fetch plus a model call is two seconds against one site and thirty against one
that is thinking about whether to answer. That variance is exactly what the
counter exists to make legible.

The `LinearProgress` spans **the link half's width, not the card's**, so it says
which half is working. While either half is busy, disable both buttons - one
model call at a time - and leave them visible and legible as disabled controls.

Rejected: a staged narration ("Fetching... Reading... Almost there"), because
the stages are not ones anybody can act on and this app has no precedent for
narrating its work. And a skeleton of the review screen, because nothing is
known about the recipe's shape yet and a skeleton would be inventing one.

---

## 5. What is new, reused and changed

**New**

- The link half, built inline in `UploadWorkflow` rather than extracted - about
  thirty lines with no second caller.
- Four strings: the two handoff bodies, the not-an-address line, the URL+low
  confidence body.

**Reused unchanged**

- `PaperNote` for the handoff states.
- `RecipeForm`, `RecipePhoto`, `saveExtractedRecipeAction`, `discardUploadAction`.
- The `busy` / `elapsed` / `LinearProgress` machinery, lifted to cover both
  inputs rather than duplicated per half.

**Changed**

- `src/app/upload/page.tsx` - `h1` and deck.
- `UploadWorkflow.tsx` - the card restructured into two halves; `UploadFileIcon`
  removed; `initial.sourceUrl` no longer hardcoded null; `source` widened to
  `"PDF" | "PHOTO" | "URL"`; three source-aware strings.
- `prisma/schema.prisma` - `RecipeSource` gains `URL`. An `ALTER TYPE ADD VALUE`
  with no table rewrite.

**The icon goes.** `UploadFileIcon` predates the reasoning that rejected a
magnifying glass on the search field twice over, and the moment the card holds
two ways in, an icon depicting a file mislabels it. Deleting it is the honest
fix rather than adding a chain-link beside it - which also settles the obvious
temptation before anybody acts on it.

---

## 6. Considered and rejected

- **Tabs or a File / Link toggle.** Hides one path behind a click for no gain,
  and the one `Tabs` in the app switches between genuinely different pages of
  content. Fatal objection: it puts the file picker behind a tab at the exact
  moment the handoff needs to point at it.
- **A separate `/upload/link` route or a second nav item.** Same fatal
  objection, plus a nav item for a sub-case of one action.
- **A chain-link or globe icon beside the field.** It answers "what is this
  for", which the label and placeholder answer in words. The question that
  actually goes unanswered is "can I type here", which the hairline answers.
- **A "read from structured data" badge.** Section 3.
- **Giving the truncated page its own screen.** Section 3.
- **An `error`-severity `Alert` for the refusal.** Red fill, an icon and a
  radius, spent on a site's bot policy, on the one state that specifically must
  not read as a failure.
- **Warning in the resting state that some sites refuse.** Two in six is a real
  rate and the honesty is tempting, but it makes the common case feel risky and
  spends the handoff's good manners before they are needed.
- **Auto-saving a high-confidence URL recipe without review.** Every path goes
  through the review screen. It is where provenance gets checked.
- **A "paste from clipboard" button.** Every platform's paste already works.
- **Dedupe on `sourceUrl`.** Decided against for now: a repeated URL makes a
  second recipe you can delete, where a repeated file would be the same bytes
  twice, which is why that one earned a hash. The title-collision note already
  fires on a second paste of the same post. Worth revisiting once there is
  usage showing whether it happens.

---

## 7. Left open

- **Converting the review screen's `Alert`s to `PaperNote`.** The confidence
  line is an `Alert` while the handoff is a `PaperNote`, and on the URL+low path
  they can appear within a scroll of each other. It should happen, but as its
  own change rather than inside this one.
- **A bookmarklet.** Those two 403s are bot walls rather than paywalls, so a
  real browser gets past them - and past a subscription wall too, because the
  session is already there. A `javascript:` bookmark that posts the page's
  markup to Trivet would turn the handoff from four steps into one, with no
  credential stored anywhere. If it is built, the handoff copy in section 2
  changes and nothing else does.
- **The dark scheme is unexamined.** Everything here uses existing tokens, so it
  inherits whatever the dark scheme is rather than introducing anything new.
  That is not the same as having been designed.

# Trivet — offline shopping list

A handoff for `benmcosker/trivet`, following the pagination pass. It designs
the states `OFFLINE-BROWSING-PLAN.md` names but does not draw, for the first
slice that plan settles on: **the shopping list, on its own**.

The requirement: **in a shop with no signal, the list is still there, and
nothing on the page pretends to have done something it has not.**

---

## 1. The decisions

Settled with Ben on 4 November.

1. **Got it and Always have stay on the saved copy, greyed out.** The rows keep
   their shape, and the controls are visibly there but resting. This is the
   inert-control device from pagination's Prev and Next, used again.
2. **The saved copy opens scrolled to the shopping list,** not at the top of
   This week. In a shop the seven day tiles are a long scroll past what you
   came for.
3. **Tapping an item crosses it off on this phone only.** Nothing is sent. When
   signal comes back, the household chooses what happens to those items
   (state 5). This goes beyond the plan, which had no offline writes of any
   kind. It is still not an offline write: Trivet stores nothing until someone
   presses a button with signal.

### Considered and not chosen

**Hide the actions offline.** Cleaner, but every row changes width and the page
no longer looks like the list you know.

**Queue Got it offline and send it later.** That is the offline write the plan
ruled out. "Got it" inserts a `WeeklySkip` row rather than ticking a flag, and
sending it silently later could overwrite a change somebody made at home in
the meantime.

---

## 2. The states

All drawn at 390 × 844, the light scheme only. Dark is as unexamined here as it
is across the app.

### The band

One device for every offline message: a full-width band under the nav on
`background.raised`, with hairlines above and below.

| Part | Spec |
| --- | --- |
| Icon | 18px stroke Wi-Fi glyph, struck through when offline; `text.primary`, `primary.main` when back in range |
| Label | Karla 700, 11px, `0.14em`, uppercase, `text.primary` |
| Sentence | Newsreader italic 300, 15px, `text.muted` |
| Actions | Karla 700, 11px, `0.15em`, uppercase; the first in `primary.main` with a 1px underline, the second `text.secondary` |
| Padding | 12px 20px |

It is a `role="status"` region, not a toast. Nothing in Trivet pops up, and a
message in a shop needs to stay put.

### 1 · Saved copy

`NO SIGNAL · SAVED TUESDAY, 6:04PM` — *Your list as it was then. Tap an item to
cross it off on this phone.*

The time is the moment the copy was saved, written the way the planner writes
days. Got it and Always have render at `text.disabled` with `disabled`.

A crossed-off row strikes through the amount and the name in
`text.secondary`, and replaces the recipe line with *Crossed off on this
phone*. The name and recipe lines are one button with `aria-pressed`, so a
second tap uncrosses it.

### 2 · An action that failed

The page was live and signal dropped mid-shop. Got it on lemon failed, so lemon
stays, and a line appears under it in Newsreader italic, 15px,
`secondary.main` (5.9:1 on paper):

*No signal, so lemon is still on the list. Tap Got it again once you're back
in range.*

The message sits on the row that failed, not in a band, because it is about one
item. The buttons return to normal at once, so trying again needs nothing new.

### 3 · Nothing saved yet

Offline with no copy on this phone. The band reads `NO SIGNAL · NOTHING SAVED
YET` with no sentence, and the page explains under the This week heading:

*Nothing saved on this phone yet.* Trivet keeps a copy of your shopping list
each time you open This week with signal. Open it once when you're back in
range, and it'll be here next time.

Then **Try again**, as a text link in the style of Suggest dinners.

### 4 · First launch, iPhone app

Native SwiftUI, before the website has ever loaded. Paper ground, the mark at
56px with its clay hub, *No connection yet* in Newsreader 40px over an ink
rule, one sentence, and a full-width contained ink button, **Try again**, 48px
tall with square corners.

### 5 · Back in range

Shown once, on the first live load after items were crossed off offline:

`BACK IN RANGE` — *You crossed off two things while you were out.* **Mark them
got it** · **Leave the list**

The crossed rows stay struck through until one of the two is pressed. Mark them
got it runs the existing Got it for each one. Leave the list clears the marks
and changes nothing on the household's list.

---

## 3. The mechanism

| Question | Answer | Why |
| --- | --- | --- |
| Where crossings live | IndexedDB, beside the saved list, keyed by household, week start and ingredient name | The saved copy is already there, and both are cleared on sign-out |
| Which week | The saved list's own `weekStartIso` | A crossing from last week's list must never reach this week's |
| Counting in state 5 | Only items still on the live list | Somebody at home may have ticked one already. Those drop silently, and if none are left, no band appears |
| Mark them got it | `skipForWeekAction` per item, as one press of Got it would | No new server action |
| Detecting offline | The failed fetch, never `navigator.onLine` | The plan's rule, unchanged |

---

## 4. Not in this handoff

- Recipes and cook mode offline. The plan puts them after the list.
- Dark scheme.
- Any implementation. The plan still needs a line for local crossings (§1.3)
  before a build starts.

## Open question

Greyed-out Got it (`text.disabled`, #847a69) is only one step lighter than the
live one (`text.secondary`, #746c5c), and side by side in screens 1 and 5 they
are hard to tell apart. The band's sentence carries the meaning today. Worth a
look before building: a lighter inert colour, or no change if the band is
enough.

---

## Files

- `01 Saved copy.dc.html` … `05 Back in range.dc.html` — one per state
- `support.js` — runtime; keep it beside the HTML
- `screens/01-saved-copy.png` … `05-back-in-range.png` — each state at 390 × 844

The HTML opens directly in a browser. The canvas these came from:
[Trivet offline states](https://claude.ai/artifact/UnwZ2iif3KJZay2B91zaF3)
(private).

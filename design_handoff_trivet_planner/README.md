# Trivet — week planner

A handoff for `benmcosker/trivet`, following the mark and contrast pass.

**This is an identity application, not a redesign.** The seven-column grid, the
slot model, the dialogs and every interaction stay as they are. What changes is
what the grid is made of: the day tiles lose their `Card` chrome and become type
on paper, and the shopping list below them stops being MUI components.

Two things are genuinely new: a print view, and a fix for the `text.disabled`
finding the last pass deferred.

---

## 1. The week grid

Still `Grid` at `{ xs: 6, sm: 4, md: 3, lg: 12/7 }`. Still one `CardActionArea`
per day opening the picker. The changes are all inside the tile.

### Remove

- The `<Card>` and `<CardContent>`. A day is a flex column on the page — the
  separation is the 20px gutter, as it is in the recipe grid.
- `borderRadius: 1.5` on the `CardActionArea` and `borderRadius: 1` on the
  empty-day box. Square, per the theme's `shape.borderRadius: 0`.
- The dashed border on an empty day. A dashed rectangle is the most visually
  noisy thing on a page made of hairlines, and on a Sunday night there are six
  of them.
- The two `IconButton`s in the tile header — `MenuBookIcon` and `CloseIcon`.
  Fourteen icon buttons across a week is the densest chrome in the app. They
  become text on hover; see §4.

### Day header

```
Mon                                      21
────────────────────────────────────────────  ← 1px divider
```

- Day name: Karla 700, 11px, `0.14em`, uppercase, `text.primary`. The existing
  two-span `xs`/`sm` swap for "Mon"/"Monday" stays exactly as written — it
  solves a real problem and the comment explains why.
- Date: Newsreader 15px, `text.secondary`. Right-aligned, `whiteSpace: nowrap`
  as now.
- Rule: 1px `divider`, 6px below the baseline.

### Today

The rule under the date goes **2px `secondary.main`**, and the date itself goes
`secondary.main`. Same device as the active nav item in the top bar, which is
the only other place in the app that marks "you are here".

Nothing else about today's cell changes — no tint, no weight change. The app
already knows what today is from the URL; this is a reminder, not a selection.

### A planned day

```
photo                     126px tall, full width of the cell
Dish Title                Newsreader 400, 18px, -0.01em, two-line clamp
SERVES 4 · 1 HR 30        Karla 600, 10.5px, 0.12em, uppercase, text.secondary
  ┆ and Focaccia          indented 14px on a 1px left rule
  ┆ with Chopped Salad    italic 300 for sides, roman for dinners
────────────────────────  1px divider
+ DINNER    + SIDE        Karla 600, 10.5px, uppercase, text.secondary
```

Photo height is 126px at every breakpoint, up from the current 96px, because
the tile no longer spends 24px on card padding. Use `RecipePhoto` with
`rounded={0}`.

A two-part title splits roman/italic on " with " — the same `splitTitle` helper
`RecipeHero` uses. It is the one piece of typographic personality a cell this
small can carry.

### Sides and second dinners

Indented 14px on a 1px left rule, under the dinner they belong to.

`SIDE_SLOTS` belongs to the evening and not to a particular dinner, so this
cannot nest in the data — the rule is a visual grouping only, and the left rule
rather than a tree line is deliberate for that reason. Dinners read roman
("and Focaccia"), sides italic 300 ("with Chopped Salad"), which is the same
roman/italic split the dish titles use.

Keep `ExtraDinners`, `SideRow` and `AddMore` as components; only their styling
changes. `AddMore`'s logic — one empty dinner slot offered at a time, side only
while the evening has none — is right and its comment says why.

### An empty day

```
┌────────────────────────┐
│    Nothing planned.    │   Newsreader italic 300, 17px, text.secondary
│    PICK A RECIPE       │   Karla 700, 10.5px, primary.main, 1px underline
└────────────────────────┘   1px solid divider, 126px tall
```

**This resolves the `text.disabled` finding at `WeekPlanner.tsx:468.`** The old
"Add a meal" was 3.85:1 at 12px. The new copy is `text.secondary` (4.73) and
`primary.main` (5.46), and the `AddIcon` is gone — the words say it.

Same height as a photo, so a half-planned week keeps one baseline instead of
stepping up and down.

---

## 2. Page header

```
THE MCMULLENS · 21–27 SEPTEMBER          THIS WEEK  NEXT WEEK      PRINT
This week
─────────────────────────────────────────────────────────────────────────
Five dinners planned, two evenings open.                  CLEAR THE WEEK
```

- Eyebrow: `overline`, `secondary.main`. The household name and the date range,
  which is what "Week of 2026-09-21" was trying to say.
- Title: `h1`. "This week" — the nav label, so the page confirms where you are.
- **Week nav is two labels, not arrows.** `This week` / `Next week`, the active
  one carrying the 2px clay underline. Deep history is a URL, not a control:
  `?week=` still accepts any Monday, and `prevWeekIso` stays in the props for
  a "previous week" link when you want one.
- Summary line: Newsreader italic 300, 24px, `text.secondary`. Counts the week
  in words, which is the one thing a seven-column grid cannot say at a glance.

---

## 3. Shopping list

Currently a `<Card>` wrapping everything, with `Alert`s, `Button`s and a
`variant="overline"` per section. It becomes a page section like any other.

### Header

`h2` at 44px, with an eyebrow counting the sources: "FROM FIVE DINNERS AND
THREE SIDES". The provider buttons sit on the baseline beside it — the cart
provider `contained color="ink"`, the rest `outlined`, which is already what
the theme gives them.

### Alerts become paper notes

```
A NOTE ON AMAZON                    ← overline, secondary.main
Amazon has no public ordering API, so this cannot fill a
basket for you. Each ingredient opens a search in the store;
add what you want.                  ← Newsreader 18px, text.soft
────────────────────────────────────  hairline above and below
```

Replaces `<Alert severity="info">`. Same for the success and error cases from
`ShoppingHandoffPanel` and `textResult`: an overline naming the thing, the
message in serif, hairlines top and bottom. No coloured fill, no icon, no
radius. Error keeps `secondary.main` on the overline; success uses
`primary.main`.

This is the one place the spec touches a shared component —
`ShoppingHandoffPanel.tsx` — because the alerts are most of what it renders.

### Items, in three columns

```
PRODUCE
──────────────────────────────  1px text.primary
2 heads   Romaine lettuce       amount: Karla 700, 13px, min-width 62px
          Chopped Salad         source: Karla 11px, text.secondary
──────────────────────────────  1px divider between rows
```

Sections lay out in a 3-column grid at `md` and up, one column below. Keep
`groupBySection` and the `data-ingredient` attribute exactly as they are — the
tests walk it.

The amount is a fixed-width column so quantities align down the list, which is
what makes it scannable in a shop. The row actions ("Got it", "Always have",
"Remove") keep their current hover-reveal behaviour and its `xs` always-visible
fallback; they just render as text links rather than `Button`s.

### Add-an-extra and the pantry note

The `AddExtraItem` field becomes the same underlined serif treatment as the
recipe search: no box, a hairline, Newsreader italic 300 placeholder —
"Foil, paper towels, whatever else…". Note that its placeholder needs
`text.secondary`, not `text.disabled`, at 21px.

`ExcludedIngredients` becomes one line: "LEFT OFF — olive oil, salt, black
pepper, flour, butter — always in the pantry". It is a footnote and currently
gets a section.

---

## 4. Removing the icon buttons

The two `IconButton`s per planned day become text, revealed on hover of the
cell and always visible below `md`:

- `Open` → the recipe page
- `Remove` → clears `FIRST_DINNER`

Karla 600, 10.5px, uppercase, `text.secondary`, in the row with `+ Dinner`.
Same pattern the grocery rows already use for `.row-actions`, including the
touch fallback.

**The nesting constraint has not gone away.** The tile is a `CardActionArea`,
and an anchor or button inside a button is invalid markup that swallows the
click — which is why these live in the header today. They still cannot be
inside it. Put them in the footer row, a sibling of the action area, not a
child. The existing comment in the file explains the trap; keep it.

---

## 5. Print

New. Two pages, one sheet each, black on white.

`@media print`: drop `background.default` to white and all text to `#000`. The
paper ground prints as a full page of beige ink, which is both slow and ugly.

Serif throughout, as on screen — a shopping list is read at arm's length and
Newsreader at 17px is more legible in that condition than Karla at the same
size.

### Page 1 — the list

- Heading "Shopping list", 30px, over a 1.5px rule
- Sub-line: date range, dinner and side counts, Karla 11px uppercase
- One block per aisle section, using `groupBySection` — the same order as
  screen, which is `grocery-sections.ts`'s store order
- Each row: a **12px empty square** to tick, the amount in Karla 700 13px, the
  name in Newsreader 17px
- No source line. In the shop you do not care which recipe wanted the lemons.
- Footer: "Not listed: olive oil, salt, black pepper, flour, butter."

### Page 2 — the week

- Heading "This week", same treatment
- Seven rows, day label in Karla uppercase at a fixed 80px, dishes in Newsreader
- Sides and second dinners on their own lines under the dinner, italic for sides
- **An unplanned day prints as an em dash**, not omitted — otherwise a five-day
  week looks like the whole week
- No tick boxes, no photos, no mark

`page-break-after` on page 1. If only one page is wanted, the list is the one
that matters.

---

## 6. Claude Code brief

1. **Day header and today marker.** Day name, date, hairline; 2px
   `secondary.main` rule and clay date for today. Keep the `xs`/`sm` day-name
   spans.
2. **Strip the tile chrome.** Remove `Card`, `CardContent`, both
   `borderRadius`es and the dashed empty-day border. Photo to 126px,
   `rounded={0}`.
3. **Empty day.** "Nothing planned." / "Pick a recipe" per §1. This closes the
   `text.disabled` finding.
4. **Dish title, meta, sides.** `splitTitle` for the roman/italic split; sides
   and second dinners indented on a left rule.

**→ Stop here for review.** Steps 1–4 are the whole grid. Look at a full week,
a half-empty week and a phone.

5. **Page header.** Eyebrow, `h1`, two-label week nav, summary line.
6. **Icon buttons to text.** §4 — and mind the nesting constraint.
7. **Shopping list.** Header, three-column sections, amount column, text row
   actions.
8. **Alerts to paper notes.** In `WeekPlanner.tsx` and
   `ShoppingHandoffPanel.tsx`.
9. **`AddExtraItem` and `ExcludedIngredients`.** Underlined serif field; the
   pantry note to one line.
10. **Print stylesheet.** §5, both pages.

Not in scope: the slot model, the dialogs, `buildShoppingList`, the provider
logic, `grocery-sections.ts` ordering, or anything in `src/lib`.

---

## Carried over from the last pass

`RecipeSearchBar.tsx:113` sets the placeholder to `text.disabled` (3.85:1).
That clears the 3:1 large-text threshold at `md`, where the field is 26px — but
`fontSize` is `{ xs: "1.25rem", md: "1.625rem" }`, so at `xs` it is 20px,
under the 24px threshold and not bold. The compact string "In the mood for?"
needs 4.5 and does not have it. Not fixed here; you said you would follow up.

---

## Files

- `Trivet week planner.dc.html` — the design this README describes
- `support.js` — runtime; keep it beside the HTML
- `screens/`
  - `01-planner-full.png` — the whole design, 1440px
  - `02-week-grid.png` — the seven days, including today and two empty
  - `03-shopping-list.png` — list, paper notes, extras, pantry footnote
  - `04-print-pages.png` — both print pages

The HTML opens directly in a browser.

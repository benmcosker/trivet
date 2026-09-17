# Trivet — recipe pagination

A handoff for `benmcosker/trivet`, following the mark pass, the week planner
and the cooking view.

This one starts with a bug. `searchRecipeIds` defaults to `limit: 50` and
`RecipesPage` passes none, so the library is already truncated at 50 and
nothing says so — while the eyebrow directly above the grid counts the whole
box from `countRecipes`. A household with 60 recipes is told it has 60 and
shown 50.

So the requirement the design has to meet: **the page must never show fewer
dishes than it claims without saying so.**

---

## 1. The decision

Numbered pages of 24, held in `?page=`.

A recipe box is a thing you flip through, not a feed you fall down. Seven pages
tells you the size of what you are browsing, which an endlessly extending column
deliberately hides — and "it was about halfway down page three" becomes a real
memory rather than a scroll position lost on reload.

### Considered and not chosen

**Show more, appending.** The closest runner-up, and the right answer if the
library were a feed. Rejected because the state it creates cannot be linked:
send someone "the fourth one down after I hit show more twice" and they get
page one. It also grows the DOM without bound, and the grid is photographs.

**Infinite scroll.** Wrong for a library you own. It suits material you have
not seen and will not look for again; a recipe box is a fixed set of things you
are trying to find one of. It would also put the footer's policy links
permanently out of reach, and `SiteFooter`'s comment says those are there for a
compliance reason.

**Raise the limit to 200 and move on.** Honest about the scale of a private
beta, and it fixes the truncation in one line — worth saying out loud. Rejected
as a destination rather than a stopgap: 200 hydrated recipes with ingredients,
tags and review aggregates is a heavy page, and the cap only moves the same
silent cliff further out.

---

## 2. The control

At the foot of the grid, above the footer.

```
──────────────────────────────────────────────────────────────  1px ink
← PREVIOUS          1  2  3  4  …  7          NEXT →
                       ▔▔
                 Dishes 25–48 of 163
```

| Part | Spec |
| --- | --- |
| Rule above | 1px `text.primary`, 22px above the row |
| Prev / Next | Karla 700, 12px, `0.15em`, uppercase, `text.soft` |
| Numbers | Karla 600, 14px, `0.06em`, `text.secondary` |
| Current | Karla 700, `text.primary`, 2px `secondary.main` underline, 4px below |
| Ellipsis | `text.disabled` — decoration, not a control |
| Range line | Newsreader italic 300, 20px, `text.secondary`, centred, 18px below |
| Gaps | 26px between numbers; row is `space-between` |

MUI's `Pagination` is a row of circular buttons, which is eight radiused
objects on a page that has none. These are text on paper, and the current page
carries the same 2px clay underline as the active nav item and today in the
planner — third use of one device.

**Prev and Next never disappear.** At the ends they render as inert text at
`text.disabled`, so the row does not change width when you reach page 1 or 7.
WCAG 1.4.3 exempts inactive controls, so 3.85:1 is fine there and only there.

### The range line

The sentence that makes the eyebrow's count honest: 163 dishes in the box,
these 24 on the page. It is also the only element here that changes when a
filter is applied:

- Browsing — "Dishes 1–24 of 163"
- Filtered — "Dishes 1–24 of 31 tagged "Weeknight""
- A–Z — "Dishes 25–48 of 163, Bread Salad to Chicken Paprikash"

### States

| State | Control |
| --- | --- |
| Page 1, browsing | Hero + 23 in the grid. Prev inert. |
| Last page | Next inert. A short final row is normal — do not pad it. |
| Filtered, 2 pages | Two numbers, no ellipsis. |
| A–Z | Numbers carry their letter ranges: `A–B`, `B–C`, `C–F`… at 13px |
| One page total | **Nothing.** No rule, no range line, no control. |
| Out of range | Last page, plus a paper note. See below. |

A single page of results has nothing to say about itself, so it says nothing.

### Out of range

A stale link, or a page that existed before someone deleted four recipes.
Serve the **last page** with a `PaperNote` above the grid:

> **THAT PAGE IS GONE**
> The box has seven pages now. This is the last one.

Not a 404 — the recipes exist and the visitor did nothing wrong. Not a redirect
— that rewrites history and breaks the back button. `?page=0` and `?page=-4`
clamp to 1 silently, having no story to tell.

### Mobile

Seven numbers at a 44px touch target do not fit 393px. Below `sm` the window
collapses to two full-width targets with "Page 2 of 7" between them. The range
line stays.

---

## 3. The mechanism

**Offset, not a cursor.** `RecipeSearchOptions` already declares `limit` and
`offset`, and `searchRecipeIds` already applies them — so most of this is
wiring rather than new SQL.

Offset works identically across all four sort orders, including `rating`, whose
ordering is three columns deep with nulls last. It gives a total, which is what
makes "page 3 of 7" and the range line possible at all. Deep offsets are slow
on large tables; a shared recipe box is not a large table.

A keyset cursor on `rating` would need a composite of average, review count and
`createdAt`, and one on search results would need `ts_rank` — a float nobody
should be putting in a URL. It also cannot count, so it could only ever offer
"more", never "of 163".

| Concern | Rule | Reasoning |
| --- | --- | --- |
| URL | `?page=3` | One-indexed, alongside `q`, `tag`, `sort`. Omitted on page 1 so the canonical URL stays `/recipes`. Parsed like `parseSort`: anything unrecognised falls back rather than throwing, because it arrives from a URL where a typo is ordinary. |
| Page size | 24 | Divides by 1, 2 and 3, so no breakpoint ends on a widowed card: 24 rows at `xs`, 12 at `sm`, 8 at `md`. About three screens at desktop — enough to be worth paginating, short enough to reach the control. |
| The hero | Counts as one | Page 1 while browsing is hero + 23 grid cards, not hero + 24, or page 1 holds 25 dishes and every range after it is off by one. The existing `browsing` flag already means the hero never appears on a searched, filtered or re-sorted page, so pages 2+ are a plain 24. |
| The total | `countSearchRecipes` | New. `countRecipes` counts the whole box and is right for the eyebrow; the range line needs the count of *this* search, under the same visibility rule and the same query and tag filters. |
| Out of range | Clamp, and say so | §2. |
| Scroll position | Top of the grid | A page change lands at the first card — not at the control that caused it, and not at the top of the header; the search field and collections row do not need re-reading. Server-rendered navigation does this for free. Do not add scroll handling. |
| Photos | `priority` on page 1 only | The hero's photo is the only eager one, and the hero only exists on page 1. On pages 2+ the first row is above the fold and should take `priority` instead — three cards, not the twenty-four below them. |

---

## 4. Claude Code brief

Step 3 contains the bug fix and can ship on its own.

1. **`src/lib/recipes.ts`** — add `countSearchRecipes(options)` beside
   `countRecipes`: the search's `WHERE` clause, no ordering, no rating join.
   Extract the visibility, query and tag predicates into shared values so the
   search and the count cannot drift apart. A count that disagrees with the
   grid is worse than no count.

2. **`src/lib/recipe-page.ts`** — new. Sibling of `recipe-sort.ts`, for the
   reason that file already states: the control is a client component and must
   not import a module that touches Prisma. Exports `PAGE_SIZE = 24`,
   `parsePage(value)`, and `pageWindow(current, total)` returning the numbers
   and ellipsis positions, so the window logic is testable without a DOM.

3. **`src/app/recipes/page.tsx`** — read `page` from `searchParams`; add
   `countSearchRecipes` to the existing `Promise.all`; pass `limit` and
   `offset` to `searchRecipes`. **The absent argument is the bug.** Page 1
   while `browsing` takes 24 and spends one on the hero; clamp an over-range
   page to the last and set a flag for the note.

4. **`src/components/RecipePagination.tsx`** — new. The control from §2. Links,
   not buttons: every page is a URL, so middle-click and open-in-new-tab work.
   Preserve `q`, `tag`, `sort`; omit `page` from the page-1 href.
   `aria-current="page"` on the current number, as the nav and the week tabs
   already do.

5. **`src/components/RecipeGridCard.tsx`** — accept a `priority` prop and pass
   it to `RecipePhoto`; the page sets it on the first three cards when there is
   no hero. `RecipePhoto`'s comment says everything below the fold stays lazy —
   on page 2 the first row is not below the fold.

6. **`src/components/RecipeSearchBar.tsx`, `RecipeFilters.tsx`** — every
   control that changes what is being searched must drop `page` from the URL it
   builds. Landing on page 4 of a new two-page search is the classic bug in
   this pattern, and these two are the only places it can happen.

Not in scope: the search SQL itself, the sort options, `recipe-visibility.ts`,
or the collections row.

---

## Also true

The same silent ceiling applies to `plan/page.tsx`, which calls
`recipe.findMany` to fill the planner's picker from the same shared library. It
needs a different fix — a picker wants a search field, not pages — but it is
the same cliff, and past the cap a dish you own becomes unplannable. Worth
taking next.

---

## Files

- `Trivet recipe pagination.dc.html` — the design this README describes
- `support.js` — runtime; keep it beside the HTML
- `screens/`
  - `01-pagination-full.png` — the whole sheet, 1440px
  - `02-control-in-place.png` — the control under a grid
  - `03-states.png` — all six states at working width
  - `04-mechanism.png` — offset vs keyset, and the rules table
  - `05-alternatives.png` — the three rejected patterns

The HTML opens directly in a browser.

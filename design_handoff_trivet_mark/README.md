# Trivet — mark, app icon and contrast corrections

A handoff for `benmcosker/trivet`. The identity pass (warm paper, hairlines,
square corners, Newsreader/Karla) already shipped; this covers the three things
it left as placeholders — the mark, the app icon, and the dark scheme — plus
three contrast failures found while specifying them.

Nothing here changes the layout of any page.

---

## 1. The mark

A ring standing on three legs, holding a clay dish at its centre.

The placeholder was a clay dot in a green circle, and its own comment said the
logo was a design job of its own. The first attempt at that job put three
spokes *inside* the ring, which is a three-pointed star in a circle — an
existing mark belonging to a car company. The fix is not a different weight or
rotation: it is moving the three outside the ring, where it stops being a star
and becomes what a trivet actually is. Nothing converges at the centre now,
because the centre is occupied by the thing the trivet is holding.

### Geometry

Drawn on a 100×100 grid, centre 50,50.

| Part  | Spec |
| --- | --- |
| Ring  | `r=30`, stroke 8, no fill |
| Legs  | three, at 90° / 210° / 330°, running radially from `r=30` to `r=45`, round caps |
| Hub   | `r=10`, filled, no stroke |

The legs are the only round-capped element in the identity, which is otherwise
square-cornered throughout. That is deliberate: a butt-capped leg reads as a
cut-off line, and feet are the one place in the system where a soft end is
describing a physical object rather than styling a box.

### Colour

Green ring and legs, clay hub, in that order. The two never swap — a green hub
in a clay ring is a different mark, and it looks like a mistake. On a green
tile the hub lightens (see §3); everywhere else it is `secondary.main`.

### Rules

- **Clear space** — half the ring's diameter on every side, measured from the
  leg tips, not the ring. Nothing crosses it.
- **Minimum size** — 16px. The geometry never simplifies. Strokes thicken and
  the legs shorten slightly; two legs is a different object.
- **Never** rotate it, outline the hub, hollow the hub, recolour the hub green,
  add a fourth leg, or set it over a photograph.

### Stroke weight by rendered size

| Size | Stroke | Legs run to | Hub |
| --- | --- | --- | --- |
| 44px and up | 8 | `r=45` | 10 |
| 32–43px | 9 | `r=44` | 10.5 |
| 20–31px | 10 | `r=45` | 11 |
| 16–19px | 13 | `r=43` | 13 |

Optical compensation, not arithmetic. A constant stroke ratio goes spindly
below about 24px because the ring's curve eats the line before the renderer
does.

---

## 2. Lockups

Wordmark is Newsreader 400, set plainly. One word has nothing to split, so
there is no roman/italic device as there was in "Meal *Magic*".

| Lockup | Mark | Gap | Wordmark | Used for |
| --- | --- | --- | --- | --- |
| Horizontal | 26px, stroke 10 | 11px | 23px / `-0.015em` | Top bar |
| Stacked | 46px, stroke 8 | 15px vertical | 30px / `-0.02em` | Sign-in, invites, email |
| Mark alone | ≥16px | — | — | Favicon, avatar, loading |
| Monochrome ink | any | 11px | matches | Print, one-colour, docs |

In the horizontal lockup the **ring** centres on the wordmark's x-height band —
not the leg tips, and not the cap line. Aligning the full mark bounding box
sits the wordmark visibly low.

The mark is 26px where the placeholder circle was 24px, because the legs need
the room. The top bar's own measurements — padding, gaps, `PAGE_PADDING_X` —
do not change.

In the monochrome version the hub stays **solid**. Hollowing it turns the mark
into a doughnut on three legs.

---

## 3. App icon

Three variants, because three contexts.

### `src/app/icon.svg` — green tile, paper mark

A browser picks its own tab-strip colour, so the favicon carries its own tile
and survives a dark one. Mark inset to `r=28` so the legs clear the rounded
corners.

The hub is **`#efb08b`**, not `secondary.main`. Clay on green is 1.2:1 — the
hub vanishes at 16px, and the mark becomes a plain ring on legs. `#efb08b` is
3.2:1 against the green and reads at every size. This is the one place the clay
is lightened, and it is a legibility fix, not a second brand colour.

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" role="img" aria-label="Trivet">
  <!--
    A ring on three legs, holding a dish.

    A filled tile rather than a bare glyph: a favicon sits on a tab strip whose
    colour the browser chooses, and an unbacked mark vanishes against a dark
    one. The tile carries its own background, so it survives both.

    The hub is a lighter clay than `secondary.main`. #a44a24 on this green is
    1.2:1 and disappears below about 24px; this holds at 3.2:1 and keeps the
    mark from reading as an empty ring in a tab.

    Geometry matches the 24px top-bar lockup, inset to r=9 of 16 so the legs
    clear the corner radius.
  -->
  <rect width="32" height="32" rx="7" fill="#2f6f4e"/>
  <g fill="none" stroke="#f7f4ed" stroke-width="3.2" stroke-linecap="round">
    <circle cx="16" cy="16" r="9"/>
    <path d="M16 25v4.2M8.2 11.5 4.5 9.4M23.8 11.5 27.5 9.4"/>
  </g>
  <circle cx="16" cy="16" r="3.5" fill="#efb08b"/>
</svg>
```

### `src/app/apple-icon.png` — paper tile, green mark

1024×1024, flat, **no corner radius baked in** — iOS applies its own mask, and
a pre-rounded icon gets rounded twice.

- Tile `#f7f4ed`, full bleed
- Mark `#2f6f4e`, hub `#a44a24` (the real clay; it has contrast against paper)
- Mark occupies the centre 62% of the canvas

Paper reads as an app on a home screen. A green tile at that size reads as a
folder.

### Transparent, ink mark — docs and print

No tile, `currentColor` on every stroke and the hub fill, legs running to
`r=45`. Without a tile the legs can reach the edge of the box, so the mark
reads larger at the same dimensions. Use in this README, the Claude Code
brief, and printed pages.

---

## 4. Top bar

The mark replaces the two nested `<Box>` circles in `TopBar.tsx`. It is no
longer two circles, so it can't stay CSS — it arrives as an inline SVG. It
still inherits the palette, via `currentColor`.

```tsx
/**
 * The mark: a ring on three legs, holding a dish.
 *
 * Inline rather than an <img> to `icon.svg`, for the same reason the
 * placeholder was two CSS circles: it inherits the palette, so the dark
 * scheme needs no second asset. `currentColor` carries the ring and legs;
 * the hub is explicit because it is the one part that does not follow the
 * text colour.
 *
 * Round caps on the legs are the only soft ends in the identity. They
 * describe feet; everything else here is square by rule.
 */
function TrivetMark({ size = 26 }: { size?: number }) {
  return (
    <Box
      component="svg"
      viewBox="0 0 100 100"
      aria-hidden
      sx={{
        width: size,
        height: size,
        flexShrink: 0,
        fill: "none",
        color: "primary.main",
      }}
    >
      <circle cx="50" cy="50" r="30" stroke="currentColor" strokeWidth="10" />
      <path
        d="M50 80V95 M24 35 11 27.5 M76 35 89 27.5"
        stroke="currentColor"
        strokeWidth="10"
        strokeLinecap="round"
      />
      <Box component="circle" cx="50" cy="50" r="11" sx={{ fill: "secondary.main" }} />
    </Box>
  );
}
```

Then, in the wordmark link, replace the nested-circle block with
`<TrivetMark />` and leave the `gap: "10px"` at **11px**.

`aria-label="Trivet, home"` stays on the link; the SVG is `aria-hidden`.

---

## 5. Contrast corrections

Three tokens in the shipped light scheme fail WCAG AA at the sizes they are
used. All three carry small uppercase Karla — 11 and 12px — which is the least
forgiving text in the app, so none of them qualify for the 3:1 large-text
allowance.

| Token | Was | Ratio | Now | Ratio | Where it shows |
| --- | --- | --- | --- | --- | --- |
| `text.secondary` | `#8a8272` | **3.47** ✗ | `#746c5c` | 4.73 ✓ | Inactive nav, "Newest first", Collections eyebrow, Sign out |
| `text.disabled` | `#a19684` | **2.65** ✗ | `#847a69` | 3.85 | Card tag lines, collection counts |
| `secondary.main` | `#b4552d` | **4.47** ✗ | `#a44a24` | 5.34 ✓ | Clay eyebrow, link hover, active nav rule, oven temps |

All ratios against `background.default` `#f7f4ed`.

`text.disabled` stays below 4.5 on purpose — it is the only token in the set
that is not for reading. The correction that matters is the second half of that
row: **every readable use moves up to `text.secondary`**. Concretely, the
uppercase tag line in `RecipeGridCard.tsx` and the counts in
`CollectionsRow.tsx` are content, not decoration, and should read
`text.secondary`.

`secondary.main` missing by 0.03 is worse than missing widely: it looks
deliberate, and it is the colour on the one line of every page that is supposed
to catch the eye.

For reference, what already passes and needs no change: `text.primary` 16.1,
`text.soft` 13.4, `text.muted` 8.66, `text.mutedLight` 4.90, `primary.main`
5.46. Dividers are non-text and exempt.

---

## 6. Dark scheme

The shipped dark palette was, by its own comment, undesigned — the new tokens
mapped to something plausible so nothing rendered undefined.

This is the light scheme **inverted**, not a neutral charcoal. The browns are
what make the light scheme feel like paper rather than like a white page, and
a true-grey dark mode loses that and reads like a different product. Every
value below is warm: the darks carry a brown cast, the lights carry a cream
one.

| Token | Light | Dark | Ratio (dark) |
| --- | --- | --- | --- |
| `primary.main` | `#2f6f4e` | `#5fae86` | 7.07 |
| `secondary.main` | `#a44a24` | `#e08f63` | 7.42 |
| `ink.main` | `#1a1815` | `#e9e3d6` | — |
| `ink.contrastText` | `#f7f4ed` | `#14110d` | — |
| `background.default` | `#f7f4ed` | `#14110d` | — |
| `background.paper` | `#f7f4ed` | `#14110d` | — |
| `background.raised` | `#efe9dc` | `#1f1a13` | — |
| `background.stripeA` | `#e8e0d0` | `#1b1710` | — |
| `background.stripeB` | `#e1d8c5` | `#221d15` | — |
| `text.primary` | `#1a1815` | `#f4efe4` | 16.4 |
| `text.soft` | `#2c2820` | `#e9e3d6` | 14.7 |
| `text.muted` | `#4a453c` | `#cfc7b6` | 10.4 |
| `text.mutedLight` | `#6f6a5e` | `#b3aa99` | 8.05 |
| `text.secondary` | `#746c5c` | `#a09788` | 6.52 |
| `text.disabled` | `#847a69` | `#857c6d` | 4.31 |
| `divider` | `#ded7c8` | `#2e2820` | — |
| `dividerDashed` | `#cfc6b2` | `#403830` | — |

`background.paper` stays equal to `default` in both schemes, for the reason
already in the file: nothing in this design is a raised surface, and a card
that quietly paints itself a different colour is the one thing on the page
breaking the paper.

`primary` is a lighter green than the previous `#7fc4a0` and `secondary` a
deeper clay than `#e08a5f` — both moved so the pair sits at a similar weight
against the darker ground. On `#14110d` the old values were 9.8 and 8.6, which
is brighter than the light scheme's 5.5 and 5.3 and made the accents glow.

---

## 7. Claude Code brief

Ordered, with a stopping point. Each step is independently revertible.

1. **`src/theme/theme.ts` — light corrections.** Three values in
   `colorSchemes.light.palette`: `secondary.main` → `#a44a24`,
   `text.secondary` → `#746c5c`, `text.disabled` → `#847a69`. Nothing else in
   the light scheme moves.

2. **`src/theme/theme.ts` — dark scheme.** Replace the whole
   `colorSchemes.dark.palette` block with §6. Update the file's opening comment:
   dark is no longer "due a pass of its own".

3. **`src/app/icon.svg`.** Replace with §3, comment included.

4. **`src/components/TopBar.tsx`.** Add the `TrivetMark` component from §4
   above the `TopBar` export; replace the two nested `<Box>` circles inside the
   wordmark link with `<TrivetMark />`; change the wordmark link's `gap` from
   `"10px"` to `"11px"`. Delete the placeholder comment about two circles.

**→ Stop here for review.** Steps 1–4 are the whole visible change: run the app
in both schemes and look at the top bar, the recipes list and one recipe.

5. **`src/components/RecipeGridCard.tsx`.** The uppercase tag line moves from
   `text.disabled` to `text.secondary`. It is content.

6. **`src/components/CollectionsRow.tsx`.** The count beside each collection
   name moves from `text.disabled` to `text.secondary`.

7. **`src/app/apple-icon.png`.** Regenerate at 1024×1024 per §3. Flat, no
   radius, paper tile.

Not in scope, and deliberately: no page layout changes, no component
restructuring, no new dependency. The week planner is next and is specified
separately.

---

## Files

- `Trivet brand sheet.dc.html` — the visual sheet this README describes
- `Trivet mark options.dc.html` — the three candidates, for the record
- `support.js` — runtime for the two HTML files; keep it beside them
- `screens/` — PNGs, for anyone reading this on a phone or in a diff:
  - `01-brand-sheet.png` — the whole sheet, 1440px wide
  - `02-mark.png` — geometry, construction grid, stroke weights
  - `03-lockups.png` — the four lockups with measurements
  - `04-app-icon.png` — the three icon variants at 96, 32 and 16px
  - `05-top-bar.png` — the bar in both schemes
  - `06-contrast.png` — the three corrections, before and after
  - `07-tokens.png` — the full token table

Both HTML files open directly in a browser.

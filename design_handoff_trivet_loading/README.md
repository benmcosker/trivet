# Trivet — loading

A handoff for `benmcosker/trivet`. It replaces the white screen between tapping
Trivet's icon and the first page appearing, and the pause with nothing new on
screen while a page loads on the website.

The requirement: **from the icon to the page, something calm and Trivet's own
is always on screen, and it never pretends to know more than it does.**

---

## 1. The decisions

Settled with Ben on 11 November.

1. **Simmer.** While Trivet opens, the clay centre of the mark slowly pulses:
   scale 1 → 0.72, opacity 1 → 0.55 and back, 1.6 s a cycle. In keeping with
   the rest of Trivet, it is the only thing that moves.
2. **Eight seconds** before the opening screen says the connection is slow and
   offers Try again.
3. **Outlines on the main pages:** Recipes, This week, Pantry and a recipe.

### Considered and not chosen

**Trace** (the ring draws itself round) and **steam** (three wisps rise above
the mark) are both on board 2, under Tweaks. Both were livelier than Trivet
is anywhere else.

**A shimmering skeleton,** the light sweeping across placeholders that most
apps use. It's busier than a page that otherwise never moves; the outline
breathes instead.

---

## 2. The states

All drawn at 390 × 844.

### 1 · Launch screen

iOS draws this from the moment the icon is tapped, before any of Trivet's code
runs. Apple allows a colour and one image here, nothing else: the paper colour
(`#f7f4ed`, dark `#14110d`) with the mark, 72 pt, in the centre of the whole
screen. Assets `LaunchBackground` and `LaunchMark`, light and dark.

### 2 · Opening Trivet

The app's first screen, until the first page finishes loading. The mark is in
exactly the place the launch screen put it, so nothing jumps: the launch screen
appears to come alive. After 1.2 s, *Opening your kitchen* fades in 18 pt
below the mark, Newsreader italic 300, 17 pt, `text.muted`. When the first page
has loaded, it fades in over this in 0.3 s.

With Reduce Motion on, the mark stays still.

### 3 · Still opening

After 8 s: *Still opening. The connection is slow.* and a Try again button
(Karla 700, 12 pt, `0.15em`, uppercase, a 1 pt rule, 44 pt tall), which
reloads and starts the clock again. No connection at all is still the existing
no-connection screen.

### 4 · Between pages

On the website, and so in the app: each main page shows its outline while its
data loads (Next.js `loading.tsx`). The page's heading where it never changes
(*Recipes*, *Pantry*), then quiet shapes where the content will be: tiles in
the same stripes as a recipe with no photo, `background.stripeB` bars, hairline
rules. They breathe (opacity 1 → 0.55, 1.8 s) rather than shimmer, and stand
still under `prefers-reduced-motion`. `src/components/PageOutline.tsx`.

## Files

`01`–`04` are the Claude Design artboards (`.dc.html`, opened with
`support.js` beside them), in the order above.

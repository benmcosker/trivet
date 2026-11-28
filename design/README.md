# Design tokens

`tokens.json` restates Trivet's eight core colours, light and dark, in the format
of the [design system generator](https://github.com/benmcosker/design-system-generator).
`npm run check:design` hands it to that tool's `check`, which fails when a colour
pair drops below WCAG AA (body and muted text on the background, the primary
colour as a control boundary and a focus ring, and the label colours on primary,
danger, success and warning). CI runs it on every pull request.

**`src/theme/theme.ts` is still the source of truth.** The spec only copies from
it, and `test/design-tokens.test.ts` fails when the two disagree, so change the
theme first and then the spec.

## What the generator does not check

The generator checks a fixed set of pairs. `test/theme-contrast.test.ts` covers
the rest that Trivet uses, straight off the theme, at 4.5 in both modes: text
and muted on the raised surface and the stripes, `soft`, `mutedLight` and
`secondary` text on the page, the clay accent as text, and the timer dock's
"done" bar (page colour on clay).

**Found by review, 28 November 2026:** `text.secondary` (text buttons) on the
raised surface measured 4.29 in the timer dock's "+1 min", and `mutedLight`
4.45 beside it. Both greys were darkened (`secondary` #746c5c to #625b4d,
`mutedLight` #6f6a5e to #686355) and the pairs are now tested. `disabled` text is
exempt from WCAG and left alone.

- **The pairs are hand-picked, not derived from usage.** A new colour-on-ground
  combination is not covered until someone adds it to the test.
- **MUI's own defaults are unmeasured**, such as the dock's close icon
  (`action.active`).
- **Dark mode passes numerically** and has not been looked at; the gate does not
  change that.
- **Danger, success and warning** are Material UI's defaults, because Trivet does
  not set its own. If it ever does, update the spec, and the test will say so.
- **Contrast is not the whole of accessibility:** it does not check touch-target
  sizes, motion or screen-reader behaviour.

## Running it

```
npm run check:design
```

It downloads the pinned version of the generator through npx. To update the
version, change it in the `check:design` script and run the check again.

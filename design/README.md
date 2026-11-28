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

## What it does not check

- **Trivet's other tones:** the faint and disabled text greys (`mutedLight`,
  `secondary`, `disabled`), the dividers, the stripes, and the clay accent
  (`secondary`) against the forest green. The generator checks a fixed set of
  pairs; these are the designer's call.
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

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { theme } from "@/theme/theme";

/**
 * `design/tokens.json` is the spec `npm run check:design` hands to the design
 * system generator, which fails the build when a colour pair drops below WCAG
 * AA. It restates eight colours that really live in `src/theme/theme.ts`, so
 * this keeps the two from drifting: a spec that checked last month's palette
 * would pass while the app shipped this month's.
 */

type Colours = Record<string, string>;
type Spec = {
  colors: Colours;
  modes: { dark: { colors: Colours } };
};

type Palette = {
  primary: { main: string };
  background: { default: string; raised: string };
  text: { primary: string; muted: string };
  error: { main: string };
  success: { main: string };
  warning: { main: string };
};

const spec = JSON.parse(readFileSync("design/tokens.json", "utf8")) as Spec;
// MUI's `Theme` type leaves `colorSchemes` out (it is added when CSS variables
// are on), so the shape the test reads is spelled out.
const schemes = (
  theme as unknown as {
    colorSchemes: Record<"light" | "dark", { palette: Palette }>;
  }
).colorSchemes;

/** The spec's eight colours, as the theme says them. */
function fromTheme(p: Palette): Colours {
  return {
    primary: p.primary.main,
    background: p.background.default,
    surface: p.background.raised,
    text: p.text.primary,
    textMuted: p.text.muted,
    // Trivet does not set these; they are Material UI's own, so the spec
    // follows whatever the theme resolves to.
    danger: p.error.main,
    success: p.success.main,
    warning: p.warning.main,
  };
}

const lower = (colours: Colours): Colours =>
  Object.fromEntries(
    Object.entries(colours).map(([k, v]) => [k, v.toLowerCase()]),
  );

describe("design/tokens.json", () => {
  it("matches the light palette in the theme", () => {
    expect(lower(spec.colors)).toEqual(lower(fromTheme(schemes.light.palette)));
  });

  it("matches the dark palette in the theme", () => {
    expect(lower(spec.modes.dark.colors)).toEqual(
      lower(fromTheme(schemes.dark.palette)),
    );
  });

  it("is made of six-digit hex colours", () => {
    const all = [
      ...Object.values(spec.colors),
      ...Object.values(spec.modes.dark.colors),
    ];
    for (const colour of all) expect(colour).toMatch(/^#[0-9a-fA-F]{6}$/);
  });
});

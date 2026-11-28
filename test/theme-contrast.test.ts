import { describe, expect, it } from "vitest";

import { theme } from "@/theme/theme";

/**
 * The pairs the design system generator's `check` does not look at (see
 * `design/README.md`): the quieter text greys, text on the raised surface and
 * the stripes, the clay accent as text and as a ground, and the timer dock's
 * "done" bar. Read straight off the theme, so a palette change is measured
 * rather than remembered.
 */

type P = {
  primary: { main: string };
  secondary: { main: string };
  background: {
    default: string;
    raised: string;
    stripeA: string;
    stripeB: string;
  };
  text: {
    primary: string;
    soft: string;
    muted: string;
    mutedLight: string;
    secondary: string;
    disabled: string;
  };
  divider: string;
};

const schemes = (
  theme as unknown as {
    colorSchemes: Record<"light" | "dark", { palette: P }>;
  }
).colorSchemes;

function channel(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return (
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255)
  );
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

type Pair = [label: string, fg: (p: P) => string, bg: (p: P) => string];

/** Text that has to be read: 4.5. */
const text: Pair[] = [
  ["text on raised", (p) => p.text.primary, (p) => p.background.raised],
  ["muted on raised", (p) => p.text.muted, (p) => p.background.raised],
  ["soft on background", (p) => p.text.soft, (p) => p.background.default],
  [
    "mutedLight on background",
    (p) => p.text.mutedLight,
    (p) => p.background.default,
  ],
  [
    "secondary text on background",
    (p) => p.text.secondary,
    (p) => p.background.default,
  ],
  [
    "mutedLight on raised",
    (p) => p.text.mutedLight,
    (p) => p.background.raised,
  ],
  // Text buttons are text.secondary, and the timer dock's "+1 min" sits on raised.
  [
    "secondary text on raised",
    (p) => p.text.secondary,
    (p) => p.background.raised,
  ],
  [
    "secondary text on stripeB",
    (p) => p.text.secondary,
    (p) => p.background.stripeB,
  ],
  ["clay on raised", (p) => p.secondary.main, (p) => p.background.raised],
  ["primary on raised", (p) => p.primary.main, (p) => p.background.raised],
  ["text on stripeA", (p) => p.text.primary, (p) => p.background.stripeA],
  ["text on stripeB", (p) => p.text.primary, (p) => p.background.stripeB],
  ["muted on stripeB", (p) => p.text.muted, (p) => p.background.stripeB],
  ["clay as text", (p) => p.secondary.main, (p) => p.background.default],
  // CookingTimers: the finished bar is background.default on secondary.main.
  ["timer done bar", (p) => p.background.default, (p) => p.secondary.main],
];

describe("contrast the generator does not check", () => {
  for (const mode of ["light", "dark"] as const) {
    const p = schemes[mode].palette;
    for (const [label, fg, bg] of text) {
      it(`${mode}: ${label} reaches 4.5`, () => {
        expect(contrast(fg(p), bg(p))).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});

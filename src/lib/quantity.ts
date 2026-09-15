/**
 * Reading the quantities people actually write on the Qty field.
 *
 * The column stays a number, and has to: the shopping list scales quantities
 * by how many servings were planned, and merges the same ingredient across
 * several dinners into one line. Store "1/2" as text and doubling a recipe
 * stops doubling its shopping, and Monday's 2 lb of chicken stops adding to
 * Thursday's 1 lb.
 *
 * So the text is parsed rather than the storage loosened. `Number("1/2")` is
 * NaN, which is what made a perfectly ordinary half-cup fail validation with a
 * message about types.
 */

export type QuantityParse =
  { ok: true; value: number | null } | { ok: false; reason: string };

/** The vulgar fractions a keyboard or a PDF can produce. */
const GLYPH_FRACTIONS: Record<string, string> = {
  "½": "1/2",
  "⅓": "1/3",
  "⅔": "2/3",
  "¼": "1/4",
  "¾": "3/4",
  "⅕": "1/5",
  "⅖": "2/5",
  "⅗": "3/5",
  "⅘": "4/5",
  "⅙": "1/6",
  "⅚": "5/6",
  "⅐": "1/7",
  "⅛": "1/8",
  "⅜": "3/8",
  "⅝": "5/8",
  "⅞": "7/8",
  "⅑": "1/9",
  "⅒": "1/10",
};

/**
 * The fractions worth writing back out.
 *
 * Liberal in what is read, conservative in what is shown: a PDF can contain
 * any vulgar fraction and all of them are parsed, but nobody measures a
 * seventh of a cup. Without this, 1.2 comes back as "1 1/5", which is
 * arithmetically perfect and not how anybody cooks.
 */
const COOKING_FRACTIONS = [
  "1/2",
  "1/3",
  "2/3",
  "1/4",
  "3/4",
  "1/8",
  "3/8",
  "5/8",
  "7/8",
];

const HELP = "Try 2, 2.5, 1/2, 1 1/2 or 2-3 — or leave it blank.";

/**
 * Read a typed quantity, or say why it cannot be read.
 *
 * Blank is a valid answer, not a failure: "salt to taste" has no number, and
 * the column is nullable for exactly that.
 */
export function parseQuantity(input: string): QuantityParse {
  const text = normalise(input);
  if (!text) return { ok: true, value: null };

  const value = readNumber(text);
  if (value == null)
    return { ok: false, reason: `That is not a quantity. ${HELP}` };
  if (!Number.isFinite(value)) {
    return { ok: false, reason: `That quantity cannot be divided. ${HELP}` };
  }
  if (value <= 0)
    return { ok: false, reason: "Quantity must be more than zero." };
  if (value > 100_000)
    return { ok: false, reason: "That quantity is too large." };

  return { ok: true, value };
}

/** Glyph fractions expanded, "to" made a dash, spacing regularised. */
function normalise(input: string): string {
  let text = input.trim().toLowerCase();
  for (const [glyph, ascii] of Object.entries(GLYPH_FRACTIONS)) {
    // "1½" is written without a space and means one and a half.
    text = text.replace(glyph, ` ${ascii}`);
  }
  return text
    .replace(/\s+to\s+/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function readNumber(text: string): number | null {
  // A range: buy the top of it. Coming home with two when the recipe wanted
  // three costs a second trip, and the reverse costs a spare clove of garlic.
  //
  // "1-1/2" is not a range though - it is how a lot of cards write one and a
  // half - so a dash followed by a fraction is a mixed number instead.
  const range = /^(.+?)\s*-\s*(.+)$/.exec(text);
  if (range) {
    const [, low, high] = range;
    if (high.includes("/")) {
      const whole = simple(low);
      const fraction = simple(high);
      if (whole != null && fraction != null) return whole + fraction;
    }
    const top = simple(high);
    if (top != null && simple(low) != null) return top;
    return null;
  }

  // "1 1/2": a whole number and a fraction, written apart.
  const mixed = /^(\d+)\s+(\d+\/\d+)$/.exec(text);
  if (mixed) {
    const whole = simple(mixed[1]);
    const fraction = simple(mixed[2]);
    if (whole != null && fraction != null) return whole + fraction;
    return null;
  }

  return simple(text);
}

/** A plain number or a single fraction. Nothing else. */
function simple(text: string): number | null {
  const trimmed = text.trim();

  const fraction = /^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/.exec(trimmed);
  if (fraction) {
    const denominator = Number(fraction[2]);
    if (denominator === 0) return Infinity;
    return Number(fraction[1]) / denominator;
  }

  if (!/^\d*\.?\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isNaN(value) ? null : value;
}

/**
 * A stored number back into something worth putting in a text field.
 *
 * Halves, thirds and quarters go back to the fractions they were typed as;
 * anything else is shown as a decimal, trimmed of trailing zeros. Round-trips
 * so that opening a recipe to edit it does not quietly rewrite "1/2" as "0.5".
 */
export function formatQuantity(value: number | null): string {
  if (value == null) return "";

  const whole = Math.floor(value);
  const remainder = value - whole;

  for (const ascii of COOKING_FRACTIONS) {
    const [numerator, denominator] = ascii.split("/").map(Number);
    if (Math.abs(remainder - numerator / denominator) < 1e-9) {
      return whole === 0 ? ascii : `${whole} ${ascii}`;
    }
  }

  return String(Number(value.toFixed(4)));
}

/**
 * An ingredient's amount as one readable phrase: "2 cups", "1/2", "a pinch".
 *
 * Lives here rather than in the page that shows it because two pages show it
 * now - the recipe and the cooking view - and the rule they have to agree on
 * is not obvious. No rounding, because `formatQuantity` has already decided
 * how the number reads, and a half that survived storage as "1/2" should not
 * become "0.5" on the way to the screen. A quantity with no unit is just the
 * number; a unit with no quantity is just the unit, which is how "a pinch"
 * and "to taste" get written.
 */
export function formatAmount(
  quantity: number | null,
  unit: string | null,
): string {
  if (quantity == null) return unit ?? "";
  const amount = formatQuantity(quantity);
  return unit ? `${amount} ${unit}` : amount;
}

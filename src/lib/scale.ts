/**
 * Cooking a dish for more people than it was written for.
 *
 * The arithmetic is a ratio and always has been - `grocery.ts` has been
 * scaling the shopping list by planned-servings over recipe-servings since it
 * was written. What was missing was anywhere to say the number, and one place
 * that agrees on what the number is allowed to be.
 *
 * ## Up only
 *
 * A recipe can be cooked for more people than it says and not for fewer. That
 * is a product decision rather than a limit of the maths: halving is where
 * scaling stops being multiplication - a third of an egg, a quarter of a tin -
 * and a recipe that quietly suggests it is worse than one that does not offer.
 * So every choice starts at what the recipe already makes.
 *
 * ## Eight
 *
 * Eight is where the offer stops, because past it the assumptions break
 * faster than the numbers: pans, oven space and browning do not scale, and a
 * tray of eight portions' worth of vegetables steams rather than roasts. A
 * recipe that already serves more than eight keeps its own number as the
 * floor - the cap is a ceiling on the offer, never a reason to scale a dish
 * down to meet it.
 */

/** Where the offer stops. See the note above on why it is eight. */
export const MAX_SERVINGS = 8;

/**
 * What the recipe itself makes, as a number that can be divided by.
 *
 * A recipe claiming zero servings would divide by zero, and the column is an
 * Int with no positive constraint on it, so this is not theoretical. One is
 * the honest fallback: a dish that does not say how many it feeds feeds the
 * amount written down.
 */
function ownServings(recipeServings: number): number {
  if (!Number.isFinite(recipeServings) || recipeServings < 1) return 1;
  return Math.trunc(recipeServings);
}

/**
 * The serving counts this recipe can be cooked for, smallest first.
 *
 * Always at least one entry - its own - so a caller can render the list
 * without a special case. A single entry means there is nothing to choose
 * between, which is a recipe that already serves eight or more, and the UI
 * should show its number rather than a control.
 */
export function servingChoices(recipeServings: number): number[] {
  const from = ownServings(recipeServings);
  const to = Math.max(MAX_SERVINGS, from);

  const choices: number[] = [];
  for (let n = from; n <= to; n += 1) choices.push(n);
  return choices;
}

/**
 * A requested serving count, brought inside what this recipe will offer.
 *
 * Used on both sides of the wire on purpose. The control cannot offer a
 * number this rejects, but the number also arrives in a form post and in a
 * URL, and neither of those is a promise - without this, `?serves=5000` is a
 * shopping list for five thousand people.
 *
 * Nonsense - a missing value, a word, an infinity - falls back to what the
 * recipe makes rather than being rejected, because the failure case here is a
 * page that renders the recipe as written, which is exactly what somebody who
 * typed nothing wanted.
 */
export function clampServings(target: number, recipeServings: number): number {
  const from = ownServings(recipeServings);
  const to = Math.max(MAX_SERVINGS, from);

  if (!Number.isFinite(target)) return from;
  return Math.min(Math.max(Math.trunc(target), from), to);
}

/**
 * How much of the recipe to make: 1 as written, 2 for twice as many.
 *
 * Deliberately not clamped. The cap belongs where a person types a number,
 * not in the arithmetic - the shopping list multiplies by whatever was
 * actually planned and stored, and a factor that silently disagreed with the
 * stored plan would buy for six while the page said eight.
 */
export function scaleFactor(target: number, recipeServings: number): number {
  if (!Number.isFinite(target) || target <= 0) return 1;
  return target / ownServings(recipeServings);
}

/**
 * One ingredient's amount at that factor, rounded to something cookable.
 *
 * An amount of `null` stays null: "salt, to taste" is an instruction rather
 * than a quantity, and doubling it means nothing.
 */
export function scaleQuantity(
  quantity: number | null,
  factor: number,
): number | null {
  if (quantity == null) return null;
  return roundForCooking(quantity * factor);
}

/**
 * A scaled number, moved to the nearest amount somebody could measure.
 *
 * Exact arithmetic is not the goal and never was. Scaling a third of a cup by
 * 1.25 gives 0.41666..., which is arithmetically perfect and cannot be
 * measured by anybody; a cook wants three eighths and a cup that reads in
 * eighths. So the result is snapped to the nearest eighth or the nearest
 * third, whichever it is closer to - the two families `formatQuantity` knows
 * how to write back out as fractions.
 *
 * Both families, not just eighths, because thirds are how a great many
 * recipes are written and 2/3 is a real measuring spoon. Snapping 0.6667 to
 * 5/8 would be both wrong and unwritable.
 *
 * Two edges are handled by not snapping at all:
 *
 * - **Under an eighth.** The nearest eighth of 0.06 is either an eighth or
 *   nothing, and both are wrong by about half of it. A quarter teaspoon of
 *   saffron stays a decimal rather than doubling or vanishing.
 * - **Ten and over.** "12 3/8 cups" is a precision nobody asked for and
 *   nobody will measure. Past ten the snap is to the nearest half.
 *
 * This is display rounding for one recipe, and it is not what the shopping
 * list does. That adds the same ingredient across several dinners, and
 * rounding each contribution to an eighth before summing would walk the total
 * away from the truth a dinner at a time - so `grocery.ts` keeps its own
 * two-decimal rounding for the arithmetic and rounds nothing until the end.
 */
export function roundForCooking(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;

  if (value < 1 / 8) {
    const twoPlaces = Math.round(value * 100) / 100;
    // Never round a real amount away to nothing: two decimals turns a
    // thousandth of a teaspoon into zero, and an ingredient listed as "0"
    // reads as a mistake in the recipe rather than as a very small amount.
    return twoPlaces > 0 ? twoPlaces : value;
  }
  if (value >= 10) return Math.round(value * 2) / 2;

  const eighth = Math.round(value * 8) / 8;
  const third = Math.round(value * 3) / 3;

  // Ties go to the eighth: it is the family with more places to land, so it
  // is the one more likely to have the next amount somebody scales to.
  return Math.abs(value - third) < Math.abs(value - eighth) ? third : eighth;
}

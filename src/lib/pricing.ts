/**
 * What Trivet costs, in one place.
 *
 * The pricing page, the terms and `entitlements.ts` all read it. The price was
 * once written into the terms by hand and a correction missed the first merge,
 * so the terms said $3.99 while the plan said $4.99. A number that appears in
 * prose is a number that gets out of date; import it instead.
 *
 * A plain module with no imports, so a server page and a client component can
 * both use it (the same reasoning as `legal.ts` and `meal-slots.ts`).
 */

/** US dollars, as the text a person reads. */
export const PRICE_MONTHLY_USD = "4.99";
export const PRICE_YEARLY_USD = "34.99";

/** A new household's free month of the paid features. */
export const TRIAL_DAYS = 30;

/**
 * How long after a payment a web purchase can be refunded.
 *
 * The payment provider for the web plan may set a floor for this; check it
 * against their current terms before changing it.
 */
export const REFUND_DAYS = 14;

/**
 * Recipes a household may have read each calendar month, by what it has.
 *
 * Each one is a model call, 10-20 cents, so these are what keep a free
 * household from costing real money. Placeholders until real bills say what
 * ordinary use is; the allowance is the lever, so change them here.
 *
 * The trial's number is read against the calendar month, not the thirty days,
 * so a trial that straddles a month end can read up to twice that.
 */
export const FREE_IMPORTS_PER_MONTH = 5;
export const TRIAL_IMPORTS_PER_MONTH = 20;
export const PAID_IMPORTS_PER_MONTH = 20;

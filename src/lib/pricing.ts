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

/**
 * What an evening can hold.
 *
 * Its own module, with no imports, because both the server and the planner
 * need it: `grocery.ts` reaches Prisma on its first line, and importing these
 * from there would drag the database client into the browser bundle.
 *
 * Ordered lists rather than single constants. Everything that renders or
 * queries an evening walks them, so a fourth dinner is this file plus a
 * two-line migration and nothing else - no edit to the planner, the shopping
 * list, or the text message.
 */

/** The mains an evening can hold, in the order they are shown and planned. */
export const DINNER_SLOTS = ["DINNER", "DINNER_2", "DINNER_3"] as const;

/**
 * What goes alongside - for the evening, not for one of the dinners.
 *
 * A list of one today. Sides belong to the day deliberately: tying a side to a
 * particular dinner is what would force a position column and a change to the
 * unique key on (household, date, slot). A second side is another value here.
 */
export const SIDE_SLOTS = ["SIDE"] as const;

/**
 * Everything an evening can hold, and so everything the shopping draws from.
 *
 * Queried explicitly rather than as "any row on this date": a row in a slot the
 * planner does not show would contribute ingredients to a list that does not
 * match the week, which is a confusing thing to debug from the shop.
 */
export const SHOPPING_SLOTS = [...DINNER_SLOTS, ...SIDE_SLOTS] as const;

/** The dinner every evening starts with, and the one that gets the photo. */
export const FIRST_DINNER = DINNER_SLOTS[0];

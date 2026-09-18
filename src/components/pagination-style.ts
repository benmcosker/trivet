import { fonts } from "@/theme/theme";

/**
 * The look of a page control, in one place.
 *
 * Two of these exist - the library's, which is links in a URL, and the
 * planner picker's, which is buttons in a dialog with no URL to put a page in.
 * They are different components for that reason and cannot share markup, so
 * they share their type specs here instead. Otherwise one gets adjusted and
 * the app has two pagers that nearly match, which is worse than having two
 * that obviously do not.
 */

/** Previous and Next. */
export const PAGE_STEP_SX = {
  fontFamily: fonts.sans,
  fontWeight: 700,
  fontSize: "12px",
  letterSpacing: "0.15em",
  textTransform: "uppercase",
  whiteSpace: "nowrap",
} as const;

/**
 * A page number. The current one carries the same 2px clay underline as the
 * active nav item and today in the planner - the same device a third time.
 */
export function pageNumberSx(here: boolean) {
  return {
    fontFamily: fonts.sans,
    fontWeight: here ? 700 : 600,
    fontSize: "14px",
    letterSpacing: "0.06em",
    color: here ? "text.primary" : "text.secondary",
    pb: "4px",
    borderBottom: 2,
    borderColor: here ? "secondary.main" : "transparent",
    "&:hover": { color: "text.primary" },
  } as const;
}

/** The run of pages a gap stands in for. Decoration, never a control. */
export const PAGE_GAP_SX = {
  fontFamily: fonts.sans,
  fontWeight: 600,
  fontSize: "14px",
  letterSpacing: "0.06em",
  color: "text.disabled",
} as const;

/** The sentence under the control that says what is on the page. */
export const PAGE_RANGE_SX = {
  fontFamily: fonts.serif,
  fontStyle: "italic",
  fontWeight: 300,
  color: "text.secondary",
} as const;

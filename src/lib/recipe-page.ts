/**
 * Which page of the library is being looked at, and which numbers to draw.
 *
 * Kept apart from `recipes.ts` for the reason `recipe-sort.ts` already gives:
 * the control is a client component, and importing a value from a module that
 * touches Prisma pulls the Postgres driver into the browser bundle. Defined
 * once here so the control and the query can never disagree about how big a
 * page is.
 */

/**
 * Dishes per page.
 *
 * Divides by 1, 2 and 3, so no breakpoint ends on a widowed card: 24 rows at
 * `xs`, 12 at `sm`, 8 at `md`. About three screens on a desktop - enough to be
 * worth paginating, short enough to reach the control at the bottom.
 */
export const PAGE_SIZE = 24;

/** How many numbers either side of the current one stay visible. */
const WINDOW = 2;

/**
 * Anything unrecognised falls back to page 1 rather than erroring, exactly as
 * `parseSort` does: the value arrives from a URL, where a stale link or a typo
 * is ordinary.
 *
 * `?page=0` and `?page=-4` clamp here and say nothing. They are not a page
 * somebody was reading and lost - they are a malformed URL, and there is no
 * story to tell about them. A page past the end is different, and the caller
 * handles that one out loud.
 */
export function parsePage(value: unknown): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const page = Number(raw);
  if (!Number.isFinite(page)) return 1;
  return Math.max(Math.trunc(page), 1);
}

/** How many pages `total` results make. Always at least one, even when empty. */
export function pageCount(total: number): number {
  return Math.max(Math.ceil(total / PAGE_SIZE), 1);
}

/**
 * The numbers to draw, with gaps where a run was skipped.
 *
 * The first and last pages are always there - they are the two you reach for
 * without counting - plus a window either side of where you are. A "gap" is
 * decoration standing in for a run, and is never a control.
 *
 * A gap is only drawn where it actually saves something. Skipping exactly one
 * page would replace a number with an ellipsis of the same width, hiding a
 * destination to save nothing, so that number is drawn instead.
 */
export function pageWindow(current: number, total: number): (number | "gap")[] {
  const shown = new Set<number>([1, total]);
  for (let page = current - WINDOW; page <= current + WINDOW; page += 1) {
    if (page >= 1 && page <= total) shown.add(page);
  }

  const pages = [...shown].sort((a, b) => a - b);
  const out: (number | "gap")[] = [];

  for (const [index, page] of pages.entries()) {
    const previous = pages[index - 1];
    if (previous !== undefined && page - previous > 1) {
      if (page - previous === 2) out.push(page - 1);
      else out.push("gap");
    }
    out.push(page);
  }

  return out;
}

/**
 * "Dishes 25-48 of 163" - the sentence that makes the eyebrow's count honest.
 *
 * The eyebrow above the grid counts the whole box; this counts what the page
 * is actually showing of what this search found. Built here rather than in the
 * component so the arithmetic is testable, and so an off-by-one shows up in a
 * test rather than in a screenshot.
 */
export function pageRange(
  current: number,
  total: number,
): { first: number; last: number } {
  if (total === 0) return { first: 0, last: 0 };
  const first = (current - 1) * PAGE_SIZE + 1;
  return { first, last: Math.min(current * PAGE_SIZE, total) };
}

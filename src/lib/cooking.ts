/**
 * Where you are in a recipe you are part-way through cooking.
 *
 * Import-free on purpose: the cooking view is a client component, and this is
 * the only part of it worth testing without a browser.
 */

/**
 * A step number that is safe to render, whatever it came from.
 *
 * The position is remembered in `sessionStorage` so that a reload - or the
 * phone killing the tab while you wash your hands - does not lose your place.
 * That storage is the problem: it holds whatever was there last, and the
 * recipe may have been edited since. Coming back to step 7 of a recipe that
 * now has three steps must not render an empty screen, and neither must a
 * stored value that is not a number at all.
 *
 * Clamped rather than reset to zero: somebody four steps into dinner would
 * rather be put at the end of a shortened method than back at the beginning.
 */
export function clampStep(index: number, total: number): number {
  if (total <= 0) return 0;
  if (!Number.isFinite(index)) return 0;
  return Math.min(Math.max(Math.trunc(index), 0), total - 1);
}

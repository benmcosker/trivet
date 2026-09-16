/**
 * How an accepted side is recognised again later.
 *
 * Written into `recipe.sourceName` when a side is accepted, and then matched
 * on: `acceptSideAction` looks for an existing recipe with this exact string
 * before creating one, so accepting the same side twice reuses the recipe
 * rather than making a second copy. `sourceName` doubles as provenance - it is
 * what tells a reader six months later where an unfamiliar recipe came from -
 * which is why the marker is prose rather than an opaque id.
 *
 * That makes the string data, not a label. It is stored in rows that already
 * exist, so it cannot be changed without migrating them: renaming the product
 * from "Meal Magic" to "Trivet" needed
 * `20260916120000_trivet_side_marker` to rewrite every existing marker in
 * step. Change the wording here again and the same is true again.
 */
export function sideMarker(sideId: string): string {
  return `${SIDE_MARKER_PREFIX}${sideId}`;
}

/** Exported for the migration's sake, and so tests can assert on the shape. */
export const SIDE_MARKER_PREFIX = "Trivet side: ";

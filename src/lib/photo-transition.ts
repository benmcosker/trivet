/**
 * The name that ties a dish's photo to itself across a navigation.
 *
 * Import-free on purpose, like `recipe-page.ts` and `recipe-meta.ts` beside
 * it: the grid card, the library hero and the recipe page all need this string
 * and two of them can end up in a client bundle, so it must not reach for
 * anything that touches Prisma.
 *
 * It exists as a function rather than a template literal written out four
 * times because both ends of a morph have to agree exactly. They fail apart
 * silently - a mismatched pair is not an error, it is just a transition that
 * never happens - and a silent failure is the kind worth spending a function
 * on.
 */
export function photoTransitionName(recipeId: string): string {
  return `recipe-photo-${recipeId}`;
}

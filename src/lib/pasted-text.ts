/**
 * Text somebody pasted or shared, made ready to read as a recipe.
 *
 * Pure, so the rules test without a request: how much text is enough, how much
 * is too much, and which link in it is the recipe's source.
 */

import { normaliseAddress } from "./recipe-address";

/**
 * Below this, it is a sentence, not a recipe. A short caption with a title,
 * three ingredients and one step still clears it.
 */
export const MIN_PASTED_CHARS = 40;

/**
 * Above this, it is not a recipe either: somebody pasted a whole page or a
 * chat history. About eight pages of text, and far more than any one recipe.
 */
export const MAX_PASTED_CHARS = 20_000;

export type PastedText =
  | { ok: true; text: string; link: string | null }
  | { ok: false; reason: "empty" | "short" | "long" };

/**
 * Trim the text, check its length, and pick out the link it came with.
 *
 * The first web address in it is taken as the source: a share sheet that
 * passes a caption usually passes the post's address with it, and a pasted
 * message that names its recipe does so with a link. It is kept as the
 * recipe's source address so the recipe credits where it came from. It is
 * not fetched.
 */
export function readPastedText(raw: string | null | undefined): PastedText {
  const text = (raw ?? "").trim();
  if (!text) return { ok: false, reason: "empty" };
  if (text.length < MIN_PASTED_CHARS) return { ok: false, reason: "short" };
  if (text.length > MAX_PASTED_CHARS) return { ok: false, reason: "long" };

  const found = text.match(/https?:\/\/[^\s<>"')\]]+/)?.[0] ?? null;
  const link = found ? normaliseAddress(found.replace(/[.,;:!?]+$/, "")) : null;

  return { ok: true, text, link };
}

/** What to say for each refusal, on the page and from the route. */
export const PASTED_TEXT_REFUSAL: Record<
  Exclude<PastedText, { ok: true }>["reason"],
  string
> = {
  empty: "Paste a recipe first.",
  short:
    "That's too short to be a recipe. Paste the whole thing, ingredients and steps.",
  long: "That's more than one recipe's worth of text. Paste just the recipe.",
};

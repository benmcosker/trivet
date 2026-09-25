import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { ViewTransition } from "react";

/**
 * Ruled paper where the picture will go. The theme owns the two tones; this
 * names them through the CSS variables MUI emits for them.
 */
const STRIPE =
  "repeating-linear-gradient(135deg, var(--mui-palette-background-stripeA) 0 11px, var(--mui-palette-background-stripeB) 11px 22px)";

/**
 * What a recipe looks like before it has a photo.
 *
 * Plenty of recipes arrive without one - typed in by hand, or from a PDF with
 * no usable image - and an honest placeholder beats a broken frame or a stock
 * photo of someone else's dinner. It also keeps a grid of cards the same
 * height, which is most of why this exists.
 *
 * The diagonal stripe is the identity pass's treatment: it reads as ruled paper
 * where the picture will go rather than as an image that failed to load. It
 * replaces a per-recipe tinted gradient, which gave every dish a stable colour
 * you could learn - genuinely useful for picking a tile out of a grid, and
 * given up because a page of pastel rectangles was the loudest thing on a
 * design built from paper and hairlines. The initials carry what recognition
 * is left.
 *
 * No directive of its own, so it renders on the server inside the recipe pages
 * and gets bundled with the client where a client component uses it.
 */
export function RecipePlaceholder({
  title,
  height,
  showTitle = false,
  transitionName,
}: {
  title: string;
  height: number | { xs: number; sm?: number; md?: number };
  /** Adds the dish's initials, for placeholders large enough to carry them. */
  showTitle?: boolean;
  /**
   * Morph this into the same recipe's placeholder on another page. See
   * `RecipePhoto`. A dish without a photo is still the same dish, and the
   * stripe and initials are what identify it - so it travels too, rather than
   * half the library morphing and the other half blinking.
   */
  transitionName?: string;
}) {
  const placeholder = (
    <Box
      // Decorative. The title is always beside or below this in real text, so
      // announcing it here would just repeat the recipe's name.
      aria-hidden
      sx={{
        width: "100%",
        height,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        // The CSS variables by name rather than an `sx` callback.
        //
        // A callback is a function, and a function cannot cross from a server
        // component into MUI's client-side Box - this component renders inside
        // server pages, so it would fail at render while typechecking and
        // building cleanly. Naming the variables keeps the stripe following the
        // colour scheme without anything having to be resolved at render time.
        background: STRIPE,
      }}
    >
      {showTitle ? (
        <Typography
          variant="h3"
          // Styled like a heading, not marked up as one. These initials are
          // decoration beside the real title, and emitting an <h3> for them
          // puts a second, meaningless entry in the page's heading outline.
          component="span"
          sx={{ color: "text.disabled", letterSpacing: "0.06em" }}
        >
          {initials(title)}
        </Typography>
      ) : null}
    </Box>
  );

  if (!transitionName) return placeholder;

  return (
    <ViewTransition name={transitionName} share="morph" default="none">
      {placeholder}
    </ViewTransition>
  );
}

/** "Chicken Piccata" becomes "CP". Two letters is all that fits and all that helps. */
function initials(title: string): string {
  const words = title
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean);

  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

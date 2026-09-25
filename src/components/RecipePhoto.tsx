import Box from "@mui/material/Box";
import Image from "next/image";
import { ViewTransition } from "react";

/**
 * A dish photo, sized for the device asking for it.
 *
 * Every photo is stored at up to 1600px, because that is what the recipe page
 * can use. Serving that same file to a phone showing a 356px-wide card means
 * downloading roughly ten times the pixels that get drawn - which on a phone is
 * the difference between a list that appears and a list that arrives.
 *
 * `sizes` is the part that does the work: it tells the browser how wide the
 * image will be *before* layout, so it can pick from the srcset on the first
 * pass rather than fetching a default and correcting later. Getting it wrong is
 * silent - the picture still looks right, it is just the wrong file - so each
 * caller states the layout it actually uses.
 */
export function RecipePhoto({
  src,
  sizes,
  height,
  priority = false,
  rounded = 1,
  transitionName,
}: {
  src: string;
  /** The CSS width this will occupy, per breakpoint. */
  sizes: string;
  height: number | { xs: number; sm?: number; md?: number };
  /**
   * Load immediately instead of lazily. For the one photo already on screen
   * when the page opens; everything below the fold should stay lazy.
   */
  priority?: boolean;
  rounded?: number;
  /**
   * Morph this photo into the same photo on another page.
   *
   * Both ends of the journey pass the same name - the card in the library and
   * the picture at the top of the recipe - and React hands the pair to the
   * browser's View Transitions API, which animates one into the other rather
   * than swapping two unrelated rectangles.
   *
   * A name must be unique on the page at any one moment, so this is opt-in
   * rather than automatic: `/plan` can show one dish on two evenings, and two
   * elements claiming one name is how the whole transition stops working.
   */
  transitionName?: string;
}) {
  const photo = (
    <Box
      sx={{
        position: "relative",
        width: "100%",
        height,
        borderRadius: rounded,
        overflow: "hidden",
      }}
    >
      <Image
        src={src}
        alt=""
        fill
        sizes={sizes}
        priority={priority}
        style={{ objectFit: "cover" }}
      />
    </Box>
  );

  if (!transitionName) return photo;

  /*
   * `share="morph"` names the animation so the theme can slow it down and blur
   * it; `default="none"` keeps these out of every *other* transition on the
   * page. Both are needed together - a named pair with `default="none"` and no
   * `share` silently stops morphing, which looks exactly like the feature not
   * working.
   */
  return (
    <ViewTransition name={transitionName} share="morph" default="none">
      {photo}
    </ViewTransition>
  );
}

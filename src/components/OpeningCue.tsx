"use client";

import Box from "@mui/material/Box";
import { keyframes } from "@mui/material/styles";
import { useLinkStatus } from "next/link";

/**
 * The words of a recipe card, breathing while its recipe opens.
 *
 * Usually nothing to see: the recipe's outline (`RecipeOutline`) is fetched
 * ahead with the card and appears the moment it is tapped. When it has not
 * arrived yet - a slow connection, a card scrolled into view a moment ago -
 * the library stays on screen until it does, and this is what says the tap
 * landed: the tapped card's title breathes, the same slow breath as the
 * outlines. Not the photo: it is what is about to move, and a dimmed photo
 * would be the picture that flies. The breath waits 150ms before starting,
 * so a quick open shows nothing at all.
 *
 * Must sit inside the card's link: that is whose status it reads.
 */

const breathe = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
`;

export function OpeningCue({ children }: { children: React.ReactNode }) {
  const { pending } = useLinkStatus();
  return (
    <Box
      component="span"
      sx={
        pending
          ? {
              animation: `${breathe} 1.2s ease-in-out 150ms infinite`,
              "@media (prefers-reduced-motion: reduce)": {
                animation: "none",
                opacity: 0.6,
              },
            }
          : undefined
      }
    >
      {children}
    </Box>
  );
}

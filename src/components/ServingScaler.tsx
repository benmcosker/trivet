import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Link from "next/link";

import { servingsHref } from "@/lib/scale";
import { fonts } from "@/theme/theme";

import { pageNumberSx } from "./pagination-style";

/**
 * How many people this recipe is being read for.
 *
 * Links in a URL rather than a control in the browser, which is three things
 * at once. The page is a server component and stays one - no client
 * JavaScript arrives to change a number that the server can render already.
 * A scaled recipe becomes a thing you can send somebody, bookmark, or leave
 * open on a phone through a reload. And the back button means what it says,
 * which a dropdown holding the only copy of the number does not.
 *
 * Plain `<Link>` wrapping a `Box`, not `component={Link}`: this renders on
 * the server, and handing MUI's client code a component function typechecks,
 * builds, serves 200 and dies when React hydrates. `RecipePagination` is
 * built the same way and says so at more length.
 *
 * The numbers take the same 2px clay underline the pager gives the current
 * page - the same device again rather than a new one for a control that does
 * the same job: here is the set, here is where you are in it.
 */
export function ServingScaler({
  path,
  choices,
  current,
  recipeServings,
}: {
  /** The page this control sits on, without a query string. */
  path: string;
  /** Every count on offer, from `servingChoices`. */
  choices: number[];
  /** The count being shown now. */
  current: number;
  /** What the recipe itself makes, which decides when the URL carries one. */
  recipeServings: number;
}) {
  // Nothing to choose between: a recipe that already serves eight or more.
  // The page says its number in the chip row instead.
  if (choices.length < 2) return null;

  return (
    <Stack
      component="nav"
      direction="row"
      aria-label="How many to cook for"
      sx={{ alignItems: "baseline", gap: "10px", flexWrap: "wrap" }}
    >
      <Box
        component="span"
        sx={{
          fontFamily: fonts.sans,
          fontWeight: 700,
          fontSize: "10.5px",
          letterSpacing: "0.13em",
          textTransform: "uppercase",
          color: "text.secondary",
        }}
      >
        Serves
      </Box>

      {choices.map((choice) => {
        const here = choice === current;
        return (
          <Link
            key={choice}
            href={servingsHref(path, choice, recipeServings)}
            aria-current={here ? "true" : undefined}
            aria-label={`Cook for ${choice}`}
            style={{ textDecoration: "none" }}
          >
            <Box component="span" sx={pageNumberSx(here)}>
              {choice}
            </Box>
          </Link>
        );
      })}
    </Stack>
  );
}

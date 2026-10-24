import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Link from "next/link";

import { heroEyebrow, recipeMetaParts, splitTitle } from "@/lib/recipe-meta";
import type { RecipeWithRelations } from "@/lib/recipes";
import { formatOvenTempShort } from "@/lib/temperature";

import { RecipeMetaLine } from "./RecipeMetaLine";
import { photoTransitionName } from "@/lib/photo-transition";
import { recipePath } from "@/lib/recipe-url";

import { RecipePhoto } from "./RecipePhoto";
import { RecipePlaceholder } from "./RecipePlaceholder";

/** Three is what fits on one line beside a 52px title. */
const MAX_HERO_TAGS = 3;

/**
 * Tall enough to hold the column beside it without either looking stranded.
 *
 * 190 at `xs`, where it is stacked above that column rather than beside it:
 * nothing is left stranded by a shorter picture there, and the 50px it gives
 * back is 50px of the one screen that decides whether a second dish name is
 * visible at all.
 */
const HERO_PHOTO_HEIGHT = { xs: 190, sm: 340, md: 480 };

/**
 * The newest recipe, given the front page.
 *
 * A library only gets added to if people remember it is there, and a wall of
 * equal tiles gives nobody a reason to look. This is the one recipe the page
 * argues for.
 *
 * Shown only on the unfiltered view: once you have searched or picked a
 * collection, the newest match is not news, it is just the first result.
 */
export function RecipeHero({ recipe }: { recipe: RecipeWithRelations }) {
  const { head, tail } = splitTitle(recipe.title);
  const oven = formatOvenTempShort(recipe.ovenTemp, recipe.ovenTempUnit);

  const eyebrow = heroEyebrow(recipe.createdAt);

  return (
    // A plain <Link> wrapping a Box, not `component={Link}` on the Box: passing
    // a component function from a server component into MUI's client code
    // typechecks, builds, and then fails at render.
    <Link
      href={recipePath(recipe)}
      transitionTypes={["nav-forward"]}
      style={{ textDecoration: "none", color: "inherit", display: "block" }}
    >
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "1.35fr 1fr" },
          gap: { xs: 2, sm: 3, md: "52px" },
          alignItems: "stretch",
          pb: { xs: "32px", sm: "56px" },
          borderBottom: 1,
          borderColor: "divider",
          // The only thing that moves on hover, per the design.
          "&:hover .RecipeHero-title": { color: "secondary.main" },
        }}
      >
        <Box>
          {recipe.imageUrl ? (
            // The one photo already on screen when the page opens, so it loads
            // eagerly; everything in the grid below stays lazy.
            <RecipePhoto
              src={recipe.imageUrl}
              height={HERO_PHOTO_HEIGHT}
              rounded={0}
              priority
              sizes="(max-width: 900px) 100vw, 55vw"
              transitionName={photoTransitionName(recipe.id)}
            />
          ) : (
            <RecipePlaceholder
              title={recipe.title}
              height={HERO_PHOTO_HEIGHT}
              showTitle
              transitionName={photoTransitionName(recipe.id)}
            />
          )}
        </Box>

        <Stack sx={{ justifyContent: "center", gap: "22px" }}>
          <Typography variant="overline" sx={{ color: "secondary.main" }}>
            {eyebrow}
          </Typography>

          <Typography
            variant="h2"
            component="h2"
            className="RecipeHero-title"
            sx={{
              fontSize: { xs: "2.25rem", md: "3.25rem" },
              lineHeight: 1.05,
              letterSpacing: "-0.025em",
              textWrap: "pretty",
            }}
          >
            {head}
            {tail ? (
              <Box
                component="span"
                sx={{ fontStyle: "italic", fontWeight: 300 }}
              >
                {" "}
                {tail}
              </Box>
            ) : null}
          </Typography>

          {recipe.description ? (
            <Typography
              variant="body1"
              sx={{
                /*
                 * Not on a phone. The grid cards below carry no description
                 * either, so this is the hero arguing for its dish in a voice
                 * the rest of the page does not use - and it costs about a
                 * fifth of the screen the first dish has to fit in. The title,
                 * the meta line and the tags still say more about this recipe
                 * than any card does.
                 */
                display: { xs: "none", sm: "block" },
                fontSize: "1.25rem",
                lineHeight: 1.6,
                color: "text.muted",
                maxWidth: "38ch",
                textWrap: "pretty",
              }}
            >
              {recipe.description}
            </Typography>
          ) : null}

          <RecipeMetaLine
            parts={recipeMetaParts(recipe, { servingsFirst: true })}
            accent={oven ? `${oven} oven` : null}
          />

          {recipe.tags.length > 0 ? (
            <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap" }}>
              {recipe.tags.slice(0, MAX_HERO_TAGS).map(({ tag }) => (
                <Chip
                  key={tag.id}
                  label={tag.name}
                  variant="outlined"
                  size="small"
                  sx={{
                    fontSize: "0.6875rem",
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    height: "auto",
                    "& .MuiChip-label": { px: "11px", py: "6px" },
                  }}
                />
              ))}
            </Stack>
          ) : null}
        </Stack>
      </Box>
    </Link>
  );
}

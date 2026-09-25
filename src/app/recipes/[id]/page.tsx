import EditIcon from "@mui/icons-material/Edit";
import SoupKitchenIcon from "@mui/icons-material/SoupKitchen";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { notFound } from "next/navigation";

import { AppShell } from "@/components/AppShell";
import { formatAmount } from "@/lib/quantity";
import { DeleteRecipeButton } from "@/components/DeleteRecipeButton";
import { ShareRecipeToggle } from "@/components/ShareRecipeToggle";
import { IconChip } from "@/components/IconChip";
import { LinkButton } from "@/components/LinkButton";
import { RecipeImageUploader } from "@/components/RecipeImageUploader";
import { RecipePhoto } from "@/components/RecipePhoto";
import { photoTransitionName } from "@/lib/photo-transition";
import {
  readServings,
  scaleFactor,
  scaleQuantity,
  servingChoices,
  servingsHref,
} from "@/lib/scale";
import { RecipePlaceholder } from "@/components/RecipePlaceholder";
import { RecipeReviews } from "@/components/RecipeReviews";
import { ServingScaler } from "@/components/ServingScaler";
import { ReviewStars } from "@/components/ReviewStars";
import { getMyReview, listReviews } from "@/lib/reviews";
import { formatMinutes, formatOvenTemp } from "@/lib/temperature";
import { getRecipe } from "@/lib/recipes";
import { requireHousehold } from "@/lib/session";

export default async function RecipePage({
  params,
  searchParams,
}: PageProps<"/recipes/[id]">) {
  const user = await requireHousehold();

  const { id } = await params;
  const recipe = await getRecipe(id, user.householdId);
  // Null covers "no such recipe" and "not shared with you" alike, and both are
  // the same 404: telling them apart would answer a guessed id with the news
  // that it exists.
  if (!recipe) notFound();

  const [reviews, myReview] = await Promise.all([
    listReviews(recipe.id),
    getMyReview(recipe.id, user.id),
  ]);

  /*
   * How many this reading of the recipe is for.
   *
   * In the URL rather than in the browser, so a recipe opened for eight is a
   * link you can send, a bookmark, and a page that survives the reload a
   * propped-up phone eventually gets. Absent, out of range or nonsense all
   * come back as the recipe as written - see `readServings`.
   *
   * Nothing is stored. Scaling is a way of reading a recipe, not an edit to
   * it: the household's copy still says what it always said, and the next
   * person to open it gets that.
   */
  const { serves } = await searchParams;
  const servings = readServings(serves, recipe.servings);
  const factor = scaleFactor(servings, recipe.servings);
  const choices = servingChoices(recipe.servings);
  const scaled = servings !== recipe.servings;

  const mine = recipe.householdId === user.householdId;
  const totalMinutes = (recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0);
  const ovenTemp = formatOvenTemp(recipe.ovenTemp, recipe.ovenTempUnit);
  const restTime = formatMinutes(recipe.restMinutes);

  return (
    <AppShell>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        sx={{
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 2,
          mb: 1,
        }}
      >
        {/*
         * The title gets the whole width on a phone and the buttons drop
         * below it. Sharing the row costs it about half the line, which a
         * page label like "Pantry" can afford and a recipe title cannot.
         */}
        <Typography variant="h1" sx={{ overflowWrap: "break-word" }}>
          {recipe.title}
        </Typography>
        <Stack direction="row" spacing={1}>
          {/*
           * Cooking is not editing: anyone who can read a recipe can stand at
           * a hob and follow it, so this one is outside the ownership check.
           */}
          <LinkButton
            href={servingsHref(
              `/recipes/${recipe.id}/cook`,
              servings,
              recipe.servings,
            )}
            startIcon={<SoupKitchenIcon />}
            variant="contained"
          >
            Cook
          </LinkButton>
          {/*
           * Everyone reads the library; only the household that added a recipe
           * can change it. The server enforces that either way.
           *
           * Absent rather than disabled for the other households. A greyed-out
           * Delete says only "not you", where the line at the foot of the page
           * names the family it does belong to - which is the actual answer,
           * and worth reading whether or not you were reaching for the button.
           */}
          {mine ? (
            <>
              <LinkButton
                href={`/recipes/${recipe.id}/edit`}
                startIcon={<EditIcon />}
                variant="outlined"
              >
                Edit
              </LinkButton>
              <DeleteRecipeButton id={recipe.id} title={recipe.title} />
            </>
          ) : null}
        </Stack>
      </Stack>

      {recipe.description ? (
        /*
         * Held to about seventy characters a line.
         *
         * Uncapped this ran the full width of the page: 182 characters a line
         * at 1440px, measured, which is somewhere past twice what anybody
         * reads comfortably. Long measure is tiring in a specific way - the
         * eye loses the start of the next line on the way back from the end
         * of this one, and you reread the line you have just read.
         *
         * The number is 55 and not 65 because `ch` is not a character. It is
         * the width of the "0" glyph, and in Newsreader at this size that is
         * 9.8px against an average of 7.2px for the characters in an actual
         * sentence - so a `ch` buys about 1.36 characters of room. Measured
         * on the rendered line boxes: 65ch gives 83 to 86 characters a line,
         * past the 80 that WCAG 1.4.8 asks for. 55ch gives 69 to 73, which
         * is the top of the range typography has settled on (45-75, with 66
         * the usual ideal) and inside the accessibility limit.
         *
         * `ch` rather than pixels even so, because the limit is about
         * characters and the unit follows the font: a pixel width tuned for
         * this face would be the wrong measure the day the type changes. It
         * is the same rule `RecipeHero` has held its description to since it
         * was drawn, recalibrated for body size.
         */
        <Typography
          color="text.secondary"
          sx={{ mb: 2, maxWidth: "55ch", textWrap: "pretty" }}
        >
          {recipe.description}
        </Typography>
      ) : null}

      <Box sx={{ mb: 2 }}>
        <ReviewStars summary={recipe.reviews} />
      </Box>

      {/*
       * Above the chips rather than among them: the chips state facts about
       * the dish and this asks a question of the reader, and a row that mixes
       * the two reads as though the servings were another fact you could not
       * change.
       */}
      {choices.length > 1 ? (
        <Box sx={{ mb: 2 }}>
          <ServingScaler
            path={`/recipes/${recipe.id}`}
            choices={choices}
            current={servings}
            recipeServings={recipe.servings}
          />
        </Box>
      ) : null}

      <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1, mb: 3 }}>
        {/*
         * The count moves into the control when there is one, so it is not
         * printed twice. A yield note is not a count - "Makes 12 muffins" is
         * a sentence about the recipe as written - so it stays either way,
         * and the line under the ingredients says what scaling did to it.
         */}
        {choices.length > 1 ? (
          recipe.yieldNote ? (
            <Chip label={recipe.yieldNote} size="small" />
          ) : null
        ) : (
          <Chip
            label={recipe.yieldNote ?? `Serves ${recipe.servings}`}
            size="small"
          />
        )}
        {totalMinutes > 0 ? (
          <Chip label={`${formatMinutes(totalMinutes)} total`} size="small" />
        ) : null}
        {restTime ? <Chip label={`${restTime} resting`} size="small" /> : null}
        {/*
         * Coloured, unlike the rest: the oven has to be on before anything
         * else happens, so it is the one number worth finding without reading.
         */}
        {ovenTemp ? (
          <IconChip icon="oven" label={ovenTemp} size="small" color="warning" />
        ) : null}
        {recipe.tags.map(({ tag }) => (
          <Chip key={tag.id} label={tag.name} size="small" variant="outlined" />
        ))}
        {recipe.sourceFileUrl ? (
          <IconChip
            icon={recipe.sourceFileType === "application/pdf" ? "pdf" : "photo"}
            component="a"
            href={recipe.sourceFileUrl}
            target="_blank"
            rel="noopener noreferrer"
            clickable
            label={recipe.sourceFileName ?? "Original card"}
            size="small"
            variant="outlined"
          />
        ) : null}
      </Stack>

      <Box sx={{ mb: 3 }}>
        {recipe.imageUrl ? (
          // The one photo already on screen when the page opens, so it loads
          // eagerly; everything else on the site stays lazy.
          <RecipePhoto
            src={recipe.imageUrl}
            height={{ xs: 200, sm: 380 }}
            rounded={2}
            priority
            sizes="(max-width: 1200px) 100vw, 1152px"
            transitionName={photoTransitionName(recipe.id)}
          />
        ) : (
          <RecipePlaceholder
            title={recipe.title}
            height={{ xs: 160, sm: 220 }}
            showTitle
            transitionName={photoTransitionName(recipe.id)}
          />
        )}

        {/*
         * Directly under the image it changes, rather than in the edit form.
         * The moment you want a photo is the moment you are looking at the
         * placeholder, and a recipe has to exist before it can have one.
         *
         * The photo follows the recipe: only the household that added it can
         * change the picture everybody else cooks from.
         */}
        {mine ? (
          <Box sx={{ mt: 1 }}>
            <RecipeImageUploader
              recipeId={recipe.id}
              hasImage={Boolean(recipe.imageUrl)}
            />
          </Box>
        ) : null}
      </Box>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card>
            <CardContent>
              <Typography variant="h3" gutterBottom>
                Ingredients
              </Typography>
              {/*
               * Separators are CSS borders rather than Stack's `divider`
               * prop: that prop clones the divider element for each gap, and
               * React.cloneElement on a client-component element inside a
               * server component produces an element with no type, which
               * fails at request time. It only bites with two or more
               * children, so a one-item list would have looked fine.
               */}
              <Stack
                spacing={1}
                sx={{
                  "& > :not(:last-child)": {
                    borderBottom: 1,
                    borderColor: "divider",
                    pb: 1,
                  },
                }}
              >
                {recipe.ingredients.map((ingredient) => (
                  <Box key={ingredient.id}>
                    <Typography variant="body2">
                      <Box component="span" sx={{ fontWeight: 600 }}>
                        {formatAmount(
                          scaleQuantity(ingredient.quantity, factor),
                          ingredient.unit,
                        )}
                      </Box>{" "}
                      {ingredient.name}
                    </Typography>
                    {ingredient.note ? (
                      <Typography variant="caption" color="text.secondary">
                        {ingredient.note}
                      </Typography>
                    ) : null}
                  </Box>
                ))}
                {recipe.ingredients.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    None listed.
                  </Typography>
                ) : null}
              </Stack>

              {/*
               * What scaling did not touch, said plainly.
               *
               * The method is free text: "stir in 2 cups of stock" stays two
               * cups however many the ingredients are for, and that is the
               * one that ruins a dinner. Times do not double when the tray
               * does, and a yield note is a sentence rather than a number.
               * Multiplying the numerals in a step is how "cook for 20
               * minutes" becomes forty, so they are left alone and named
               * instead.
               */}
              {scaled ? (
                <Typography
                  variant="caption"
                  component="p"
                  color="text.secondary"
                  sx={{ mt: 2, display: "block" }}
                >
                  Amounts are for {servings}.{" "}
                  {recipe.yieldNote
                    ? "The method, the times and the yield are"
                    : "The method and the times are"}{" "}
                  written for {recipe.servings}.
                </Typography>
              ) : null}
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 8 }}>
          <Card>
            <CardContent>
              {recipe.equipment.length > 0 ? (
                <Box sx={{ mb: 2.5 }}>
                  <Typography variant="h3" gutterBottom>
                    You will need
                  </Typography>
                  <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.5 }}>
                    {recipe.equipment.map((item) => (
                      <IconChip
                        key={item}
                        icon="equipment"
                        label={item}
                        size="small"
                        variant="outlined"
                      />
                    ))}
                  </Stack>
                </Box>
              ) : null}

              <Typography variant="h3" gutterBottom>
                Method
              </Typography>
              <Stack spacing={2} component="ol" sx={{ pl: 3, m: 0 }}>
                {recipe.instructions.map((step, index) => (
                  <Typography
                    key={index}
                    component="li"
                    variant="body1"
                    // On the step rather than on the list, so the measure is
                    // the text's and the numbers hang outside it. A cap on
                    // the <ol> would have the 24px of `pl` eaten out of the
                    // 55ch, leaving the words a few characters short.
                    sx={{ maxWidth: "55ch", textWrap: "pretty" }}
                  >
                    {step}
                  </Typography>
                ))}
              </Stack>
              {recipe.instructions.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No method recorded.
                </Typography>
              ) : null}

              {recipe.notes ? (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="h3" gutterBottom>
                    Notes
                  </Typography>
                  {/*
                   * The same 55ch as the description and the steps, at a
                   * third size, and it lands in the same place: a `ch`
                   * follows the font, so one number holds every block on
                   * this page to the same measure without any of them
                   * knowing what size the others are set in. Measured at
                   * 1440px: description 73 characters a line, steps 72,
                   * notes 72 - against 182, 113 and 139 uncapped.
                   */}
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ maxWidth: "55ch", textWrap: "pretty" }}
                  >
                    {recipe.notes}
                  </Typography>
                </>
              ) : null}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Card sx={{ mt: 3 }}>
        <CardContent>
          <RecipeReviews
            recipeId={recipe.id}
            summary={recipe.reviews}
            reviews={reviews}
            myReview={myReview}
            currentUserId={user.id}
          />
        </CardContent>
      </Card>

      {mine ? (
        <ShareRecipeToggle recipeId={recipe.id} isShared={recipe.isShared} />
      ) : null}

      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: "block", mt: 3 }}
      >
        Added by {recipe.createdBy.name}
        {mine ? null : <> of {recipe.household.name}</>}
        {/*
         * Said on somebody else's recipe as well as your own. On theirs it is
         * the answer to "why can I read this", which is worth knowing next to
         * the name of the family it belongs to.
         */}
        {!mine && recipe.isShared ? <> · Shared with you</> : null}
        {recipe.sourceName ? <> · From {recipe.sourceName}</> : null}
        {recipe.sourceUrl ? (
          <>
            {" · "}
            <a
              href={recipe.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Original source
            </a>
          </>
        ) : null}
      </Typography>
    </AppShell>
  );
}

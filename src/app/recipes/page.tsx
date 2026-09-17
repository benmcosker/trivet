import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { AppShell } from "@/components/AppShell";
import { CollectionsRow } from "@/components/CollectionsRow";
import { LinkButton } from "@/components/LinkButton";
import { RecipeFilters } from "@/components/RecipeFilters";
import { RecipeGridCard } from "@/components/RecipeGridCard";
import { RecipeHero } from "@/components/RecipeHero";
import { RecipePagination } from "@/components/RecipePagination";
import { RecipeSearchBar } from "@/components/RecipeSearchBar";
import { PaperNote } from "@/components/PaperNote";
import { pickCollections } from "@/lib/collections";
import { withArticle } from "@/lib/household";
import { listTagsWithCounts } from "@/lib/recipe-mutations";
import { PAGE_SIZE, pageCount, parsePage } from "@/lib/recipe-page";
import { parseSort } from "@/lib/recipe-sort";
import { countRecipes, countSearchRecipes, searchRecipes } from "@/lib/recipes";
import { requireHousehold } from "@/lib/session";

export default async function RecipesPage({
  searchParams,
}: PageProps<"/recipes">) {
  const { householdId, householdName } = await requireHousehold();

  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q : "";
  const tagParam = params.tag;
  const tagSlugs = Array.isArray(tagParam)
    ? tagParam
    : typeof tagParam === "string"
      ? [tagParam]
      : [];

  const sort = parseSort(params.sort);

  // The hero is the front page arguing for one recipe. Once you have searched
  // or picked a collection, the newest match is not news - it is just the first
  // result. Re-ordering is a request to see the library in that order, not to
  // have one recipe lifted out of it.
  const browsing = !query && tagSlugs.length === 0 && sort === "newest";

  const search = { householdId, query, tagSlugs, sort };

  /*
   * How many results there are has to be known before the page can be asked
   * for, because a page past the end is served as the last one instead. Two
   * queries where there was one; the count is a bare COUNT(*) over the same
   * WHERE clause, with no ordering and no review aggregate.
   */
  const [tags, libraryCount, matchCount] = await Promise.all([
    listTagsWithCounts(householdId),
    countRecipes(householdId),
    countSearchRecipes(search),
  ]);

  const totalPages = pageCount(matchCount);
  const asked = parsePage(params.page);
  const page = Math.min(asked, totalPages);
  // Worth saying out loud, unlike ?page=0: this was a real page once, or a
  // link somebody sent before four recipes were deleted.
  const pastTheEnd = asked > totalPages && matchCount > 0;

  /*
   * The hero spends one of the page's dishes rather than riding above them.
   *
   * Page one while browsing is hero + 23, not hero + 24 - otherwise the first
   * page holds 25 and every range after it is off by one. `browsing` already
   * means the hero never appears on a searched, filtered or re-sorted page,
   * so pages two and up are a plain 24.
   */
  const heroOnThisPage = browsing && page === 1;
  const offset = (page - 1) * PAGE_SIZE;

  // **The absent argument was the bug.** Without a limit this defaulted to 50
  // while the eyebrow above the grid counted the whole box.
  const recipes = await searchRecipes({ ...search, limit: PAGE_SIZE, offset });

  const hero = heroOnThisPage && recipes.length > 0 ? recipes[0] : null;
  const grid = hero ? recipes.slice(1) : recipes;

  /*
   * What the range line is counting. The eyebrow above the grid counts the
   * whole box; this counts what this search found, which is a different number
   * the moment a filter is on.
   */
  const tagName =
    tagSlugs.length === 1
      ? tags.find((tag) => tag.slug === tagSlugs[0])?.name
      : null;
  const summary = tagName
    ? `of ${matchCount} tagged \u201c${tagName}\u201d`
    : query
      ? `of ${matchCount} matching \u201c${query}\u201d`
      : `of ${matchCount}`;

  /*
   * What to say when the page asked for is past the end.
   *
   * "The box" is only right while browsing it whole. On a filtered search the
   * box still has all its pages - it is this search that is short - and
   * telling somebody their library has one page because they searched for
   * "cod" is the page confusing itself with the question.
   */
  const pastTheEndNote = browsing
    ? `The box has ${totalPages} ${totalPages === 1 ? "page" : "pages"} now. ` +
      "This is the last one."
    : `This search has ${totalPages} ${totalPages === 1 ? "page" : "pages"}. ` +
      `This is ${totalPages === 1 ? "it" : "the last one"}.`;

  // Everything the control has to keep hold of when it changes the page.
  const carried = new URLSearchParams();
  if (query) carried.set("q", query);
  for (const slug of tagSlugs) carried.append("tag", slug);
  if (sort !== "newest") carried.set("sort", sort);

  return (
    <AppShell>
      <Box
        sx={{
          display: "flex",
          alignItems: { xs: "stretch", md: "flex-end" },
          justifyContent: "space-between",
          flexWrap: "wrap",
          // On a phone the title and the controls stack, and a 32px gap
          // between them was buying nothing but scrolling: the whole header
          // ran to 500px on an 852px screen before a single dish appeared.
          gap: { xs: 1.5, md: 4 },
          mb: { xs: "20px", md: "36px" },
        }}
      >
        <Box>
          <Typography
            variant="overline"
            component="p"
            sx={{ color: "secondary.main", mb: "12px" }}
          >
            {/*
             * The viewer's household, even though the library is shared by all
             * of them: it is the box they keep it in, and "the shared recipe
             * box" belongs to nobody.
             */}
            {withArticle(householdName)} recipe box · {libraryCount}{" "}
            {libraryCount === 1 ? "dish" : "dishes"}
          </Typography>
          <Typography variant="h1">Recipes</Typography>
        </Box>

        <Stack
          direction="row"
          sx={{
            alignItems: "center",
            // Filters and New recipe share the row width on a phone rather
            // than huddling at the left with a hole beside them.
            justifyContent: { xs: "space-between", md: "flex-start" },
            width: { xs: "100%", md: "auto" },
            gap: "18px",
            pb: { xs: 0, md: "8px" },
          }}
        >
          <RecipeFilters tags={tags} />
          <LinkButton href="/recipes/new" variant="contained" color="ink">
            New recipe
          </LinkButton>
        </Stack>
      </Box>

      <RecipeSearchBar />

      <CollectionsRow collections={pickCollections(tags)} />

      {/*
       * Not a 404: the recipes exist and the visitor did nothing wrong. Not a
       * redirect either - that would rewrite history and break the back
       * button. They get the last page and an explanation.
       */}
      {pastTheEnd ? (
        <Box sx={{ mb: "36px" }}>
          <PaperNote label="That page is gone">{pastTheEndNote}</PaperNote>
        </Box>
      ) : null}

      {recipes.length === 0 ? (
        <Typography variant="body1" sx={{ color: "text.muted" }}>
          {query || tagSlugs.length > 0
            ? "Nothing matches that search."
            : "No recipes yet. Add one, or upload a PDF."}
        </Typography>
      ) : (
        <>
          {hero ? <RecipeHero recipe={hero} /> : null}

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                sm: "repeat(2, 1fr)",
                md: "repeat(3, 1fr)",
              },
              // 44px between rows against 40px between columns: the extra
              // height stops a title reading as the caption of the photo below.
              gap: "44px 40px",
              pt: hero ? "44px" : 0,
            }}
          >
            {grid.map((recipe, index) => (
              <RecipeGridCard
                key={recipe.id}
                recipe={recipe}
                // With no hero, the first row is the fold rather than below
                // it. Three cards, not the twenty-one under them.
                priority={!hero && index < 3}
              />
            ))}
          </Box>

          <RecipePagination
            current={page}
            totalPages={totalPages}
            totalResults={matchCount}
            params={carried.toString()}
            summary={summary}
          />
        </>
      )}
    </AppShell>
  );
}

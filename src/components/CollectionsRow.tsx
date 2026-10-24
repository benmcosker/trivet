"use client";

import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Typography from "@mui/material/Typography";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { TagCount } from "@/lib/collections";

import { RecipeFilters } from "./RecipeFilters";

/**
 * The six named ways into the library.
 *
 * Set in the same serif as the dishes rather than as controls, because that is
 * what they are: an editor's shelf labels, not a filter widget. They write the
 * same `?tag=` the chips always did, so a collection is a linkable view and the
 * back button undoes it.
 */
export function CollectionsRow({
  collections,
  tags,
}: {
  collections: TagCount[];
  /**
   * The whole vocabulary, for the door at the head of the row.
   *
   * On a phone the `Filters` control is not in the page header - it was the
   * one thing forcing the title and `New recipe` onto separate rows - so the
   * shelf label is also the way in to the rest of the tags.
   */
  tags: TagCount[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (collections.length === 0) return null;

  const activeTags = searchParams.getAll("tag");

  function toggleTag(slug: string) {
    const params = new URLSearchParams(searchParams.toString());
    const next = activeTags.includes(slug)
      ? activeTags.filter((t) => t !== slug)
      : [...activeTags, slug];

    params.delete("tag");
    for (const tag of next) params.append("tag", tag);
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <Box
      sx={{
        display: "flex",
        // Baseline, not centre. An 11px uppercase label and a 19px serif name
        // centred on each other sit at two different heights; on a shared
        // baseline the label reads as the address of the names beside it, and
        // the collections' rules - which hang 2px under their own text - line
        // up with each other rather than stepping.
        alignItems: "baseline",
        gap: { xs: "20px", md: "26px" },
        /*
         * 22px of air under this row at `xs`, of which the filters door's own
         * padding is already supplying 9 - see `RecipeFilters`, where that
         * padding is what makes an 11px label a 33px target in a row that
         * cannot let anything overhang it.
         */
        mb: { xs: "13px", md: "56px" },
        // Six serif words do not fit across a phone. Scrolling the row keeps
        // them on one line, where wrapping would spend three lines on shelf
        // labels.
        overflowX: { xs: "auto", md: "visible" },
        scrollbarWidth: "none",
        "&::-webkit-scrollbar": { display: "none" },
        // The last name fades out instead of being cut mid-letter. "Sunday
        // Cook" with the rule running off the edge reads as a layout fault;
        // the same word fading reads as a row that continues.
        maskImage: {
          xs: "linear-gradient(to right, #000 90%, transparent)",
          md: "none",
        },
        WebkitMaskImage: {
          xs: "linear-gradient(to right, #000 90%, transparent)",
          md: "none",
        },
        "& > *": { flexShrink: 0 },
      }}
    >
      <Box sx={{ display: { xs: "contents", md: "none" } }}>
        <RecipeFilters tags={tags} appearance="shelf" />
      </Box>
      <Typography
        variant="overline"
        sx={{ display: { xs: "none", md: "block" }, color: "text.secondary" }}
      >
        Collections
      </Typography>

      {collections.map((collection) => {
        const active = activeTags.includes(collection.slug);
        return (
          <ButtonBase
            key={collection.slug}
            onClick={() => toggleTag(collection.slug)}
            aria-pressed={active}
            sx={{
              fontFamily: (theme) => theme.typography.body1.fontFamily,
              fontSize: "1.1875rem",
              color: "text.primary",
              borderBottom: "1px solid",
              // Selection is the rule going dark, which is the only signal the
              // row can carry without growing a second row of state.
              borderColor: active ? "text.primary" : "divider",
              pb: "2px",
              gap: "6px",
              alignItems: "baseline",
              "&:hover": { borderColor: "text.primary" },
            }}
          >
            {collection.name}
            <Box
              component="span"
              sx={{
                fontFamily: (theme) => theme.typography.body2.fontFamily,
                fontSize: "0.6875rem",
                letterSpacing: "0.06em",
                color: "text.secondary",
              }}
            >
              {collection.count}
            </Box>
          </ButtonBase>
        );
      })}
    </Box>
  );
}

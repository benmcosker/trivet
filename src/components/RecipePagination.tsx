import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Link from "next/link";

import { pageRange, pageWindow } from "@/lib/recipe-page";

import {
  PAGE_GAP_SX,
  PAGE_RANGE_SX,
  PAGE_STEP_SX,
  pageNumberSx,
} from "./pagination-style";

/**
 * Which page of the recipe box you are on.
 *
 * Numbered pages rather than an endless column: a recipe box is a thing you
 * flip through, and seven pages tells you the size of what you are browsing.
 * "About halfway down page three" is a memory you can act on; a scroll
 * position is not, and it does not survive a reload.
 *
 * Links, never buttons. Every page is a URL, so middle-click and
 * open-in-new-tab work, the back button means what it says, and a page can be
 * sent to somebody. They are plain `<Link>` elements wrapping a `Box`, not
 * `component={Link}` on one: this renders on the server, and handing MUI's
 * client code a component function is the failure `LinkButton` exists for -
 * it typechecks, it builds, it serves 200, and it dies when React hydrates.
 * `RecipeGridCard` is built the same way for the same reason.
 *
 * MUI's `Pagination` is not here either: it draws a row of circular buttons,
 * which would be eight radiused objects on a page that has none. These are text on paper, and the current page carries the
 * same 2px clay underline as the active nav item and today in the planner -
 * the third use of one device.
 */
export function RecipePagination({
  current,
  totalPages,
  totalResults,
  params,
  summary,
}: {
  current: number;
  totalPages: number;
  totalResults: number;
  /**
   * `q`, `tag` and `sort` as they stand, already serialised, so a page change
   * keeps the search it was made in.
   */
  params: string;
  /** What is being counted: "of 163", or "of 31 tagged “Weeknight”". */
  summary: string;
}) {
  // A single page of results has nothing to say about itself, so it says
  // nothing: no rule, no range line, no control.
  if (totalPages <= 1) return null;

  const { first, last } = pageRange(current, totalResults);

  return (
    <Box component="nav" aria-label="Recipe pages" sx={{ mt: "64px" }}>
      <Stack
        direction="row"
        sx={{
          alignItems: "center",
          justifyContent: "space-between",
          gap: { xs: 2, sm: 4 },
          pt: "22px",
          borderTop: 1,
          borderColor: "text.primary",
        }}
      >
        <Step
          page={current - 1}
          current={current}
          total={totalPages}
          params={params}
        />

        {/*
         * Seven numbers at a 44px touch target do not fit 393px, so below `sm`
         * the numbers give way to the two ends and a plain statement of where
         * you are. The range line underneath carries the rest.
         */}
        <Box
          sx={{
            ...pageNumberSx(false),
            display: { xs: "block", sm: "none" },
            fontSize: "13px",
            borderBottom: 0,
            pb: 0,
            whiteSpace: "nowrap",
          }}
        >
          Page {current} of {totalPages}
        </Box>

        <Stack
          direction="row"
          sx={{
            display: { xs: "none", sm: "flex" },
            alignItems: "baseline",
            gap: "26px",
          }}
        >
          {pageWindow(current, totalPages).map((entry, index) =>
            entry === "gap" ? (
              // Decoration standing in for a run of pages, not a control -
              // so it is hidden from anything reading the row out loud.
              <Box
                key={`gap-${index}`}
                component="span"
                aria-hidden
                sx={PAGE_GAP_SX}
              >
                &hellip;
              </Box>
            ) : (
              <PageNumber
                key={entry}
                page={entry}
                current={current}
                params={params}
              />
            ),
          )}
        </Stack>

        <Step
          page={current + 1}
          current={current}
          total={totalPages}
          params={params}
        />
      </Stack>

      {/*
       * The sentence that makes the eyebrow's count honest: that many dishes
       * in the box, these ones on the page.
       */}
      <Box
        sx={{
          ...PAGE_RANGE_SX,
          mt: "18px",
          textAlign: "center",
          fontSize: { xs: "18px", md: "20px" },
        }}
      >
        Dishes {first}&ndash;{last} {summary}
      </Box>
    </Box>
  );
}

/** Build the href for a page, keeping the search and dropping `page` on one. */
function hrefFor(page: number, params: string): string {
  const next = new URLSearchParams(params);
  // Page one is the canonical /recipes, so it never carries the parameter.
  if (page <= 1) next.delete("page");
  else next.set("page", String(page));
  const query = next.toString();
  return query ? `/recipes?${query}` : "/recipes";
}

/**
 * Previous and Next, which stay put at the ends.
 *
 * Rendered as inert text rather than removed, so the row does not change width
 * when you reach the first or last page and the numbers do not jump under the
 * cursor. WCAG exempts inactive controls from the contrast minimum, which is
 * the one place `text.disabled` is used deliberately rather than by oversight.
 */
function Step({
  page,
  current,
  total,
  params,
}: {
  page: number;
  current: number;
  total: number;
  params: string;
}) {
  const back = page < current;
  const label = back ? "← Previous" : "Next →";
  const inert = page < 1 || page > total;

  const sx = {
    ...PAGE_STEP_SX,
    minWidth: { xs: 0, md: 200 },
    textAlign: back ? "left" : "right",
  } as const;

  if (inert) {
    return (
      <Box component="span" aria-hidden sx={{ ...sx, color: "text.disabled" }}>
        {label}
      </Box>
    );
  }

  return (
    <Link
      href={hrefFor(page, params)}
      rel={back ? "prev" : "next"}
      style={{ textDecoration: "none" }}
    >
      <Box
        component="span"
        sx={{
          ...sx,
          display: "block",
          color: back ? "text.soft" : "text.primary",
          "&:hover": { color: "secondary.main" },
        }}
      >
        {label}
      </Box>
    </Link>
  );
}

function PageNumber({
  page,
  current,
  params,
}: {
  page: number;
  current: number;
  params: string;
}) {
  const here = page === current;

  return (
    <Link
      href={hrefFor(page, params)}
      aria-label={`Page ${page}`}
      aria-current={here ? "page" : undefined}
      style={{ textDecoration: "none" }}
    >
      <Box component="span" sx={{ display: "block", ...pageNumberSx(here) }}>
        {page}
      </Box>
    </Link>
  );
}

"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import InputBase from "@mui/material/InputBase";
import Menu from "@mui/material/Menu";
import type { Theme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import MenuItem from "@mui/material/MenuItem";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { RECIPE_SORTS, type RecipeSort } from "@/lib/recipe-sort";

/**
 * One line: what you are looking for, and the order to show it in.
 *
 * Search state lives in the URL so a filtered view can be linked and survives a
 * reload. Typing is debounced to avoid a query per keystroke.
 *
 * The field has no box - just the rule it shares with the sort control, which
 * is the point of the treatment: at 26px serif italic the placeholder is an
 * invitation rather than a form field, and "What are you in the mood for?" only
 * works if it does not look like something to fill in.
 *
 * The tag chips that used to sit below this have moved behind the Filters
 * control in the page header; the collections row covers the common ways in.
 */
export function RecipeSearchBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  /**
   * A phone cannot hold the long invitation and the sort control on one line,
   * and letting it truncate produces "What are you in the mood f" - which was
   * tried, and reads as a bug rather than as a shortened phrase. The short
   * form says the same thing.
   *
   * Resolved after mount rather than with `noSsr`. The server has no viewport,
   * so `noSsr` makes the client's first render disagree with the HTML it is
   * hydrating - a real mismatch, spent on a placeholder. This way the first
   * paint carries the long string and a phone swaps it a frame later.
   */
  const compact = useMediaQuery((theme: Theme) => theme.breakpoints.down("sm"));

  const sort = (searchParams.get("sort") ?? "newest") as RecipeSort;
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [sortAnchor, setSortAnchor] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const current = searchParams.get("q") ?? "";
    if (query === current) return;

    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      // A new search starts at its beginning. Without this, changing the
      // query from page 4 asks for page 4 of a two-page result, and the
      // grid comes back empty - the classic bug in this pattern, and these
      // two components are the only places it can happen.
      params.delete("page");
      if (query) params.set("q", query);
      else params.delete("q");
      router.replace(`${pathname}?${params.toString()}`);
    }, 250);

    return () => clearTimeout(timer);
  }, [query, pathname, router, searchParams]);

  function setSort(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    // A new search starts at its beginning. Without this, changing the
    // query from page 4 asks for page 4 of a two-page result, and the
    // grid comes back empty - the classic bug in this pattern, and these
    // two components are the only places it can happen.
    params.delete("page");
    // The default stays out of the URL, so a plain /recipes link is the
    // ordinary view rather than a view someone happened to configure.
    if (next === "newest") params.delete("sort");
    else params.set("sort", next);
    router.replace(`${pathname}?${params.toString()}`);
    setSortAnchor(null);
  }

  const sortLabel =
    RECIPE_SORTS.find((option) => option.value === sort)?.label ??
    "Newest first";

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        flexWrap: "nowrap",
        columnGap: 1.5,
        rowGap: 1,
        // The emphatic rule rather than the hairline: this one separates the
        // way in from the library, not one row from the next.
        borderBottom: "1px solid",
        borderColor: "text.primary",
        pb: "14px",
        mb: "22px",
      }}
    >
      <InputBase
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={
          compact ? "In the mood for?" : "What are you in the mood for?"
        }
        // The placeholder says what the field is for, and a visible label above
        // it would undo the treatment.
        inputProps={{ "aria-label": "Search recipes" }}
        sx={{
          flex: 1,
          minWidth: 0,
          // Serif, taken from the variant rather than a restated font stack.
          fontFamily: (theme) => theme.typography.body1.fontFamily,
          fontSize: { xs: "1.25rem", md: "1.625rem" },
          color: "text.primary",
          "& input::placeholder": {
            fontStyle: "italic",
            color: (theme) => theme.palette.text.disabled,
            // Browsers dim placeholders by default, which on this palette
            // leaves it almost invisible.
            opacity: 1,
          },
        }}
      />

      <Button
        onClick={(e) => setSortAnchor(e.currentTarget)}
        aria-haspopup="listbox"
        sx={{
          flexShrink: 0,
          whiteSpace: "nowrap",
        }}
      >
        {sortLabel} ↓
      </Button>
      <Menu
        anchorEl={sortAnchor}
        open={Boolean(sortAnchor)}
        onClose={() => setSortAnchor(null)}
      >
        {RECIPE_SORTS.map((option) => (
          <MenuItem
            key={option.value}
            selected={option.value === sort}
            onClick={() => setSort(option.value)}
          >
            {option.label}
          </MenuItem>
        ))}
      </Menu>
    </Box>
  );
}

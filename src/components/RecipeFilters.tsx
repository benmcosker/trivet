"use client";

import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import type { TagCount } from "@/lib/collections";

/**
 * The whole tag vocabulary, one click away.
 *
 * It used to be a wall of sixty chips above the grid, which pushed the first
 * recipe below the fold and cost that space on every visit - including the
 * majority where nobody filters by tag at all. Six named collections cover the
 * common ways in; this is where the rest went.
 *
 * Toggling writes `?tag=` exactly as the chips always did, so a filtered view
 * is still linkable and the back button still works.
 */
export function RecipeFilters({ tags }: { tags: TagCount[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);

  const activeTags = searchParams.getAll("tag");

  function toggleTag(slug: string) {
    const params = new URLSearchParams(searchParams.toString());
    // A new filter starts at its beginning; see RecipeSearchBar.
    params.delete("page");
    const next = activeTags.includes(slug)
      ? activeTags.filter((t) => t !== slug)
      : [...activeTags, slug];

    params.delete("tag");
    for (const tag of next) params.append("tag", tag);
    router.replace(`${pathname}?${params.toString()}`);
  }

  function clearTags() {
    const params = new URLSearchParams(searchParams.toString());
    // A new filter starts at its beginning; see RecipeSearchBar.
    params.delete("page");
    params.delete("tag");
    router.replace(`${pathname}?${params.toString()}`);
  }

  // What the button says depends on whether it is doing anything: the tag count
  // is context, the active count is state, and the second matters more.
  const label =
    activeTags.length > 0
      ? `Filters · ${activeTags.length} on`
      : `Filters · ${tags.length} tags`;

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        sx={{
          flexShrink: 0,
          whiteSpace: "nowrap",
          borderBottom: "1px solid",
          borderColor: "divider",
          borderRadius: 0,
          pb: "4px",
          // The rule should hug the words, not sit at the bottom of a button.
          px: 0,
          color: activeTags.length > 0 ? "text.primary" : "text.secondary",
        }}
      >
        {label}
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        fullWidth
        maxWidth="sm"
        aria-labelledby="recipe-filters-title"
      >
        <DialogTitle id="recipe-filters-title" variant="h4">
          Filter by tag
        </DialogTitle>
        <DialogContent>
          {tags.length === 0 ? (
            <Typography color="text.secondary">
              No tags yet. They arrive with the recipes.
            </Typography>
          ) : (
            <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1, pt: 1 }}>
              {tags.map((tag) => {
                const active = activeTags.includes(tag.slug);
                return (
                  <Chip
                    key={tag.slug}
                    label={`${tag.name} (${tag.count})`}
                    onClick={() => toggleTag(tag.slug)}
                    color={active ? "primary" : "default"}
                    variant={active ? "filled" : "outlined"}
                    size="small"
                    aria-pressed={active}
                  />
                );
              })}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={clearTags} disabled={activeTags.length === 0}>
            Clear
          </Button>
          <Button
            variant="contained"
            color="ink"
            onClick={() => setOpen(false)}
          >
            Done
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

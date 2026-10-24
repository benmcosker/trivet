"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import InputBase from "@mui/material/InputBase";
import Menu from "@mui/material/Menu";
import type { Theme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import MenuItem from "@mui/material/MenuItem";
import Typography from "@mui/material/Typography";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { RECIPE_SORTS, type RecipeSort } from "@/lib/recipe-sort";

/** So the shelf label and the field are a real label/control pair. */
const FIELD_ID = "recipe-search";

/**
 * One line: what you are looking for, and the order to show it in.
 *
 * Search state lives in the URL so a filtered view can be linked and survives a
 * reload. Typing is debounced to avoid a query per keystroke.
 *
 * ## Why this row did not read as a search
 *
 * The owner of the app asked for a search on this page while looking straight
 * at one. The field was there and it was invisible to him, and the reason was
 * not a missing icon.
 *
 * This page speaks in two voices. Serif at content scale is the library - the
 * `h1`, the dish titles, the collection names. Small uppercase Karla is
 * everything you can operate - Filters, New recipe, the sort, the pagination,
 * the "Collections" shelf label. The field was rendered entirely in the first
 * voice and placed where a standfirst goes: directly under the `h1`, full
 * measure, italic. So the eye filed it as the deck under a title. The only
 * Karla on the line belonged to the sort control, off at the right, which read
 * as a caption annotating the phrase rather than as the field's neighbour. And
 * one rule ran the whole width underneath both of them, which is the shape of
 * a masthead rule, not of a field.
 *
 * So the fix is not to restyle the field. It is to re-file the row into the
 * other voice, leaving the field's own typography alone:
 *
 * - **The row is addressed.** A `Search` shelf label leads it, in the same
 *   overline the collections row below uses for `Collections`, so the two rows
 *   read as a matched pair of ways in. It is beside the field, not above it: a
 *   label stacked over this would turn the invitation into a form field, which
 *   is the thing the treatment exists to avoid. Beside it, it is the page's
 *   own grammar for "label, then the things" - and it is a real `<label>`, so
 *   the word itself puts the caret in the field.
 * - **The rule belongs to the field.** It moved off the row container onto the
 *   field's own zone, which it now shares with the label and nothing else.
 *   Stopping where the field stops is what makes it an underline rather than a
 *   section divider - the least box that still says "you can write on this
 *   line". The sort keeps a hairline of its own, the one `RecipeFilters`
 *   already wears, so the two controls that narrow and order the library look
 *   like each other instead of like the field.
 *
 * A magnifying glass was the obvious alternative and is wrong twice over. It
 * answers "what is this for", which the placeholder already answers in words,
 * rather than "can I type here", which is what was missing. And it would be
 * the only drawn icon on a page built from type and hairlines, so it would
 * read as an ornament on a phrase - the same misfiling in a new costume.
 *
 * Hover and focus do move the label, but they are the reward, not the signal:
 * an affordance that appears only once you are already pointing at the thing
 * is no use to somebody who cannot find it.
 *
 * ## Why the query can be undone, and by a word
 *
 * A search was a one-way door. `RecipeFilters` has carried a Clear since it
 * was built, so the two controls that narrow the same library disagreed about
 * whether narrowing is reversible: the tags could be put back, the query had
 * to be deleted a character at a time.
 *
 * The conventional control is an ✕ in the corner of the field, and it was
 * weighed on its merits rather than waved off by the paragraph above. It wins
 * on two things - everybody already knows it, and it costs almost no width -
 * and the row is not short of width at 360 once the long placeholder has been
 * replaced by somebody's own four or five characters. It loses on three.
 *
 * The first is the one that decides it: **the page already owns a word for
 * this act.** The tag dialog says `Clear`. Spelling the same act two ways,
 * once as a word and once as a mark, is two vocabularies for one idea, and
 * the mark is the half nobody can read back to you. Second, it is the weaker
 * state label, and that matters more here than it usually would - this is the
 * only thing on the page that says a search is running at all. An ✕ says
 * "remove"; it does not say what is on. Third, a 10px mark at the end of a
 * line is a poor target, where the word is 43px wide and legible across the
 * room, which is the posture this app is read in.
 *
 * The no-drawn-marks argument above is real and points the same way - an ✕
 * would be the only such mark on a page built from type and hairlines - but
 * it is the supporting argument, not the load-bearing one. If this row had no
 * room for a word, the ✕ would be the right answer and the prior would
 * have to give. It has the room. So: `Clear`, in the overline the rest of the
 * row's machinery is set in.
 *
 * **Two Clears, one rule: each empties the box it is drawn inside.** The
 * dialog's sits under the tag chips and clears the tags. This one sits inside
 * the field's own rule, between the label and the end of that rule, and clears
 * the field. Neither reaches past its own edge - which is why this one leaves
 * an active collection alone. The tags can already be put back from two places
 * in plain sight: the collections row shows the live one with a dark rule and
 * untoggles it, and the dialog has its own Clear. The query had nowhere. One
 * control that swept away both would be the only thing on the page that
 * undoes something you cannot see it pointing at.
 *
 * **It appears only when there is something to clear**, which is where it
 * parts company with the Filters button. That button is always there because
 * it is also the way in to the tags; a dialog's action row is a fixed panel
 * and a button vanishing out of it would make the row jump. This is neither.
 * It is also, as it happens, the page's only mark that a search is running:
 * the collections row goes on offering six other ways in regardless, and
 * nothing else changes. A greyed word in the resting state would spend that
 * signal to buy symmetry with a control behind a dialog.
 *
 * Clearing goes through `query` state like every keystroke does, so it takes
 * the same debounced path to the URL and gets `page` deleted with it. Focus
 * returns to the field, because the control removes itself the moment it
 * works and focus would otherwise fall to the document.
 *
 * `Escape` does the same thing while the field has focus. It is where a
 * desktop hand goes first and it costs two lines, but nothing advertises it,
 * and a phone has no Escape key - so it is the second way, not the way.
 * Likewise the hover that darkens the label: a reward for already pointing at
 * the row, never the signal.
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
   * The shelf label now spends about 53px of that line, so the sort control
   * collapses to its `short` label here for the same reason and under the same
   * rule: say it in fewer words rather than say half of it. At 360px - the
   * narrowest width worth drawing for - the collapsed sort buys back about
   * 55px against the label's 53, so the placeholder has no less room than it
   * had before any of this.
   *
   * Resolved after mount rather than with `noSsr`. The server has no viewport,
   * so `noSsr` makes the client's first render disagree with the HTML it is
   * hydrating - a real mismatch, spent on a placeholder. This way the first
   * paint carries the long strings and a phone swaps them a frame later.
   */
  const compact = useMediaQuery((theme: Theme) => theme.breakpoints.down("sm"));

  const sort = (searchParams.get("sort") ?? "newest") as RecipeSort;
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [sortAnchor, setSortAnchor] = useState<HTMLElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  /**
   * Empty the field and put the caret back in it.
   *
   * Only the state is touched: the effect below is the one path to the URL,
   * so clearing cannot forget to drop `page` the way a second writer would.
   * The focus call runs before React commits the removal of the button that
   * called it, so focus lands on the field rather than on the document.
   */
  function clearQuery() {
    inputRef.current?.focus();
    setQuery("");
  }

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

  const chosen = RECIPE_SORTS.find((option) => option.value === sort);
  const sortName = chosen?.label ?? "Newest first";
  const sortLabel = compact ? (chosen?.short ?? "Newest") : sortName;

  return (
    <Box
      sx={{
        display: "flex",
        // Each rule is the bottom edge of its own box now, so ending the two
        // controls on one line is what lines the two rules up.
        alignItems: "flex-end",
        flexWrap: "nowrap",
        columnGap: 1.5,
        mb: { xs: "18px", md: "22px" },
      }}
    >
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          // The 11px label sits on the serif's baseline rather than halfway up
          // a 26px line.
          alignItems: "baseline",
          columnGap: { xs: "10px", md: "14px" },
          // The rule the field owns, and the reason it is here rather than on
          // the row: across the whole row it was a divider under a title, and
          // it read as one.
          borderBottom: "1px solid",
          borderColor: "text.primary",
          pb: "12px",
          // The field is the whole zone, not just the glyphs in it.
          cursor: "text",
          "&:hover > label, &:focus-within > label": { color: "text.primary" },
        }}
      >
        {/*
         * The shelf label, matching "Collections" one row down. A real
         * <label>, so the word is a click target; the accessible name is still
         * the fuller "Search recipes" on the input, which this prefixes.
         */}
        <Typography
          component="label"
          htmlFor={FIELD_ID}
          variant="overline"
          sx={{
            flexShrink: 0,
            color: "text.secondary",
            cursor: "pointer",
            transition: "color 120ms",
          }}
        >
          Search
        </Typography>

        <InputBase
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          inputRef={inputRef}
          onKeyDown={(e) => {
            if (e.key !== "Escape" || !query) return;
            // Browsers otherwise let Escape bubble, and a search input in
            // Safari treats it as "revert to the last committed value".
            e.preventDefault();
            clearQuery();
          }}
          placeholder={
            compact ? "In the mood for?" : "What are you in the mood for?"
          }
          inputProps={{ id: FIELD_ID, "aria-label": "Search recipes" }}
          sx={{
            flex: 1,
            minWidth: 0,
            // The field's zone owns the padding above its rule; the input
            // must not add a second helping of it.
            p: 0,
            // Serif, taken from the variant rather than a restated font stack.
            fontFamily: (theme) => theme.typography.body1.fontFamily,
            fontSize: { xs: "1.25rem", md: "1.625rem" },
            color: "text.primary",
            "& input::placeholder": {
              fontStyle: "italic",
              /*
               * `text.secondary`, not `text.disabled`.
               *
               * This was disabled, which measures 3.85:1. That clears the 3:1
               * large-text threshold at `md`, where the field is 26px - but the
               * size above steps down to 20px at `xs`, and 20px non-bold is not
               * large text, so the compact string needed 4.5 and did not have
               * it. Secondary measures 4.73 at both sizes.
               *
               * The placeholder is no longer the only thing naming this field -
               * the label beside it is - but it is still the only thing saying
               * what to put in it, and it stays at the measured colour.
               */
              color: "text.secondary",
              // Browsers dim placeholders by default, which on this palette
              // leaves it almost invisible.
              opacity: 1,
            },
          }}
        />
        {/*
         * Inside the field's rule, at the far end of it - the label names the
         * zone from one side and this empties it from the other, and the rule
         * under both is what says the two belong to the field rather than to
         * the row. Present only while there is a query, so in the resting
         * state it spends none of the width the placeholder needs, and when
         * it does appear the placeholder is gone anyway.
         */}
        {query ? (
          <ButtonBase
            onClick={clearQuery}
            aria-label="Clear search"
            sx={(theme) => ({
              flexShrink: 0,
              position: "relative",
              // The row's machinery voice, taken from the variant so it can
              // never drift from the Search label beside it.
              ...theme.typography.overline,
              color: "text.secondary",
              transition: "color 120ms",
              "&:hover, &:focus-visible": { color: "text.primary" },
              // The word is 11px on a 38px line; the target it answers to is
              // not. A pseudo-element grows the hit area past 44px without
              // moving the word off the baseline it shares with the label.
              // It grows leftwards, over the empty tail of the field, rather
              // than symmetrically: at 393 the sort control starts 12px to
              // the right and a target that met it would take taps meant for
              // the sort.
              "&::after": {
                content: '""',
                position: "absolute",
                inset: "-16px -2px -16px -22px",
              },
            })}
          >
            Clear
          </ButtonBase>
        ) : null}
      </Box>

      <Button
        onClick={(e) => setSortAnchor(e.currentTarget)}
        aria-haspopup="listbox"
        // The button's text shortens on a phone; its name does not.
        aria-label={`Sort: ${sortName}`}
        sx={{
          flexShrink: 0,
          whiteSpace: "nowrap",
          // The hairline RecipeFilters wears. Sort and Filters do the same
          // kind of work and now look like it.
          borderBottom: "1px solid",
          borderColor: "divider",
          borderRadius: 0,
          // The rule hugs the words rather than sitting at the bottom of a
          // button, and lands level with the field's.
          padding: "6px 0 12px",
          "&:hover": { borderColor: "text.primary" },
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
            {/*
             * Always the full wording. The menu has the room, and choosing
             * between "Newest" and "Oldest" is harder than choosing between
             * the phrases they shorten.
             */}
            {option.label}
          </MenuItem>
        ))}
      </Menu>
    </Box>
  );
}

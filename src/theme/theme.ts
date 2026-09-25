"use client";

import { createTheme, type ThemeOptions } from "@mui/material/styles";

/**
 * The Trivet identity: a modern cookbook rather than a dashboard.
 *
 * Three rules do most of the work, and all three live here rather than in the
 * pages: warm paper instead of white, hairline rules instead of borders and
 * shadows, and square corners everywhere. MUI's default 10px radius on every
 * card, chip, button and input was a large part of what made the app read as
 * generic, so `shape.borderRadius` is 0 and separation comes from whitespace.
 *
 * One theme, both colour schemes. MUI resolves light/dark from the user's
 * system preference via CSS variables, so there is no flash of the wrong theme
 * on first paint and no client-side toggle to hydrate.
 *
 * Dark is the light scheme inverted rather than a neutral charcoal. The browns
 * are what make the light scheme read as paper instead of as a white page, and
 * a true-grey dark mode loses that and reads like a different product - so
 * every value there is warm, the darks carrying a brown cast and the lights a
 * cream one.
 */

declare module "@mui/material/styles" {
  interface TypeText {
    /** Long-form body copy - method steps. Softer than `primary`. */
    soft: string;
    /** Secondary prose: descriptions, values in a metadata row. */
    muted: string;
    /** Tertiary text and outlined-chip labels. */
    mutedLight: string;
  }
  interface TypeBackground {
    /** Filled chips, code blocks, avatar fills, empty planner days. */
    raised: string;
    /** Photo-placeholder stripe, light band. */
    stripeA: string;
    /** Photo-placeholder stripe, dark band. */
    stripeB: string;
  }
  interface Palette {
    /** Near-black. Primary buttons and the emphatic rule above a section. */
    ink: Palette["primary"];
    /** For dashed borders: suggested staples, the invite avatar. */
    dividerDashed: string;
  }
  interface PaletteOptions {
    ink?: PaletteOptions["primary"];
    dividerDashed?: string;
  }
}

declare module "@mui/material/Button" {
  interface ButtonPropsColorOverrides {
    ink: true;
  }
}

/**
 * Referenced by name in `sx` where a variant would be the wrong unit of reuse -
 * an ingredient amount inside a row, say. Exported so pages do not each
 * hand-roll the fallback stack.
 */
export const fonts = {
  serif: 'var(--font-newsreader), Georgia, "Times New Roman", serif',
  sans: 'var(--font-karla), system-ui, -apple-system, "Segoe UI", sans-serif',
  mono: 'ui-monospace, Menlo, Monaco, "Cascadia Code", monospace',
} as const;

const { serif, sans } = fonts;

/**
 * Built in two passes so the typography and component overrides can read the
 * breakpoints and the resolved palette instead of restating pixel widths and
 * hexes that would then drift.
 */
const base = createTheme({
  cssVariables: { colorSchemeSelector: "media" },
  shape: { borderRadius: 0 },
  colorSchemes: {
    light: {
      palette: {
        primary: { main: "#2f6f4e" },
        secondary: { main: "#a44a24" },
        // Deliberately the same as `default`. Nothing in this design is a
        // raised surface, so a card that quietly paints itself white would
        // be the one thing on the page breaking the paper.
        background: {
          default: "#f7f4ed",
          paper: "#f7f4ed",
          raised: "#efe9dc",
          stripeA: "#e8e0d0",
          stripeB: "#e1d8c5",
        },
        text: {
          primary: "#1a1815",
          soft: "#2c2820",
          muted: "#4a453c",
          mutedLight: "#6f6a5e",
          secondary: "#746c5c",
          disabled: "#847a69",
        },
        // `light`/`dark` are spelled out rather than left to MUI: custom
        // palette keys skip augmentColor, and Button's contained hover reads
        // `.dark` straight off the palette.
        ink: {
          main: "#1a1815",
          light: "#2c2820",
          dark: "#000000",
          contrastText: "#f7f4ed",
        },
        divider: "#ded7c8",
        dividerDashed: "#cfc6b2",
      },
    },
    dark: {
      palette: {
        // Lighter green and deeper clay than the pair this replaces. On this
        // ground the old #7fc4a0 and #e08a5f measured 9.8 and 8.6, brighter
        // than the light scheme's own accents, and they glowed.
        primary: { main: "#5fae86" },
        secondary: { main: "#e08f63" },
        // `paper` equals `default` here for the same reason it does in light:
        // nothing in this design is a raised surface.
        background: {
          default: "#14110d",
          paper: "#14110d",
          raised: "#1f1a13",
          stripeA: "#1b1710",
          stripeB: "#221d15",
        },
        text: {
          primary: "#f4efe4",
          soft: "#e9e3d6",
          muted: "#cfc7b6",
          mutedLight: "#b3aa99",
          secondary: "#a09788",
          disabled: "#857c6d",
        },
        // `light` and `dark` are not in the handoff table, which gives only
        // `main` and `contrastText`. They follow the light scheme's pattern:
        // one step toward `text.primary` and one toward `text.muted`.
        ink: {
          main: "#e9e3d6",
          light: "#f4efe4",
          dark: "#cfc7b6",
          contrastText: "#14110d",
        },
        divider: "#2e2820",
        dividerDashed: "#403830",
      },
    },
  },
});

const identity: ThemeOptions = {
  typography: {
    fontFamily: sans,

    // Page titles. 76px is a lot of type, and on a phone it is four words a
    // line, so it steps down rather than wrapping "Household" mid-word.
    h1: {
      fontFamily: serif,
      fontWeight: 400,
      fontSize: "4.75rem",
      lineHeight: 0.95,
      letterSpacing: "-0.03em",
      [base.breakpoints.down("sm")]: { fontSize: "3rem" },
    },
    // Section heads: "Ingredients", "Method", "Shopping list".
    h2: {
      fontFamily: serif,
      fontWeight: 400,
      fontSize: "2.125rem",
      lineHeight: 1.15,
      letterSpacing: "-0.02em",
      [base.breakpoints.down("sm")]: { fontSize: "1.75rem" },
    },
    // Card titles in the recipe grid.
    h3: {
      fontFamily: serif,
      fontWeight: 400,
      fontSize: "1.5625rem",
      lineHeight: 1.15,
      letterSpacing: "-0.015em",
    },
    // Panel headings: "Add a staple".
    h4: {
      fontFamily: serif,
      fontWeight: 400,
      fontSize: "1.625rem",
      lineHeight: 1.2,
      letterSpacing: "-0.015em",
    },
    h5: {
      fontFamily: serif,
      fontWeight: 400,
      fontSize: "1.3125rem",
      lineHeight: 1.25,
    },
    h6: {
      fontFamily: serif,
      fontWeight: 400,
      fontSize: "1.1875rem",
      lineHeight: 1.3,
    },

    // The lede: a recipe's description, the pantry intro.
    subtitle1: {
      fontFamily: serif,
      fontWeight: 300,
      fontStyle: "italic",
      fontSize: "1.5rem",
      lineHeight: 1.5,
      [base.breakpoints.down("sm")]: { fontSize: "1.25rem" },
    },
    subtitle2: {
      fontFamily: sans,
      fontWeight: 600,
      fontSize: "0.8125rem",
      letterSpacing: "0.03em",
    },

    // Prose is serif; data is not. `body2` is the app's metadata workhorse -
    // times, counts, servings - so it stays on Karla.
    body1: {
      fontFamily: serif,
      fontWeight: 400,
      fontSize: "1.0625rem",
      lineHeight: 1.55,
    },
    body2: {
      fontFamily: sans,
      fontWeight: 400,
      fontSize: "0.8125rem",
      lineHeight: 1.55,
      letterSpacing: "0.03em",
    },

    button: {
      fontFamily: sans,
      fontWeight: 700,
      fontSize: "0.75rem",
      letterSpacing: "0.14em",
      textTransform: "uppercase",
    },
    caption: {
      fontFamily: sans,
      fontWeight: 400,
      fontSize: "0.78125rem",
      lineHeight: 1.7,
      letterSpacing: "0.04em",
    },
    // The clay eyebrow above a page title. Colour is per-use; the metrics are not.
    overline: {
      fontFamily: sans,
      fontWeight: 700,
      fontSize: "0.6875rem",
      lineHeight: 1.4,
      letterSpacing: "0.18em",
      textTransform: "uppercase",
    },
  },

  components: {
    /*
     * Every colour below is read off `theme.vars`, never `theme.palette`.
     *
     * This theme emits CSS variables and resolves the scheme with a media
     * query, which means a component override runs once, at build time, with
     * no way of knowing which scheme it will be painted in. `theme.palette`
     * there is the *light* palette, already resolved to a hex, so
     * `color: theme.palette.text.secondary` compiles to `color: #746c5c` and
     * stays that colour in the dark. `theme.vars.palette` gives the variable
     * instead - `var(--mui-palette-text-secondary)` - which the media query
     * redefines, so the rule follows the scheme.
     *
     * It fails quietly, which is why it is worth the paragraph: the light
     * scheme looks right, the build is clean, and only a contrast reading in
     * dark shows outlined buttons at 1.9:1 and text buttons at 3.6:1.
     */
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        contained: { padding: "14px 22px" },
        outlined: ({ theme }) => ({
          padding: "13px 20px",
          borderColor: theme.vars.palette.divider,
          color: theme.vars.palette.text.muted,
          "&:hover": {
            borderColor: theme.vars.palette.text.primary,
            color: theme.vars.palette.text.primary,
            backgroundColor: "transparent",
          },
        }),
        text: ({ theme }) => ({
          padding: "6px 2px",
          color: theme.vars.palette.text.secondary,
          "&:hover": {
            color: theme.vars.palette.text.primary,
            backgroundColor: "transparent",
          },
        }),
        sizeSmall: { fontSize: "0.6875rem", letterSpacing: "0.12em" },
      },
    },

    // Outlined by default and flat: the separation these designs use is a
    // hairline and whitespace, never a shadow.
    MuiCard: {
      defaultProps: { variant: "outlined", elevation: 0 },
    },

    MuiChip: {
      styleOverrides: {
        // No text-transform here on purpose. Chips carry tags, pantry items
        // and timings, and only the tags are uppercase in the design.
        //
        // The radius is spelled out because Chip is the one component that
        // hard-codes its own: MUI sets 16px on the root rather than reading
        // `shape.borderRadius`, so a pill survives the square-corner rule
        // unless it is overridden here.
        root: { borderRadius: 0, fontFamily: sans, letterSpacing: "0.06em" },
        outlined: ({ theme }) => ({
          borderColor: theme.vars.palette.divider,
          color: theme.vars.palette.text.mutedLight,
        }),
        filled: ({ theme }) => ({
          backgroundColor: theme.vars.palette.background.raised,
          color: theme.vars.palette.text.primary,
        }),
      },
    },

    MuiTextField: { defaultProps: { size: "small" } },

    // Field text is serif - it is the thing you wrote, and the search field's
    // "What are you in the mood for?" is Newsreader by design. The label
    // naming the field is machinery, so it stays on Karla.
    MuiFormLabel: {
      styleOverrides: { root: { fontFamily: sans, letterSpacing: "0.03em" } },
    },

    MuiLink: {
      defaultProps: { underline: "none" },
      styleOverrides: {
        root: ({ theme }) => ({
          color: theme.vars.palette.primary.main,
          "&:hover": { color: theme.vars.palette.secondary.main },
        }),
      },
    },

    MuiAppBar: {
      defaultProps: { elevation: 0, color: "transparent" },
    },

    // A bare <a> - one written by hand rather than through MuiLink - would
    // otherwise arrive in the browser's blue and underlined, which is the
    // loudest thing on a page made of paper and hairlines. Element selector,
    // so any component that sets its own colour still wins.
    MuiCssBaseline: {
      styleOverrides: ({ vars }) => ({
        a: {
          color: vars.palette.primary.main,
          textDecoration: "none",
          "&:hover": { color: vars.palette.secondary.main },
        },

        /*
         * What a page looks like on paper.
         *
         * `data-print` marks the two halves: "hide" is on screen and not on
         * paper, "only" is the reverse. Data attributes rather than class
         * names to match `data-ingredient` - a class on a MUI component is one
         * `className` prop away from being overwritten, and these have to
         * survive.
         *
         * The ground goes white and the ink black because this design is
         * built on warm paper, and warm paper prints as a full page of beige
         * at the cost of a cartridge. The scheme is pinned to light for the
         * same reason: printing at night from a dark-mode browser should not
         * produce a black page.
         */
        /*
         * A dish photo travelling between the library and its recipe.
         *
         * `RecipePhoto` names both ends, React pairs them, and the browser
         * animates one into the other. Everything below is tuning: without a
         * line of this the morph still works, and in a browser that does not
         * support view transitions the pages simply swap as they always did.
         *
         * The blur covers pixel interpolation while a 230px card stretches to
         * a 380px header. 400ms is long enough to read as one object moving
         * and short enough not to feel like waiting.
         */
        "::view-transition-group(.morph)": { animationDuration: "400ms" },
        "::view-transition-image-pair(.morph)": {
          animationName: "photo-morph",
        },
        "@keyframes photo-morph": { "30%": { filter: "blur(3px)" } },

        /*
         * The transition overlay swallows clicks for as long as it runs. On a
         * grid of 24 photographs that is a click lost to an animation nobody
         * asked to wait for.
         */
        "::view-transition": { pointerEvents: "none" },

        /*
         * Motion is the decoration here, not the information: with durations
         * at zero the pages swap instantly, which is what they did before any
         * of this existed.
         */
        "@media (prefers-reduced-motion: reduce)": {
          "::view-transition-group(*), ::view-transition-old(*), ::view-transition-new(*)":
            {
              animationDuration: "0s !important",
              animationDelay: "0s !important",
            },
        },

        "[data-print='only']": { display: "none" },

        "@media print": {
          ":root": { colorScheme: "light" },
          body: { background: "#fff", color: "#000" },
          // The site chrome. A shopping list does not need branding, and the
          // ink is better spent on the list.
          "header, footer": { display: "none !important" },
          // The page's own margins are the printer's job from here.
          main: { padding: "0 !important", maxWidth: "none !important" },
          "[data-print='hide']": { display: "none !important" },
          "[data-print='only']": { display: "block !important" },
        },
      }),
    },
  },
};

export const theme = createTheme(base, identity);

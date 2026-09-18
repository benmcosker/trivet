"use client";

import CloseIcon from "@mui/icons-material/Close";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Grid from "@mui/material/Grid";
import IconButton from "@mui/material/IconButton";
import CardActionArea from "@mui/material/CardActionArea";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useState, useTransition } from "react";

import {
  sendWeekToProviderAction,
  setPlannedMealAction,
  textShoppingListAction,
  type TextListActionResult,
} from "@/app/plan/actions";
import type { MealSlot, ShoppingProvider } from "@/generated/prisma/enums";
import { groupBySection } from "@/lib/grocery-sections";
import { DINNER_SLOTS, FIRST_DINNER, SIDE_SLOTS } from "@/lib/meal-slots";
import { providerNotes } from "@/lib/provider-notes";
import { recipeMetaParts, splitTitle } from "@/lib/recipe-meta";
import type { GroceryLine, WeeklySkipRecord } from "@/lib/grocery";
import type { HandoffResult, ProviderInfo } from "@/lib/shopping";

import { addToPantryAction, skipForWeekAction } from "@/app/plan/skip-actions";
import { removeExtraItemAction } from "@/app/plan/extra-actions";
import { formatAmount } from "@/lib/shopping/format";
import { fonts } from "@/theme/theme";

import { RecipePickerDialog } from "./RecipePickerDialog";
import { SideSuggestionDialog } from "./SideSuggestionDialog";
import { RecipePhoto } from "./RecipePhoto";
import { PaperNote } from "./PaperNote";
import { RecipePlaceholder } from "./RecipePlaceholder";
import type { TileRecipe } from "./RecipeTile";
import { ShoppingHandoffPanel } from "./ShoppingHandoffPanel";
import type { PantryItemRecord } from "@/lib/pantry";

import { AddExtraItem } from "./AddExtraItem";
import { ExcludedIngredients } from "./ExcludedIngredients";

/**
 * An evening holds up to three mains and a side.
 *
 * Driven by the ordered lists in meal-slots.ts rather than named constants, so
 * a fourth dinner is an enum value and a line in that file - not another edit
 * to this component.
 *
 * The first dinner gets the photo tile; the rest render as compact rows. At
 * `xs` a day tile is about 180px wide, and three equal photo tiles in that
 * space is unreadable - they are peers in the data and in the shopping list,
 * but one of them is the one you see from across the room.
 */
const SIDE_SLOT = SIDE_SLOTS[0];
const DAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

type PlannedMeal = {
  date: string;
  slot: MealSlot;
  recipeId: string | null;
  servings: number;
  title: string | null;
};

/**
 * The picture, and the box that stands in for it on an empty evening.
 *
 * One number for both so that a half-planned week keeps a single baseline down
 * the row: seven cells that step up and down by twenty pixels read as seven
 * different things rather than as one week.
 */
const DAY_PHOTO_HEIGHT = 126;

/**
 * Month names spelled out here rather than read from `toLocaleDateString`.
 *
 * The page is rendered twice, once on the server and once in the browser, and
 * the two only agree about `Intl` if they were built against the same ICU
 * data. A header that says "September" on one pass and "Sept" on the other is
 * a hydration mismatch, and this app has exactly one locale.
 */
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "14-20 September", or "28 September - 4 October" when it straddles one. */
function formatWeekRange(startIso: string): string {
  const endIso = addDaysIso(startIso, 6);
  const [, startMonth, startDay] = startIso.split("-").map(Number);
  const [, endMonth, endDay] = endIso.split("-").map(Number);

  // The year is left off on purpose: the page is about the week you are in,
  // and "2026" in an eyebrow is the sort of precision nobody asked for.
  return startMonth === endMonth
    ? `${startDay}–${endDay} ${MONTHS[endMonth - 1]}`
    : `${startDay} ${MONTHS[startMonth - 1]} – ${endDay} ${MONTHS[endMonth - 1]}`;
}

/**
 * Small counts as words, because the summary line is a sentence.
 *
 * Only as far as a week goes; past that nothing in this app counts anything
 * and the digits are honest.
 */
const NUMBER_WORDS = [
  "no",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
];

function inWords(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}

function sentenceCase(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * The week in one sentence: "Six dinners planned, two evenings open."
 *
 * The one thing a seven-column grid cannot say at a glance is how much of it
 * is full - you have to read all seven cells to find out, which is exactly
 * the work a summary is for.
 *
 * Dinners are counted across every dinner slot, so an evening cooking two
 * dishes contributes two; evenings are counted as evenings. The two numbers
 * therefore need not add to seven, and both are true.
 */
function summariseWeek(dinners: number, openEvenings: number): string {
  if (dinners === 0) return "Nothing planned yet.";

  const meals = `${sentenceCase(inWords(dinners))} ${
    dinners === 1 ? "dinner" : "dinners"
  } planned`;

  if (openEvenings === 0) return `${meals}, every evening full.`;

  return `${meals}, ${inWords(openEvenings)} ${
    openEvenings === 1 ? "evening" : "evenings"
  } open.`;
}

/**
 * One of the two week labels, underlined in clay when it is the week you are
 * looking at.
 *
 * The same device as the active item in the top bar and the rule under
 * today's date, which is the whole vocabulary this design has for "you are
 * here". The inactive label carries a transparent border of the same weight
 * so that nothing moves when you switch between them.
 */
function WeekLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Box
      component={Link}
      href={href}
      aria-current={active ? "page" : undefined}
      sx={{
        fontFamily: fonts.sans,
        fontWeight: active ? 700 : 600,
        fontSize: "12px",
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
        color: active ? "text.primary" : "text.secondary",
        pb: "4px",
        borderBottom: 2,
        borderColor: active ? "secondary.main" : "transparent",
        "&:hover": { color: "text.primary" },
      }}
    >
      {label}
    </Box>
  );
}

/**
 * The week and its list, on paper.
 *
 * A second, simpler DOM rather than a print stylesheet over the first one.
 * The screen page is a seven-column grid of photographs with hover controls
 * in it, and every one of those is either invisible on paper or a waste of
 * ink; trying to reason it down to two sheets with `@media print` would
 * mean a rule for each, and a new one every time the page changes.
 *
 * Hidden on screen by `[data-print='only']` in the baseline; the screen half
 * of the page carries `data-print="hide"` and is gone here.
 */
function PrintSheets({
  weekStartIso,
  dinnerCount,
  sideCount,
  groceries,
  pantry,
  byKey,
  recipes,
}: {
  weekStartIso: string;
  dinnerCount: number;
  sideCount: number;
  groceries: GroceryLine[];
  pantry: PantryItemRecord[];
  byKey: Map<string, PlannedMeal>;
  recipes: { id: string; title: string }[];
}) {
  const sections = groupBySection(groceries);

  return (
    <Box
      data-print="only"
      sx={{ color: "#000", fontFamily: fonts.serif, lineHeight: 1.3 }}
    >
      <Box sx={{ breakAfter: "page" }}>
        <PrintHeading
          title="Shopping list"
          // The counts belong on the page you take to the shop: they say how
          // much of the week this is, which is the question you have when
          // the list looks shorter than you expected.
          subtitle={[
            formatWeekRange(weekStartIso),
            dinnerCount > 0
              ? `${dinnerCount} ${dinnerCount === 1 ? "dinner" : "dinners"}`
              : null,
            sideCount > 0
              ? `${sideCount} ${sideCount === 1 ? "side" : "sides"}`
              : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        />

        {sections.map((section) => (
          // Kept whole where a page will take it, so a section head does not
          // print as the last line of a sheet.
          <Box key={section.id} sx={{ mt: "28px", breakInside: "avoid" }}>
            <Box
              sx={{
                fontFamily: fonts.sans,
                fontWeight: 700,
                fontSize: "11px",
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                pb: "7px",
                borderBottom: "1px solid #000",
              }}
            >
              {section.label}
            </Box>

            {section.items.map((line) => (
              <Box
                key={`${line.name}-${line.unit ?? ""}-${line.quantity ?? "x"}`}
                sx={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: "12px",
                  mt: "11px",
                }}
              >
                <Box
                  component="span"
                  aria-hidden
                  sx={{
                    width: 12,
                    height: 12,
                    border: "1.2px solid #000",
                    flexShrink: 0,
                  }}
                />
                {/*
                 * No source line here. Standing in the shop you do not care
                 * which recipe wanted the lemons, and it doubles the length
                 * of the page that has to fit on one sheet.
                 */}
                <Box component="span" sx={{ fontSize: "17px" }}>
                  <Box
                    component="span"
                    sx={{
                      fontFamily: fonts.sans,
                      fontWeight: 700,
                      fontSize: "13px",
                    }}
                  >
                    {formatAmount(line)}
                  </Box>{" "}
                  {line.name}
                </Box>
              </Box>
            ))}
          </Box>
        ))}

        {pantry.length > 0 ? (
          <Box
            sx={{
              mt: "34px",
              pt: "12px",
              borderTop: "1px solid #000",
              fontSize: "15px",
              fontStyle: "italic",
            }}
          >
            Not listed: {pantry.map((item) => item.name).join(", ")}.
          </Box>
        ) : null}
      </Box>

      <Box>
        <PrintHeading
          title="This week"
          subtitle={formatWeekRange(weekStartIso)}
        />

        <Box sx={{ mt: "30px" }}>
          {DAY_NAMES.map((day, index) => {
            const date = addDaysIso(weekStartIso, index);
            const titleOf = (slot: MealSlot) => {
              const meal = byKey.get(`${date}|${slot}`);
              if (!meal) return null;
              return (
                recipes.find((r) => r.id === meal.recipeId)?.title ?? meal.title
              );
            };

            const first = titleOf(FIRST_DINNER);
            const { head, tail } = splitTitle(first ?? "");
            const extras = DINNER_SLOTS.slice(1)
              .map(titleOf)
              .filter((t): t is string => Boolean(t));
            const side = titleOf(SIDE_SLOT);

            return (
              <Box
                key={date}
                sx={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: "18px",
                  py: "14px",
                  borderBottom: "1px solid #000",
                  "&:last-of-type": { borderBottom: 0 },
                  breakInside: "avoid",
                }}
              >
                <Box
                  component="span"
                  sx={{
                    fontFamily: fonts.sans,
                    fontWeight: 700,
                    fontSize: "11px",
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    width: 80,
                    flexShrink: 0,
                  }}
                >
                  {day.slice(0, 3)} {dayOfMonth(date)}
                </Box>

                <Box sx={{ flex: 1, minWidth: 0 }}>
                  {first ? (
                    <>
                      <Box sx={{ fontSize: "18px" }}>
                        {head}
                        {tail ? (
                          <Box component="span" sx={{ fontStyle: "italic" }}>
                            {" "}
                            {tail}
                          </Box>
                        ) : null}
                      </Box>
                      {extras.map((title) => (
                        <Box key={title} sx={{ fontSize: "16px" }}>
                          and {title}
                        </Box>
                      ))}
                      {side ? (
                        <Box sx={{ fontSize: "16px", fontStyle: "italic" }}>
                          with {side}
                        </Box>
                      ) : null}
                    </>
                  ) : (
                    /*
                     * An em dash rather than nothing. A five-day week with
                     * two rows missing reads as a five-day week; seven rows
                     * with two of them open reads as what it is.
                     */
                    <Box sx={{ fontSize: "18px", fontStyle: "italic" }}>
                      &mdash;
                    </Box>
                  )}
                </Box>
              </Box>
            );
          })}
        </Box>
      </Box>
    </Box>
  );
}

/** The rule-and-sub-line both printed sheets open with. */
function PrintHeading({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <>
      <Box
        sx={{
          fontSize: "30px",
          letterSpacing: "-0.02em",
          pb: "12px",
          borderBottom: "1.5px solid #000",
        }}
      >
        {title}
      </Box>
      <Box
        sx={{
          fontFamily: fonts.sans,
          fontSize: "11px",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          mt: "12px",
        }}
      >
        {subtitle}
      </Box>
    </>
  );
}

/** The day header's number: "21", not "09-21" and not "05". */
function dayOfMonth(iso: string): string {
  return String(Number(iso.slice(8)));
}

/**
 * A dish name with its qualifier set in italic: "Zuni Chicken *with Bread
 * Salad*".
 *
 * The same `splitTitle` the recipe hero uses, and the one piece of typographic
 * personality a cell this narrow can carry. Clamped at two lines because the
 * photo below it has to start at the same height in all seven cells.
 */
function DishTitle({ title }: { title: string }) {
  const { head, tail } = splitTitle(title);

  return (
    <Box
      sx={{
        fontFamily: fonts.serif,
        fontWeight: 400,
        fontSize: "18px",
        lineHeight: 1.2,
        letterSpacing: "-0.01em",
        color: "text.primary",
        textWrap: "pretty",
        display: "-webkit-box",
        WebkitLineClamp: 2,
        WebkitBoxOrient: "vertical",
        overflow: "hidden",
      }}
    >
      {head}
      {tail ? (
        <Box component="span" sx={{ fontStyle: "italic", fontWeight: 300 }}>
          {" "}
          {tail}
        </Box>
      ) : null}
    </Box>
  );
}

/**
 * "SERVES 4 · 1 HR 30".
 *
 * Servings come from the planned meal rather than the recipe: the week is
 * where a dish gets scaled, and a cell claiming "serves 4" beside a meal
 * cooked for six is the planner disagreeing with the shopping list.
 *
 * The separator is marked `aria-hidden` for the same reason `RecipeMetaLine`
 * hides its own: it is punctuation between two facts, not a word.
 */
function DishMeta({ parts }: { parts: string[] }) {
  if (parts.length === 0) return null;

  return (
    <Box
      sx={{
        display: "flex",
        flexWrap: "wrap",
        gap: "6px",
        fontFamily: fonts.sans,
        fontWeight: 600,
        fontSize: "10.5px",
        lineHeight: 1.4,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: "text.secondary",
      }}
    >
      {parts.map((part, index) => (
        <Fragment key={part}>
          {index > 0 ? (
            <Box component="span" aria-hidden>
              &middot;
            </Box>
          ) : null}
          <Box component="span">{part}</Box>
        </Fragment>
      ))}
    </Box>
  );
}

/**
 * The small uppercase text that has replaced every button on this page.
 *
 * Shared by "+ Dinner" and the day actions in the grid and by "Got it" and
 * "Always have" in the list, so the page reads as one set of labels rather
 * than several components that happen to look alike. The vertical padding is
 * not decoration: at 10.5px the label alone is a fourteen-pixel tap target,
 * and this brings the row back to twenty-four.
 */
const TEXT_ACTION_SX = {
  px: 0,
  py: "5px",
  minWidth: 0,
  fontFamily: fonts.sans,
  fontWeight: 600,
  fontSize: "10.5px",
  lineHeight: 1.4,
  letterSpacing: "0.12em",
} as const;

function addDaysIso(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function WeekPlanner({
  weekStartIso,
  todayIso,
  thisWeekIso,
  householdName,
  recipes,
  meals,
  groceries,
  skips,
  pantry,
  providers,
  smsAudience,
}: {
  weekStartIso: string;
  /**
   * Kept in the props though nothing reads them any more.
   *
   * The week nav is two labels rather than a pair of arrows, so there is no
   * control that steps backwards - but `?week=` still accepts any Monday, and
   * these are what a "previous week" link would be built from on the day one
   * is wanted.
   */
  prevWeekIso: string;
  nextWeekIso: string;
  /**
   * Which day to mark as today, decided on the server.
   *
   * Read there rather than from `new Date()` here because this component is
   * rendered on both sides: the server is UTC and the browser is not, so a
   * clock read in each place marks a different cell on the evenings either
   * side of midnight - and React calls that a hydration mismatch. The week
   * itself is already chosen against the same UTC clock, so this agrees with
   * which seven days are on screen.
   */
  todayIso: string;
  /** The Monday of the week containing today, so the nav knows which label is live. */
  thisWeekIso: string;
  /** "The McMullens" - the eyebrow says whose week this is. */
  householdName: string;
  recipes: (TileRecipe & {
    servings: number;
    prepMinutes: number | null;
    cookMinutes: number | null;
  })[];
  meals: PlannedMeal[];
  groceries: GroceryLine[];
  skips: WeeklySkipRecord[];
  pantry: PantryItemRecord[];
  providers: ProviderInfo[];
  /** Null when texting is not configured on this deployment. */
  smsAudience: {
    names: string[];
    withoutNumbers: string[];
    withoutConsent: string[];
  } | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [picking, setPicking] = useState<{
    date: string;
    day: string;
    slot: MealSlot;
  } | null>(null);
  const [handoff, setHandoff] = useState<HandoffResult | null>(null);
  /*
   * Which button produced the result on screen, so that provider's standing
   * note can stand down while its own answer is showing.
   */
  const [handoffFrom, setHandoffFrom] = useState<ShoppingProvider | null>(null);
  const [sendingTo, setSendingTo] = useState<ShoppingProvider | null>(null);
  const [sidePicking, setSidePicking] = useState<{
    date: string;
    day: string;
  } | null>(null);
  const [texting, setTexting] = useState(false);
  const [textResult, setTextResult] = useState<TextListActionResult | null>(
    null,
  );

  async function textList() {
    setTexting(true);
    setTextResult(null);
    setTextResult(await textShoppingListAction(weekStartIso));
    setTexting(false);
  }

  const byKey = new Map(meals.map((m) => [`${m.date}|${m.slot}`, m]));

  /*
   * How full the week is, counted once for the summary line and the shopping
   * list's eyebrow. Dinners are counted per dish and evenings per evening, so
   * a Friday cooking two things contributes two dinners and no open evening.
   */
  const dinnerCount = meals.filter((meal) =>
    DINNER_SLOTS.some((slot) => slot === meal.slot),
  ).length;
  const sideCount = meals.filter((meal) =>
    SIDE_SLOTS.some((slot) => slot === meal.slot),
  ).length;
  const openEvenings = DAY_NAMES.filter((_, index) => {
    const date = addDaysIso(weekStartIso, index);
    return !DINNER_SLOTS.some((slot) => byKey.get(`${date}|${slot}`));
  }).length;

  /*
   * "From six dinners and three sides" - what the list below was built out
   * of. Null when the week is empty, because "from no dinners" is a sentence
   * nobody needs above a list that is also empty.
   */
  const listEyebrow =
    dinnerCount === 0 && sideCount === 0
      ? null
      : `From ${[
          dinnerCount > 0
            ? `${inWords(dinnerCount)} ${dinnerCount === 1 ? "dinner" : "dinners"}`
            : null,
          sideCount > 0
            ? `${inWords(sideCount)} ${sideCount === 1 ? "side" : "sides"}`
            : null,
        ]
          .filter(Boolean)
          .join(" and ")}`;

  function assignSlot(date: string, slot: MealSlot, recipeId: string | null) {
    const recipe = recipes.find((r) => r.id === recipeId);
    startTransition(async () => {
      await setPlannedMealAction({
        date,
        slot,
        recipeId,
        servings: recipe?.servings ?? 4,
      });
      router.refresh();
    });
  }

  function gotItThisWeek(name: string) {
    startTransition(async () => {
      await skipForWeekAction(name, weekStartIso);
      router.refresh();
    });
  }

  function removeExtra(id: string) {
    startTransition(async () => {
      await removeExtraItemAction(id);
      router.refresh();
    });
  }

  function alwaysHave(name: string) {
    startTransition(async () => {
      await addToPantryAction(name);
      router.refresh();
    });
  }

  async function sendTo(providerId: ShoppingProvider) {
    setSendingTo(providerId);
    setHandoff(null);

    setHandoff(await sendWeekToProviderAction(weekStartIso, providerId));
    setHandoffFrom(providerId);
    setSendingTo(null);
  }

  /**
   * One line of an evening, under the dish it belongs to.
   *
   * Shared by the second dinners and the side so that the group reads as one
   * indented block rather than as rows that happen to line up. Dinners are set
   * roman and sides italic, which is the same roman/italic split the dish
   * titles use for a qualifier - a side is a qualifier on the evening.
   */
  function CompanionRow({
    slot,
    title,
    day,
    date,
    italic,
  }: {
    slot: MealSlot;
    title: string;
    day: string;
    date: string;
    italic: boolean;
  }) {
    return (
      <Stack
        direction="row"
        sx={{ alignItems: "flex-start", gap: 0.5, minWidth: 0 }}
      >
        <Box
          sx={{
            fontFamily: fonts.serif,
            fontSize: "16px",
            lineHeight: 1.25,
            minWidth: 0,
            // Wrapped rather than clipped. A cell is about 170px and these
            // names are not short, so an ellipsis is the common case rather
            // than the exception - and "with Charred L…" names no dish.
            overflowWrap: "break-word",
            ...(italic
              ? { fontStyle: "italic", fontWeight: 300, color: "text.muted" }
              : { fontWeight: 400, color: "text.soft" }),
          }}
        >
          {italic ? "with" : "and"} {title}
        </Box>
        {/*
         * Kept as an icon here rather than following the footer row into
         * text: this one removes a specific dish, and a word would have to
         * name which - "Remove Focaccia" is wider than the line it sits on.
         * Hidden until the day is approached, like the grocery rows.
         */}
        <Tooltip title={`Remove ${title}`}>
          <IconButton
            size="small"
            className="row-actions"
            aria-label={`Remove ${title} from ${day}`}
            disabled={pending}
            onClick={() => assignSlot(date, slot, null)}
            sx={{
              ml: "auto",
              p: 0.25,
              // Pulled up to sit on the first line of a name that wrapped.
              mt: "-1px",
              flexShrink: 0,
              opacity: { xs: 1, md: 0 },
              transition: "opacity 120ms",
            }}
          >
            <CloseIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>
      </Stack>
    );
  }

  /**
   * The second and third dinners on an evening.
   *
   * Compact rather than a second photo tile: a day tile is about 180px at
   * `xs`, and three of those stacked is a page nobody scrolls. They are peers
   * of the first dinner everywhere it matters - the shopping list scales and
   * merges all three the same way, and each has its own servings - but one
   * dish is the one you recognise from across the room and the others are a
   * line of text.
   */
  function ExtraDinners({ date, day }: { date: string; day: string }) {
    const filled = DINNER_SLOTS.slice(1).filter((slot) =>
      byKey.get(`${date}|${slot}`),
    );

    return (
      <>
        {filled.map((slot) => {
          const meal = byKey.get(`${date}|${slot}`)!;
          const title =
            recipes.find((r) => r.id === meal.recipeId)?.title ?? meal.title;
          if (!title) return null;

          return (
            <CompanionRow
              key={slot}
              slot={slot}
              title={title}
              day={day}
              date={date}
              italic={false}
            />
          );
        })}
      </>
    );
  }

  function SideRow({ date, day }: { date: string; day: string }) {
    const side = byKey.get(`${date}|${SIDE_SLOT}`);
    const sideTitle = side
      ? (recipes.find((r) => r.id === side.recipeId)?.title ?? side.title)
      : null;

    if (!sideTitle) return null;

    return (
      <CompanionRow
        slot={SIDE_SLOT}
        title={sideTitle}
        day={day}
        date={date}
        italic
      />
    );
  }

  /**
   * The dishes an evening carries besides its first dinner, on one left rule.
   *
   * The rule is a visual grouping and nothing more: `SIDE_SLOTS` belongs to
   * the evening rather than to a particular dinner, so this cannot nest in the
   * data - which is why it is a rule down the margin and not a tree line.
   *
   * It has to know whether the group is empty before it draws, because one
   * hairline with nothing beside it is the sort of mark that reads as a bug.
   */
  function Companions({ date, day }: { date: string; day: string }) {
    const empty =
      !DINNER_SLOTS.slice(1).some((slot) => byKey.get(`${date}|${slot}`)) &&
      !byKey.get(`${date}|${SIDE_SLOT}`);
    if (empty) return null;

    return (
      <Box
        sx={{
          pl: "14px",
          borderLeft: 1,
          borderColor: "divider",
          display: "flex",
          flexDirection: "column",
          gap: "5px",
        }}
      >
        <ExtraDinners date={date} day={day} />
        <SideRow date={date} day={day} />
      </Box>
    );
  }

  /**
   * Everything you can still add to an evening, in one place.
   *
   * Side by side now rather than stacked. They were stacked while they were
   * MUI buttons with plus icons, which no tile is wide enough for - about
   * 180px at `xs` and still only about 200px on a desktop, where seven of
   * them share the row. As 10.5px labels the pair measures about 125px, so
   * they fit the row the design puts them in; `flexWrap` covers the narrowest
   * phone rather than trusting that arithmetic.
   *
   * The labels still do the work: "Dinner" and "Side" name what you get, and
   * read as a pair of alternatives rather than two identical plus icons you
   * have to guess between. "Another dish" did not, which is why it is gone.
   *
   * A dinner is offered one empty slot at a time - three invitations on a
   * Tuesday is a week nobody is cooking - and a side only while the evening
   * has no side yet. When neither is on offer this renders nothing, which is
   * why it returns a fragment: the footer row it sits in belongs to the day,
   * and still has the open and remove labels to carry.
   */
  function AddMore({ date, day }: { date: string; day: string }) {
    const nextDinner = DINNER_SLOTS.slice(1).find(
      (slot) => !byKey.get(`${date}|${slot}`),
    );
    const hasSide = Boolean(byKey.get(`${date}|${SIDE_SLOT}`));

    if (!nextDinner && hasSide) return null;

    return (
      <>
        {nextDinner ? (
          <Button
            size="small"
            disabled={pending}
            onClick={() => setPicking({ date, day, slot: nextDinner })}
            sx={TEXT_ACTION_SX}
          >
            + Dinner
          </Button>
        ) : null}

        {hasSide ? null : (
          <Button
            size="small"
            onClick={() => setSidePicking({ date, day })}
            sx={TEXT_ACTION_SX}
          >
            + Side
          </Button>
        )}
      </>
    );
  }

  return (
    <Stack spacing={3}>
      {/*
       * The page header. "Week of 2026-09-14" between two arrows was the old
       * version of all of this, and it said the least useful part out loud.
       */}
      <Box data-print="hide">
        <Stack
          direction={{ xs: "column", md: "row" }}
          sx={{
            alignItems: { xs: "flex-start", md: "flex-end" },
            justifyContent: "space-between",
            gap: { xs: 2, md: 5 },
          }}
        >
          <Box>
            <Typography
              variant="overline"
              component="p"
              sx={{ color: "secondary.main", mb: { xs: 1, md: 2 } }}
            >
              {householdName} &middot; {formatWeekRange(weekStartIso)}
            </Typography>
            {/*
             * The page's h1 lives here rather than in the page, because it is
             * the second line of a two-line unit and the eyebrow above it has
             * to be part of the same block.
             */}
            <Typography variant="h1" component="h1">
              This week
            </Typography>
          </Box>

          <Stack
            direction="row"
            sx={{
              alignItems: "baseline",
              flexWrap: "wrap",
              gap: { xs: 2.75, md: 3.75 },
              pb: { md: 1.5 },
            }}
          >
            {/*
             * Two labels rather than a pair of arrows. Stepping one week at a
             * time is how you get to a week you did not mean to be on; these
             * name the two weeks anybody plans. Deep history is still a URL -
             * `?week=` takes any Monday - which is the right shape for
             * something wanted once a year.
             */}
            <Stack
              direction="row"
              sx={{ alignItems: "baseline", gap: { xs: 2, md: 2.75 } }}
            >
              <WeekLink
                href="/plan"
                label="This week"
                active={weekStartIso === thisWeekIso}
              />
              <WeekLink
                href={`/plan?week=${addDaysIso(thisWeekIso, 7)}`}
                label="Next week"
                active={weekStartIso === addDaysIso(thisWeekIso, 7)}
              />
            </Stack>

            <Button
              onClick={() => window.print()}
              sx={{
                ...TEXT_ACTION_SX,
                fontSize: "12px",
                letterSpacing: "0.14em",
                borderBottom: 1,
                borderColor: "divider",
                borderRadius: 0,
                pb: "3px",
              }}
            >
              Print
            </Button>
          </Stack>
        </Stack>

        {/*
         * The summary, under a rule that runs the width of the page. Counting
         * the week in words is the one thing the grid below cannot do at a
         * glance.
         */}
        <Typography
          component="p"
          sx={{
            mt: { xs: 2.5, md: 4 },
            pt: { xs: 1.5, md: 2.25 },
            borderTop: 1,
            borderColor: "text.primary",
            fontFamily: fonts.serif,
            fontStyle: "italic",
            fontWeight: 300,
            fontSize: { xs: "19px", md: "24px" },
            lineHeight: 1.4,
            color: "text.secondary",
          }}
        >
          {summariseWeek(dinnerCount, openEvenings)}
        </Typography>
      </Box>

      {/*
       * Twenty pixels between cells, and nothing else between them. A day is a
       * column on the page rather than a card on a surface: the gutter is the
       * separation, as it is in the recipe grid.
       */}
      <Grid container spacing={2.5} data-print="hide">
        {DAY_NAMES.map((day, index) => {
          const date = addDaysIso(weekStartIso, index);
          const dinner = byKey.get(`${date}|${FIRST_DINNER}`);
          const planned =
            recipes.find((r) => r.id === dinner?.recipeId) ?? null;
          const isToday = date === todayIso;

          return (
            <Grid key={date} size={{ xs: 6, sm: 4, md: 3, lg: 12 / 7 }}>
              <Stack
                sx={{
                  height: "100%",
                  gap: "14px",
                  // The remove controls on the dishes stay out of the way until
                  // the day is approached - seven cells each showing their own
                  // crosses is the densest chrome on the page. On touch there
                  // is no hover, so they are always visible below `md`. Same
                  // pattern, and same fallback, as the grocery rows.
                  "&:hover .row-actions, & .row-actions:focus-within": {
                    opacity: 1,
                  },
                }}
              >
                <Stack
                  direction="row"
                  sx={{
                    alignItems: "baseline",
                    justifyContent: "space-between",
                    gap: 0.75,
                    pb: "6px",
                    /*
                     * Today is the same device as the active item in the top
                     * bar - a 2px clay rule - and nothing else: no tint, no
                     * weight change. The page already knows what week it is
                     * showing, so this is a reminder, not a selection.
                     */
                    borderBottom: isToday ? 2 : 1,
                    borderColor: isToday ? "secondary.main" : "divider",
                  }}
                >
                  {/*
                   * "Wed" on a phone, "Wednesday" from a tablet up. A
                   * half-width tile leaves the day name about seventy pixels,
                   * which turns "Wednesday" into "Wed…" - the same three
                   * letters, plus an ellipsis implying something was lost.
                   * Rendered as two spans rather than a media-query hook
                   * because this is a server-rendered page and useMediaQuery
                   * guesses wrong on the first paint.
                   */}
                  <Box
                    component="span"
                    sx={{
                      fontFamily: fonts.sans,
                      fontWeight: 700,
                      fontSize: "11px",
                      lineHeight: 1.4,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      color: "text.primary",
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <Box
                      component="span"
                      sx={{ display: { xs: "none", sm: "inline" } }}
                    >
                      {day}
                    </Box>
                    <Box
                      component="span"
                      sx={{ display: { xs: "inline", sm: "none" } }}
                    >
                      {day.slice(0, 3)}
                    </Box>
                  </Box>
                  {/*
                   * The number alone: the month is on the page header, and a
                   * date wrapped across two lines ("09-" above "21") makes one
                   * cell taller than its neighbour for nothing. The day name is
                   * the one that gives, since it is the part still readable
                   * when clipped.
                   */}
                  <Box
                    component="span"
                    sx={{
                      fontFamily: fonts.serif,
                      fontSize: "15px",
                      lineHeight: 1,
                      whiteSpace: "nowrap",
                      color: isToday ? "secondary.main" : "text.secondary",
                    }}
                  >
                    {dayOfMonth(date)}
                  </Box>
                </Stack>

                <CardActionArea
                  onClick={() => setPicking({ date, day, slot: FIRST_DINNER })}
                  disabled={pending}
                >
                  {planned ? (
                    <Stack sx={{ gap: "14px" }}>
                      {planned.imageUrl ? (
                        // The smallest place a photo appears, and the one that
                        // gained most from `sizes`: a cell this tall was
                        // pulling a 1600px file.
                        <RecipePhoto
                          src={planned.imageUrl}
                          height={DAY_PHOTO_HEIGHT}
                          rounded={0}
                          sizes="(max-width: 600px) 45vw, (max-width: 900px) 30vw, (max-width: 1200px) 15vw, 165px"
                        />
                      ) : (
                        <RecipePlaceholder
                          title={planned.title}
                          height={DAY_PHOTO_HEIGHT}
                          showTitle
                        />
                      )}
                      <DishTitle title={planned.title} />
                      <DishMeta
                        parts={recipeMetaParts(
                          {
                            servings: dinner?.servings ?? planned.servings,
                            prepMinutes: planned.prepMinutes,
                            cookMinutes: planned.cookMinutes,
                          },
                          { servingsFirst: true },
                        )}
                      />
                    </Stack>
                  ) : (
                    /*
                     * An empty evening: two lines of type in a hairline box,
                     * the same height as a photo so a half-planned week keeps
                     * one baseline across the row.
                     *
                     * This is where "Add a meal" in `text.disabled` used to be,
                     * at 3.85:1 and 12px - a genuine AA failure. Both lines
                     * here clear it, and the plus icon is gone because the
                     * words say what it said.
                     */
                    <Box
                      sx={{
                        height: DAY_PHOTO_HEIGHT,
                        border: 1,
                        borderColor: "divider",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        textAlign: "center",
                        gap: 1,
                        px: 1,
                      }}
                    >
                      <Box
                        component="span"
                        sx={{
                          fontFamily: fonts.serif,
                          fontStyle: "italic",
                          fontWeight: 300,
                          fontSize: "17px",
                          lineHeight: 1.3,
                          color: "text.secondary",
                        }}
                      >
                        Nothing planned.
                      </Box>
                      <Box
                        component="span"
                        sx={{
                          fontFamily: fonts.sans,
                          fontWeight: 700,
                          fontSize: "10.5px",
                          lineHeight: 1.4,
                          letterSpacing: "0.13em",
                          textTransform: "uppercase",
                          color: "primary.main",
                          borderBottom: 1,
                          borderColor: "primary.main",
                          pb: "2px",
                        }}
                      >
                        Pick a recipe
                      </Box>
                    </Box>
                  )}
                </CardActionArea>

                {/*
                 * The rest of the evening sits under the dish it belongs to,
                 * rather than in slots of its own on the grid: these are all
                 * dishes on the same evening, and giving them equal billing
                 * would read as separate days. Everything already planned
                 * first, then what you can still do - so the cell answers
                 * "what are we eating" before it asks anything.
                 *
                 * Only once the evening has a first dinner: there is nothing
                 * to be a second dinner or a side to until then.
                 */}
                {planned ? (
                  <>
                    <Companions date={date} day={day} />

                    {/*
                     * Opening the recipe and clearing the day used to be two
                     * icon buttons up in the header, which put fourteen of them
                     * across a week. As text they join the footer row.
                     *
                     * They are siblings of the action area, not children of it,
                     * and that is not a layout preference: the cell is a
                     * CardActionArea, and an anchor or a button nested inside a
                     * button is invalid markup that swallows the click - which
                     * is also why the dish title itself cannot be the link,
                     * tempting as that is.
                     */}
                    <Stack
                      direction="row"
                      sx={{
                        alignItems: "center",
                        flexWrap: "wrap",
                        columnGap: "18px",
                        pt: "4px",
                        borderTop: 1,
                        borderColor: "divider",
                      }}
                    >
                      <AddMore date={date} day={day} />

                      {/*
                       * Flowing on after the add labels rather than pushed to
                       * the right of them. Four labels never fit one line in a
                       * 180px cell, and a right-aligned pair that has wrapped
                       * onto its own line reads as a second, stranded row.
                       */}
                      <Stack
                        direction="row"
                        className="row-actions"
                        sx={{
                          columnGap: "18px",
                          opacity: { xs: 1, md: 0 },
                          transition: "opacity 120ms",
                        }}
                      >
                        <Button
                          size="small"
                          component={Link}
                          href={`/recipes/${planned.id}`}
                          aria-label={`Open the recipe for ${planned.title}`}
                          sx={TEXT_ACTION_SX}
                        >
                          Open
                        </Button>
                        <Button
                          size="small"
                          aria-label={`Remove ${planned.title} from ${day}`}
                          disabled={pending}
                          onClick={() => assignSlot(date, FIRST_DINNER, null)}
                          sx={TEXT_ACTION_SX}
                        >
                          Remove
                        </Button>
                      </Stack>
                    </Stack>
                  </>
                ) : null}
              </Stack>
            </Grid>
          );
        })}
      </Grid>

      <SideSuggestionDialog
        open={sidePicking !== null}
        dateIso={sidePicking?.date ?? ""}
        weekStartIso={weekStartIso}
        dayLabel={sidePicking?.day ?? ""}
        onClose={() => {
          setSidePicking(null);
          router.refresh();
        }}
      />

      <RecipePickerDialog
        open={picking !== null}
        dayLabel={
          picking
            ? picking.slot === FIRST_DINNER
              ? `What are we eating on ${picking.day}?`
              : `What else are we eating on ${picking.day}?`
            : ""
        }
        recipes={recipes}
        selectedId={
          picking
            ? (byKey.get(`${picking.date}|${picking.slot}`)?.recipeId ?? null)
            : null
        }
        onPick={(recipeId) => {
          if (picking) assignSlot(picking.date, picking.slot, recipeId);
        }}
        onClose={() => setPicking(null)}
      />

      {/*
       * The list is a section of the page now, not a card sitting on it. The
       * old <Card> wrapped everything below the grid in a second surface -
       * which on a ground that is already paper reads as a panel bolted to
       * the page rather than as the next thing on it.
       */}
      <Box component="section" data-print="hide" sx={{ pt: { xs: 5, md: 8 } }}>
        <Stack
          direction={{ xs: "column", md: "row" }}
          sx={{
            alignItems: { xs: "flex-start", md: "flex-end" },
            justifyContent: "space-between",
            gap: { xs: 2.5, md: 5 },
            pb: { xs: 1.75, md: 2.25 },
            borderBottom: 1,
            borderColor: "text.primary",
          }}
        >
          <Box>
            {listEyebrow ? (
              <Typography
                variant="overline"
                component="p"
                sx={{ color: "secondary.main", mb: { xs: 1, md: 1.75 } }}
              >
                {listEyebrow}
              </Typography>
            ) : null}
            <Typography
              variant="h2"
              sx={{
                fontSize: { xs: "1.75rem", md: "44px" },
                lineHeight: 1.05,
                letterSpacing: "-0.025em",
              }}
            >
              Shopping list
            </Typography>
          </Box>

          {/*
           * On the baseline beside the heading. The icons are gone: three
           * buttons that all carried a shopping trolley said nothing about
           * which one does what, and the labels already do.
           */}
          <Stack
            direction="row"
            sx={{ flexWrap: "wrap", gap: 1.75, pb: { md: 0.75 } }}
          >
            {providers.map((provider) => (
              <Button
                key={provider.id}
                variant={provider.kind === "cart" ? "contained" : "outlined"}
                color={provider.kind === "cart" ? "ink" : "primary"}
                // `available` was computed but never used, so a provider
                // that cannot possibly succeed still invited a click and
                // answered with an error.
                disabled={
                  !provider.available ||
                  sendingTo !== null ||
                  groceries.length === 0
                }
                onClick={() => sendTo(provider.id)}
              >
                {sendingTo === provider.id ? "Working…" : provider.label}
              </Button>
            ))}

            {smsAudience ? (
              <Button
                variant="outlined"
                disabled={
                  texting ||
                  groceries.length === 0 ||
                  smsAudience.names.length === 0
                }
                onClick={textList}
              >
                {texting ? "Sending…" : "Text the list"}
              </Button>
            ) : null}
          </Stack>
        </Stack>

        {smsAudience ? (
          <Typography
            component="p"
            sx={{
              mt: 2.25,
              fontFamily: fonts.serif,
              fontStyle: "italic",
              fontWeight: 300,
              fontSize: "19px",
              lineHeight: 1.45,
              color: "text.secondary",
            }}
          >
            {smsAudience.names.length === 0
              ? "Nobody has agreed to be texted yet — add a number and tick the box on the household page."
              : `Texts ${smsAudience.names.join(" and ")}.`}
            {smsAudience.withoutNumbers.length > 0
              ? ` ${smsAudience.withoutNumbers.join(" and ")} has no number saved.`
              : ""}
            {/*
             * Said separately from the missing numbers: this person has
             * typed theirs, and telling them to add it again is the one
             * instruction that will not help.
             */}
            {smsAudience.withoutConsent.length > 0
              ? ` ${smsAudience.withoutConsent.join(" and ")} has not agreed to be texted.`
              : ""}
          </Typography>
        ) : null}

        {/*
         * Notes rather than banners, and one per thing worth saying rather
         * than one per provider. The two kinds of provider behave very
         * differently and one paragraph over a row of similar buttons would
         * hide that - but Amazon Fresh and Whole Foods are one Amazon with one
         * constraint, and saying it twice reads as a mistake.
         *
         * Stacked with their hairlines pulled together, so a column of notes
         * reads as ruled paper instead of as a set of boxes.
         */}
        <Box sx={{ mt: 2.5, "& > * + *": { mt: "-1px" } }}>
          {textResult ? (
            <PaperNote
              label={textResult.ok ? "Text sent" : "The text did not send"}
              tone={textResult.ok ? "good" : "note"}
              live
              onDismiss={() => setTextResult(null)}
            >
              {textResult.ok ? textResult.message : textResult.error}
            </PaperNote>
          ) : null}

          {/*
           * The standing note for a provider steps aside once that provider
           * has answered for itself. The two say much the same thing - both
           * are about Amazon having no ordering API - and as banners that
           * overlap was a caption under an alert. As two full paragraphs of
           * serif it is the same sentence twice.
           */}
          {providerNotes(
            providers.filter(
              (provider) => !(handoff && provider.id === handoffFrom),
            ),
          ).map((note) => (
            <PaperNote key={note.key} label={`A note on ${note.subject}`}>
              {note.body}
            </PaperNote>
          ))}
        </Box>

        {handoff ? <ShoppingHandoffPanel result={handoff} /> : null}

        {groceries.length === 0 ? (
          <Typography color="text.secondary" sx={{ mt: 3 }}>
            Plan some meals and the ingredients will collect here. Anything else
            you need goes in the box above.
          </Typography>
        ) : (
          /*
           * Three columns from `md` up, one below. A shopping list is read
           * down rather than across, and on a wide screen a single column of
           * forty rows is two screens of scrolling beside an empty half-page.
           *
           * `groupBySection` and its store order are untouched - the sections
           * are laid out in the order it returns them, which is the order you
           * walk the shop in.
           */
          <Box
            sx={{
              mt: { xs: 4, md: 6.5 },
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                md: "repeat(3, minmax(0, 1fr))",
              },
              columnGap: "56px",
              rowGap: { xs: 4, md: 6 },
              alignItems: "start",
            }}
          >
            {groupBySection(groceries).map((section) => (
              <Box key={section.id}>
                <Typography
                  component="h3"
                  sx={{
                    fontFamily: fonts.sans,
                    fontWeight: 700,
                    fontSize: "11px",
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    color: "text.secondary",
                    pb: "10px",
                    borderBottom: 1,
                    borderColor: "text.primary",
                  }}
                >
                  {section.label}
                </Typography>

                <Box sx={{ mt: "22px" }}>
                  {section.items.map((line) => (
                    <Box
                      key={`${line.name}-${line.unit ?? ""}-${line.quantity ?? "x"}`}
                      // Stable handle for the row. MUI's generated class names and
                      // nesting shift between versions, and tests that walk that
                      // structure silently target the wrong row rather than fail.
                      data-ingredient={line.name.trim().toLowerCase()}
                      sx={{
                        display: "flex",
                        alignItems: "baseline",
                        gap: "10px",
                        py: "13px",
                        "&:first-of-type": { pt: 0 },
                        borderBottom: 1,
                        borderColor: "divider",
                        "&:last-of-type": { borderBottom: 0 },
                        // Controls stay out of the way until the row is
                        // approached. Forty rows each showing two buttons is
                        // harder to read than the list being trimmed - but on
                        // touch there is no hover, so they are always visible
                        // below md.
                        "&:hover .row-actions, & .row-actions:focus-within": {
                          opacity: 1,
                        },
                      }}
                    >
                      {/*
                       * A fixed column, so the quantities line up down the
                       * list instead of starting wherever the name before
                       * them ended. That column is what makes a list
                       * scannable while you are holding a basket.
                       */}
                      <Box
                        component="span"
                        sx={{
                          fontFamily: fonts.sans,
                          fontWeight: 700,
                          fontSize: "13px",
                          letterSpacing: "0.02em",
                          color: "text.primary",
                          minWidth: 62,
                          flexShrink: 0,
                        }}
                      >
                        {formatAmount(line)}
                      </Box>

                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Box
                          sx={{
                            fontFamily: fonts.serif,
                            fontSize: "18px",
                            lineHeight: 1.3,
                            color: "text.primary",
                            overflowWrap: "break-word",
                          }}
                        >
                          {line.name}
                        </Box>
                        <Box
                          sx={{
                            fontFamily: fonts.sans,
                            fontSize: "11px",
                            lineHeight: 1.4,
                            letterSpacing: "0.06em",
                            color: "text.secondary",
                            mt: "2px",
                          }}
                        >
                          {line.extraId
                            ? "Added by hand"
                            : line.fromRecipes.join(", ")}
                        </Box>
                      </Box>

                      <Stack
                        direction="row"
                        className="row-actions"
                        sx={{
                          columnGap: "14px",
                          opacity: { xs: 1, md: 0 },
                          transition: "opacity 120ms",
                          flexShrink: 0,
                        }}
                      >
                        {line.extraId ? (
                          <Button
                            size="small"
                            disabled={pending}
                            onClick={() => removeExtra(line.extraId!)}
                            sx={TEXT_ACTION_SX}
                          >
                            Remove
                          </Button>
                        ) : (
                          <>
                            <Button
                              size="small"
                              disabled={pending}
                              onClick={() => gotItThisWeek(line.name)}
                              sx={TEXT_ACTION_SX}
                            >
                              Got it
                            </Button>
                            <Button
                              size="small"
                              disabled={pending}
                              onClick={() => alwaysHave(line.name)}
                              sx={TEXT_ACTION_SX}
                            >
                              Always have
                            </Button>
                          </>
                        )}
                      </Stack>
                    </Box>
                  ))}
                </Box>
              </Box>
            ))}
          </Box>
        )}

        {/*
         * Under the list rather than over it. It was above while it was a
         * pair of boxed fields that needed to look like a form; as a line to
         * write on it belongs at the end of the list it adds to, which is
         * also where you are by the time you notice the foil is missing.
         */}
        <AddExtraItem weekStartIso={weekStartIso} />

        <ExcludedIngredients pantry={pantry} skips={skips} />
      </Box>

      <PrintSheets
        weekStartIso={weekStartIso}
        dinnerCount={dinnerCount}
        sideCount={sideCount}
        groceries={groceries}
        pantry={pantry}
        byKey={byKey}
        recipes={recipes}
      />
    </Stack>
  );
}

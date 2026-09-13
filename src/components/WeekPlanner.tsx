"use client";

import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import MenuBookIcon from "@mui/icons-material/MenuBook";
import ShoppingCartIcon from "@mui/icons-material/ShoppingCart";
import SmsIcon from "@mui/icons-material/Sms";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Grid from "@mui/material/Grid";
import IconButton from "@mui/material/IconButton";
import CardActionArea from "@mui/material/CardActionArea";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  sendWeekToProviderAction,
  setPlannedMealAction,
  textShoppingListAction,
  type TextListActionResult,
} from "@/app/plan/actions";
import type { MealSlot, ShoppingProvider } from "@/generated/prisma/enums";
import { groupBySection } from "@/lib/grocery-sections";
import { DINNER_SLOTS, FIRST_DINNER, SIDE_SLOTS } from "@/lib/meal-slots";
import type { GroceryLine, WeeklySkipRecord } from "@/lib/grocery";
import type { HandoffResult, ProviderInfo } from "@/lib/shopping";

import { addToPantryAction, skipForWeekAction } from "@/app/plan/skip-actions";
import { removeExtraItemAction } from "@/app/plan/extra-actions";
import { formatAmount } from "@/lib/shopping/format";

import { RecipePickerDialog } from "./RecipePickerDialog";
import { SideSuggestionDialog } from "./SideSuggestionDialog";
import { RecipeTile, type TileRecipe } from "./RecipeTile";
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

function addDaysIso(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function WeekPlanner({
  weekStartIso,
  prevWeekIso,
  nextWeekIso,
  recipes,
  meals,
  groceries,
  skips,
  pantry,
  providers,
  smsAudience,
}: {
  weekStartIso: string;
  prevWeekIso: string;
  nextWeekIso: string;
  recipes: (TileRecipe & { servings: number })[];
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
    setSendingTo(null);
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
            <Stack
              key={slot}
              direction="row"
              sx={{ alignItems: "center", gap: 0.5, mt: 0.75, minWidth: 0 }}
            >
              <Typography variant="caption" color="text.secondary" noWrap>
                and {title}
              </Typography>
              <Tooltip title={`Remove ${title}`}>
                <IconButton
                  size="small"
                  aria-label={`Remove ${title} from ${day}`}
                  disabled={pending}
                  onClick={() => assignSlot(date, slot, null)}
                  sx={{ ml: "auto", p: 0.25, flexShrink: 0 }}
                >
                  <CloseIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </Tooltip>
            </Stack>
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

    if (sideTitle) {
      return (
        <Stack
          direction="row"
          sx={{ alignItems: "center", gap: 0.5, mt: 0.75, minWidth: 0 }}
        >
          <Typography variant="caption" color="text.secondary" noWrap>
            with {sideTitle}
          </Typography>
          <Tooltip title={`Remove ${sideTitle}`}>
            <IconButton
              size="small"
              aria-label={`Remove ${sideTitle} from ${day}`}
              disabled={pending}
              onClick={() => assignSlot(date, SIDE_SLOT, null)}
              sx={{ ml: "auto", p: 0.25, flexShrink: 0 }}
            >
              <CloseIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
        </Stack>
      );
    }

    return null;
  }

  /**
   * Everything you can still add to an evening, in one place.
   *
   * Two buttons, one under the other, because a day tile is never wide enough
   * for them side by side - about 180px at `xs` and still only about 200px on
   * a desktop, where seven of them share the row. So the labels do the work
   * instead: "Dinner" and "Side" name what you get, and read as a pair of
   * alternatives rather than two identical plus icons you have to guess
   * between. "Another dish" did not, which is why it is gone.
   *
   * A dinner is offered one empty slot at a time - three dashed invitations on
   * a Tuesday is a week nobody is cooking - and a side only while the evening
   * has no side yet. When neither is on offer this renders nothing, so a full
   * evening is just its dishes.
   */
  function AddMore({ date, day }: { date: string; day: string }) {
    const nextDinner = DINNER_SLOTS.slice(1).find(
      (slot) => !byKey.get(`${date}|${slot}`),
    );
    const hasSide = Boolean(byKey.get(`${date}|${SIDE_SLOT}`));

    if (!nextDinner && hasSide) return null;

    const sx = { px: 0.5, minWidth: 0, fontSize: "0.7rem", mt: 0.5 };

    return (
      <Stack sx={{ alignItems: "flex-start" }}>
        {nextDinner ? (
          <Button
            size="small"
            startIcon={<AddIcon sx={{ fontSize: 14 }} />}
            disabled={pending}
            onClick={() => setPicking({ date, day, slot: nextDinner })}
            sx={sx}
          >
            Dinner
          </Button>
        ) : null}

        {hasSide ? null : (
          <Button
            size="small"
            startIcon={<AddIcon sx={{ fontSize: 14 }} />}
            onClick={() => setSidePicking({ date, day })}
            sx={sx}
          >
            Side
          </Button>
        )}
      </Stack>
    );
  }

  return (
    <Stack spacing={3}>
      <Stack
        direction="row"
        spacing={1}
        sx={{
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
        }}
      >
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <Button
            component={Link}
            href={`/plan?week=${prevWeekIso}`}
            size="small"
          >
            ← Previous
          </Button>
          <Typography variant="body2" color="text.secondary">
            Week of {weekStartIso}
          </Typography>
          <Button
            component={Link}
            href={`/plan?week=${nextWeekIso}`}
            size="small"
          >
            Next →
          </Button>
        </Stack>
      </Stack>

      <Grid container spacing={2}>
        {DAY_NAMES.map((day, index) => {
          const date = addDaysIso(weekStartIso, index);
          const plannedId =
            byKey.get(`${date}|${FIRST_DINNER}`)?.recipeId ?? null;
          const planned = recipes.find((r) => r.id === plannedId) ?? null;
          return (
            <Grid key={date} size={{ xs: 6, sm: 4, md: 3, lg: 12 / 7 }}>
              <Card sx={{ height: "100%" }}>
                <CardContent sx={{ p: 1.5 }}>
                  <Stack
                    direction="row"
                    sx={{
                      alignItems: "baseline",
                      gap: 0.75,
                      mb: 1.25,
                      minHeight: 28,
                    }}
                  >
                    {/*
                     * "Wed" on a phone, "Wednesday" from a tablet up. A
                     * half-width tile carrying a date and two icon buttons
                     * leaves the day name about seventy pixels, which turns
                     * "Wednesday" into "Wed…" - the same three letters, plus
                     * an ellipsis implying something was lost. Rendered as two
                     * spans rather than a media-query hook because this is a
                     * server-rendered page and useMediaQuery guesses wrong on
                     * the first paint.
                     */}
                    <Typography variant="subtitle2" noWrap>
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
                    </Typography>
                    {/*
                     * Both refuse to wrap: two icon buttons in the header of a
                     * half-width tile leave the date about forty pixels, and a
                     * date broken across two lines ("08-" above "24") makes the
                     * tile taller than its neighbour for no reason. The day
                     * name is the one that gives, since it is the part still
                     * readable when clipped.
                     */}
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ whiteSpace: "nowrap" }}
                    >
                      {date.slice(5)}
                    </Typography>
                    {/*
                     * Opening the recipe and clearing the day both live in the
                     * header rather than on the tile. The tile is a
                     * CardActionArea that opens the picker, and an anchor or a
                     * button nested inside a button is invalid markup that
                     * swallows the click - which is also why the recipe title
                     * itself cannot be the link, tempting as that is.
                     */}
                    {planned ? (
                      <Stack
                        direction="row"
                        sx={{ ml: "auto", alignSelf: "center" }}
                      >
                        <Tooltip title={`Open ${planned.title}`}>
                          <IconButton
                            size="small"
                            component={Link}
                            href={`/recipes/${planned.id}`}
                            aria-label={`Open the recipe for ${planned.title}`}
                            sx={{ p: 0.5 }}
                          >
                            <MenuBookIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title={`Remove ${planned.title}`}>
                          <IconButton
                            size="small"
                            aria-label={`Remove ${planned.title} from ${day}`}
                            disabled={pending}
                            onClick={() => assignSlot(date, FIRST_DINNER, null)}
                            sx={{ p: 0.5 }}
                          >
                            <CloseIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    ) : null}
                  </Stack>

                  <CardActionArea
                    onClick={() =>
                      setPicking({ date, day, slot: FIRST_DINNER })
                    }
                    disabled={pending}
                    sx={{ borderRadius: 1.5, p: 0.5 }}
                  >
                    {planned ? (
                      <RecipeTile recipe={planned} />
                    ) : (
                      <Box
                        sx={{
                          height: 96,
                          borderRadius: 1,
                          border: 1,
                          borderStyle: "dashed",
                          borderColor: "divider",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "text.disabled",
                          gap: 0.5,
                        }}
                      >
                        <AddIcon fontSize="small" />
                        <Typography variant="caption">Add a meal</Typography>
                      </Box>
                    )}
                  </CardActionArea>

                  {/*
                   * The rest of the evening sits under the dish it belongs to,
                   * rather than in slots of its own on the grid: these are all
                   * dishes on the same evening, and giving them equal billing
                   * would read as separate days. Everything already planned
                   * first, then what you can still add - so the tile answers
                   * "what are we eating" before it asks anything.
                   *
                   * Only once the evening has a first dinner: there is nothing
                   * to be a second dinner or a side to until then.
                   */}
                  {planned ? (
                    <>
                      <ExtraDinners date={date} day={day} />
                      <SideRow date={date} day={day} />
                      <AddMore date={date} day={day} />
                    </>
                  ) : null}
                </CardContent>
              </Card>
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

      <Card>
        <CardContent>
          <Typography variant="h2" sx={{ mb: 2 }}>
            Grocery list
          </Typography>

          <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1, mb: 1.5 }}>
            {providers.map((provider) => (
              <Button
                key={provider.id}
                variant={provider.kind === "cart" ? "contained" : "outlined"}
                startIcon={<ShoppingCartIcon />}
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
                {sendingTo === provider.id ? "Working\u2026" : provider.label}
              </Button>
            ))}

            {smsAudience ? (
              <Button
                variant="outlined"
                startIcon={<SmsIcon />}
                disabled={
                  texting ||
                  groceries.length === 0 ||
                  smsAudience.names.length === 0
                }
                onClick={textList}
              >
                {texting ? "Sending\u2026" : "Text the list"}
              </Button>
            ) : null}
          </Stack>

          {smsAudience ? (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: "block", mb: 1.5 }}
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

          {textResult ? (
            <Alert
              severity={textResult.ok ? "success" : "error"}
              sx={{ mb: 2 }}
              onClose={() => setTextResult(null)}
            >
              {textResult.ok ? textResult.message : textResult.error}
            </Alert>
          ) : null}

          {/*
           * Spelled out per provider, because the two kinds behave very
           * differently and a row of similar buttons would imply otherwise.
           */}
          <Stack spacing={0.5} sx={{ mb: 2 }}>
            {providers.map((provider) => (
              <Typography
                key={provider.id}
                variant="caption"
                color="text.secondary"
              >
                <Box component="span" sx={{ fontWeight: 600 }}>
                  {provider.label}:
                </Box>{" "}
                {provider.description}
                {provider.available ? "" : ` ${provider.unavailableReason}`}
              </Typography>
            ))}
          </Stack>

          {handoff ? <ShoppingHandoffPanel result={handoff} /> : null}

          <AddExtraItem weekStartIso={weekStartIso} />

          {groceries.length === 0 ? (
            <Typography color="text.secondary">
              Plan some meals and the ingredients will collect here. Anything
              else you need goes in the box above.
            </Typography>
          ) : (
            <Stack spacing={2.5}>
              {groupBySection(groceries).map((section) => (
                <Box key={section.id}>
                  <Typography
                    variant="overline"
                    color="text.secondary"
                    sx={{ display: "block", mb: 0.5 }}
                  >
                    {section.label}
                  </Typography>

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
                    {section.items.map((line) => (
                      <Box
                        key={`${line.name}-${line.unit ?? ""}-${line.quantity ?? "x"}`}
                        // Stable handle for the row. MUI's generated class names and
                        // nesting shift between versions, and tests that walk that
                        // structure silently target the wrong row rather than fail.
                        data-ingredient={line.name.trim().toLowerCase()}
                        sx={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 1,
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
                        <Box sx={{ flexGrow: 1 }}>
                          <Typography variant="body2">
                            <Box component="span" sx={{ fontWeight: 600 }}>
                              {formatAmount(line)}
                            </Box>{" "}
                            {line.name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {line.extraId
                              ? "Added by hand"
                              : line.fromRecipes.join(", ")}
                          </Typography>
                        </Box>

                        <Stack
                          direction="row"
                          spacing={0.5}
                          className="row-actions"
                          sx={{
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
                            >
                              Remove
                            </Button>
                          ) : (
                            <>
                              <Button
                                size="small"
                                disabled={pending}
                                onClick={() => gotItThisWeek(line.name)}
                              >
                                Got it
                              </Button>
                              <Button
                                size="small"
                                disabled={pending}
                                onClick={() => alwaysHave(line.name)}
                              >
                                Always have
                              </Button>
                            </>
                          )}
                        </Stack>
                      </Box>
                    ))}
                  </Stack>
                </Box>
              ))}
            </Stack>
          )}

          <ExcludedIngredients pantry={pantry} skips={skips} />
        </CardContent>
      </Card>
    </Stack>
  );
}

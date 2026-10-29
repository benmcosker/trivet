/**
 * Which dinners to offer first for a given evening.
 *
 * The first half of the planner suggesting a week of dinners: the same
 * ranking a "suggest dinners" sheet will draw from, applied first to the
 * existing picker, where it never decides anything - it only changes which
 * dishes are on the first screen. If the order feels wrong there, it would
 * feel wrong as a suggestion too, and it is much cheaper to find out here.
 *
 * What it weighs, strongest first:
 * - **How long since it was last planned.** The household's own history is
 *   the signal, not stars: ratings are sparse in real use, while every week
 *   planned records what was actually chosen. Levels off at twelve weeks -
 *   past that, "a while ago" is all it needs to say.
 * - **Whether it fits the evening.** Monday to Thursday favours what is on
 *   the table inside 45 minutes; the weekend takes anything. Prep, cook and
 *   rest all count, because rest is what makes a dish too late for a
 *   Tuesday. An unknown time is neutral, never assumed quick.
 * - **Whether it is a regular.** Counted, but levelled off, so a favourite
 *   cannot crowd everything else out once the suggestions start feeding
 *   their own history.
 * - **Variety**, gently: a dish sharing a tag with a dinner the night before
 *   or after is nudged down, so three pastas do not land in a row. The
 *   occasion words - weeknight, comfort and the like - are ignored for this,
 *   because nearly everything carries them.
 * - **Stars**, as a tiebreaker only.
 *
 * What never happens: a dish that is not sorted as a dinner is not ranked at
 * all; one this household rated one or two stars, or already planned this
 * week, goes to the bottom rather than disappearing, because the picker is a
 * person choosing and may want it anyway.
 *
 * Deterministic on purpose - no randomness. A list that reshuffled every
 * time the dialog opened could not be browsed. The suggestion sheet will add
 * its own variety on top.
 *
 * Import-free, so it runs in the browser and tests without a database.
 */

export type RankableRecipe = {
  id: string;
  title: string;
  /** Mirrors `RecipeCourse`; only "DINNER" is ranked. */
  course: string | null;
  /** Prep, cook and rest together, in minutes. Null when none is known. */
  totalMinutes: number | null;
  /** Times this household has planned it as a dinner, before this week. */
  timesPlanned: number;
  /** The last evening it was planned as a dinner, before this week. */
  lastPlannedIso: string | null;
  /** Rated one or two stars by someone in this household. */
  vetoed: boolean;
  /** The average across everybody, used only to break ties. */
  averageStars: number | null;
  tagSlugs: string[];
};

export type EveningContext = {
  /** The evening being planned, `YYYY-MM-DD`. */
  dateIso: string;
  /** Every dinner already planned this week. */
  plannedThisWeek: { dateIso: string; recipeId: string }[];
};

export type Ranked<T> = { recipe: T; reason: string | null };

/** Words nearly every recipe carries, so useless for telling dishes apart. */
const OCCASION_TAGS = new Set([
  "weeknight",
  "sunday-cooking",
  "comfort",
  "one-pot",
  "quick",
  "easy",
]);

const RECENCY_CAP_DAYS = 84;
const WEEKNIGHT_QUICK = 45;
const WEEKNIGHT_STRETCH = 75;

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const NUMBER_WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
];

function inWords(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}

function dayOf(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

function daysBetween(fromIso: string, toIso: string): number {
  const ms =
    new Date(`${toIso}T00:00:00Z`).getTime() -
    new Date(`${fromIso}T00:00:00Z`).getTime();
  return Math.round(ms / 86_400_000);
}

/** "25 min", "1 hr", "1 hr 30 min" - short enough for a reason line. */
export function shortDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}

function isWeeknight(day: number): boolean {
  return day >= 1 && day <= 4;
}

/** 0 to 1: how well a dish's total time suits the evening. */
function timeFit(totalMinutes: number | null, day: number): number {
  if (totalMinutes == null) return 0.5;
  if (!isWeeknight(day)) return 1;
  if (totalMinutes <= WEEKNIGHT_QUICK) return 1;
  if (totalMinutes <= WEEKNIGHT_STRETCH) return 0.5;
  return 0;
}

/** 0 to 1: longer since it was planned is better, levelling off. */
function recency(lastPlannedIso: string | null, dateIso: string): number {
  // Never planned: worth offering, but not ahead of a dish that has been
  // missed for months - a household's own favourites come first.
  if (!lastPlannedIso) return 0.7;
  const days = Math.max(0, daysBetween(lastPlannedIso, dateIso));
  return Math.min(days, RECENCY_CAP_DAYS) / RECENCY_CAP_DAYS;
}

/** 0 to 1: a regular, counted but levelled off at about ten. */
function regularity(timesPlanned: number): number {
  return Math.min(1, Math.log1p(timesPlanned) / Math.log1p(10));
}

function varietyTags(recipe: RankableRecipe): string[] {
  return recipe.tagSlugs.filter((slug) => !OCCASION_TAGS.has(slug));
}

/**
 * The one reason most worth showing, or none.
 *
 * Chosen by what contributed most to the dish's place, and only from reasons
 * that say something: "not planned before" would be true of half a new
 * library and would read as noise.
 */
function reasonFor(
  recipe: RankableRecipe,
  ctx: EveningContext,
  parts: { recency: number; fit: number; regular: number },
): string | null {
  const day = dayOf(ctx.dateIso);
  const candidates: { weight: number; text: string }[] = [];

  if (recipe.lastPlannedIso) {
    const days = daysBetween(recipe.lastPlannedIso, ctx.dateIso);
    if (days >= 90) {
      const month = new Date(
        `${recipe.lastPlannedIso}T00:00:00Z`,
      ).toLocaleString("en-US", { month: "long", timeZone: "UTC" });
      candidates.push({
        weight: 3 * parts.recency,
        text: `Last planned in ${month}`,
      });
    } else if (days >= 21) {
      candidates.push({
        weight: 3 * parts.recency,
        text: `Last planned ${inWords(Math.round(days / 7))} weeks ago`,
      });
    }
  }

  if (recipe.timesPlanned >= 4) {
    candidates.push({
      weight: 1 * parts.regular + 0.5,
      text: `A regular, planned ${inWords(recipe.timesPlanned)} times`,
    });
  }

  if (recipe.totalMinutes != null && parts.fit === 1) {
    const quick = isWeeknight(day) && recipe.totalMinutes <= WEEKNIGHT_QUICK;
    const long = !isWeeknight(day) && recipe.totalMinutes > WEEKNIGHT_STRETCH;
    if (quick || long) {
      candidates.push({
        weight: 2 * parts.fit - 0.5,
        text: `${shortDuration(recipe.totalMinutes)}, for a ${DAY_NAMES[day]}`,
      });
    }
  }

  if (recipe.averageStars != null && recipe.averageStars >= 4.5) {
    candidates.push({ weight: 0.4, text: "Rated five stars" });
  }

  candidates.sort((a, b) => b.weight - a.weight);
  return candidates[0]?.text ?? null;
}

/**
 * Dinners in the order worth offering them for one evening, each with the
 * reason it is where it is.
 *
 * Only recipes sorted as dinners come back. Three tiers, in order: fit to be
 * offered; already planned on another evening this week; rated down by this
 * household. Within a tier, by score, then by title so equal scores keep a
 * stable order.
 */
export function rankForEvening<T extends RankableRecipe>(
  recipes: T[],
  ctx: EveningContext,
): Ranked<T>[] {
  const day = dayOf(ctx.dateIso);
  const byId = new Map(recipes.map((r) => [r.id, r]));

  const thisWeek = new Set(
    ctx.plannedThisWeek
      .filter((p) => p.dateIso !== ctx.dateIso)
      .map((p) => p.recipeId),
  );

  // Tags on the dinners either side of this evening, for the variety nudge.
  const neighbourTags = new Set(
    ctx.plannedThisWeek
      .filter((p) => Math.abs(daysBetween(p.dateIso, ctx.dateIso)) === 1)
      .flatMap((p) => {
        const r = byId.get(p.recipeId);
        return r ? varietyTags(r) : [];
      }),
  );

  const scored = recipes
    .filter((r) => r.course === "DINNER")
    .map((recipe) => {
      const parts = {
        recency: recency(recipe.lastPlannedIso, ctx.dateIso),
        fit: timeFit(recipe.totalMinutes, day),
        regular: regularity(recipe.timesPlanned),
      };
      const clash = varietyTags(recipe).some((t) => neighbourTags.has(t));
      const stars =
        recipe.averageStars == null ? 0 : (recipe.averageStars - 3) * 0.1;
      const score =
        3 * parts.recency +
        2 * parts.fit +
        1 * parts.regular +
        stars -
        (clash ? 1.5 : 0);
      const tier = recipe.vetoed ? 2 : thisWeek.has(recipe.id) ? 1 : 0;
      return { recipe, score, tier, parts };
    });

  scored.sort(
    (a, b) =>
      a.tier - b.tier ||
      b.score - a.score ||
      a.recipe.title.localeCompare(b.recipe.title),
  );

  return scored.map(({ recipe, tier, parts }) => ({
    recipe,
    // A dish at the bottom for a reason says so; one that is merely ranked
    // says why it is up there.
    reason:
      tier === 2
        ? "Rated down at home"
        : tier === 1
          ? "Already planned this week"
          : reasonFor(recipe, ctx, parts),
  }));
}

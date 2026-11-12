# How we eat: plan

## Context

A household is never just one thing. One person is vegetarian, another eats
fish but not meat, a child eats everything. Today Trivet knows nothing reliable
about diet: the importer sometimes suggests a "Vegetarian" tag, but tags are
free text, typed by anyone, and inconsistent, so a filter built on them would
both miss dishes and let others through.

The goal: **each person sees a library that fits how they eat, and the week's
plan shows at a glance whether dinner works for everyone at the table.**

This is a separate plan from channels. It shares one principle with it: what
the app relies on is a field it controls, not a tag.

## The decisions

1. **By person, not by household.** Each person has a diet. A household is the
   sum of its people.
2. **A person is someone at the table, not an account.** Children rarely have a
   sign-in, and they eat dinner too. The Household page lists _people at the
   table_: each member with an account is one automatically, and anyone else
   can be added by name ("Theo"). A diet belongs to a person.
3. **Four diets to start:** Everything, Pescatarian, Vegetarian, Vegan. Each
   is a strict superset of the next, so one recipe field answers all four.
4. **No allergies in this plan.** Gluten-free or nut-free is a different
   promise: a mistake can make someone ill, and a model's reading of an
   ingredient list is not something to stand behind. See Out of scope.
5. **A filter you can always see and lift.** Nothing is hidden silently: the
   library says what it is showing and offers "Show everything" in one tap.

## What a recipe knows

A new field on `Recipe`, `diet`: the strictest diet the dish fits.

| Value         | Means                                   |
| ------------- | --------------------------------------- |
| `VEGAN`       | No animal products at all               |
| `VEGETARIAN`  | No meat or fish; dairy and eggs allowed |
| `PESCATARIAN` | Fish and shellfish, no other meat       |
| `OMNIVORE`    | Contains meat                           |
| null          | Not yet known                           |

- **On import,** the extractor sets it from the ingredients, the way it now
  estimates nutrition, and is strict about the hidden ones: fish sauce, anchovy
  in Worcestershire, chicken or beef stock, gelatin, lard. Parmesan made with
  animal rennet is left at vegetarian: the label is about the recipe, not a
  brand.
- **Optional meat** ("add bacon if you like") does not count: the diet is set
  by the required ingredients, and the option stays in the method or notes.
- **On the review form,** the diet is shown and can be corrected, like the
  course. Editing an ingredient does not reclassify it on its own; the form
  says when the ingredients and the diet disagree.
- **The existing library** is backfilled once:
  - shared recipes with the export → check → apply tools from the nutrition
    pass, reviewed before writing;
  - each household's private recipes by a one-off script through the Message
    Batches API (half price, no hurry), which writes only where `diet` is
    null.

## What a person sees

**The library, search and the planner's picker** follow the signed-in person's
diet. A vegetarian sees vegetarian and vegan dishes, with a quiet line at the
top: _Showing vegetarian recipes · Show everything_. The choice to show
everything lasts for the visit, not forever. Recipes with an unknown diet are
shown, marked, rather than hidden. A household's own recipes are never
filtered out of its own search.

**A recipe page** says who it suits, when it does not suit everyone: _Not for
Ana (vegetarian)_. Nothing is said when it suits the whole table.

**The week's plan** marks a dinner that leaves someone out, with their name, so
the cook can see it while planning rather than at the table. Dinner
suggestions for open nights prefer dishes that suit everyone, and say so when
none does.

**Shopping** is unchanged.

## Who sets a diet

- Each member sets their own on the Household page.
- People without accounts (children) are added and set by any member.
- When someone at the table later gets an account (a son who joins), the
  family invite can name them, and their account takes over that person,
  diet included, instead of adding a second one.
- A member's diet is visible to their household only, and to no other
  household.

## Design

One board, in the format of `design_handoff_trivet_share/`:

- The Household page's _People at the table_, with diets, and adding a person
  without an account.
- The library with a diet filter on, and the _Show everything_ line.
- A recipe page that does not suit someone.
- The planner with a dinner that leaves someone out, and a suggestion that
  suits everyone.
- The review form's diet field, including the disagreement note.

## Explicitly out of scope

- Allergies and intolerances (gluten, nuts, dairy, shellfish as an allergy).
  If added later, they should read as guidance ("may contain"), with the
  ingredient named, never as a guarantee.
- Other diets (halal, kosher, low-FODMAP, keto). Each has rules a field of
  four values cannot express.
- Per-person portions or a separate dish for one person on the same night.
- Dislikes ("Theo won't eat mushrooms"). Useful, but a different feature:
  ingredients, not diets.

## Testing

1. Classification on import, from fixtures: a vegan curry, a vegetarian
   lasagne, a fish taco, a chicken dish, a vegetable soup made with chicken
   stock (omnivore), a Caesar dressing (pescatarian, for the anchovy), a dish
   with optional bacon (vegetarian).
2. The filter: a vegetarian person's library, search and picker leave out
   omnivore and pescatarian dishes, show unknown ones marked, and never hide
   the household's own recipes from search.
3. _Show everything_ lifts the filter for the visit only.
4. People without accounts: added, given a diet, counted in "suits everyone";
   an invite that names one links the new account to them, with no duplicate.
5. The plan marks a dinner that leaves someone out; suggestions prefer dishes
   that suit everyone.
6. The backfill writes only where the diet is unknown, and a second run
   changes nothing.

## Effort

A medium change, all on the website: one recipe field and one new table for
people at the table, the extractor change, the backfill, the review form, and
the filter wired into the library, search, picker and suggestions. No iPhone
build. The design board comes first, as it did for the share sheet.

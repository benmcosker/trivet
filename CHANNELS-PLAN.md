# Channels, and cooking from one ingredient: plan

An exploratory plan, written down so the thinking survives the conversation it
came from (Ben, 12 November). Nothing here is scheduled. It is meant to be
useful in conversations with local food partners as much as for building.

## Context

Two ideas that turned out to be one:

- **Cook with what you've got.** Start from a star ingredient (some grouper
  from the fishmonger) and get a short list of dishes, from the household's own
  library and, beyond it, from a curated set of good recipe sites.
- **Local food partners.** A fishmonger, a farm or a CSA could recommend
  recipes, say what is in this week, and appear in those suggestions.

Both need a way for someone other than the household to put curated things in
front of it. Tags cannot do that safely.

## Why not tags

Tags in Trivet are a shared vocabulary that any household creates by typing.
That is right for "Weeknight" or "Grill". It is wrong for a partner's name:

- anybody could put "Red's Fish Market" on a recipe Red's never chose;
- a partner is more than a word: a location, a link, perhaps a logo, a weekly
  list, and one day someone at the shop who manages it;
- if a partner ever pays or is favoured in results, the label has to say so,
  and a tag cannot.

## Channels

A **channel** is a curated collection with an owner. Only its owner, and Trivet's
admins, can change it.

- **Owner:** a partner (Red's Fish Market, a farm) or Trivet itself.
- **What it holds:**
  - recipes it picks;
  - ingredients it sells (grouper → Red's);
  - an optional _this week_ list (what came in, what is in season).
- **How it shows:** a small labelled chip on any recipe it has picked, styled
  like a tag with a channel mark so it reads as a channel, never a tag. The
  chip opens the channel: its picks, this week, a link to the shop.
- **Following:** a household follows the channels it wants. Their picks and
  this-week lists feed its suggestions; unfollowing removes them.
- **Trivet's own curation is a channel too.** The base-recipes library could
  be _From Trivet's kitchen_, alongside seasonal or weeknight collections,
  with no partner involved.
- **Honest by design:** a channel's chip always says whose it is, and if a
  channel is ever paid, the channel says so, in one place.

## Cook with an ingredient

The first feature built on channels. Type an ingredient (or tap one on a
partner's this-week list) and get a short list, in three labelled layers:

1. **Your library:** recipes already in Trivet that use it, or a close
   stand-in (snapper or cod for grouper). Plannable at once.
2. **Channels you follow:** their picks for that ingredient, first.
3. **Curated sites:** Claude's web search, restricted to a list of domains
   (`allowed_domains` on the web search tool), reads results from those sites
   only and returns a structured list: the dish, the site, roughly how long and
   how hard, one line on why it suits the ingredient, and the link.

Each result has **Add to Trivet**, which is the existing link import with its
review step. Sites that refuse a server still get the print-to-PDF handoff.

### The curated sites

The editorial heart of the feature. Sites that answered a server in the
October measurement (`design_handoff_trivet_url_import/README.md`) can be
searched and imported: Smitten Kitchen, Bon Appétit, Epicurious, BBC Good
Food, Love and Lemons, King Arthur Baking, America's Test Kitchen, Once Upon a
Chef, among others. Sites that refuse a server (Serious Eats, Simply Recipes,
Allrecipes, The Kitchn) or sit behind a paywall (NYT Cooking) can be searched
but need the PDF step to import.

### Copyright

A list of titles and links, as a search engine shows, is fine. Imports stay
private to the household, as they are today. Anything that later joins the
shared library goes through the same rewrite as the rest of it: Trivet's own
words, "Adapted from".

### Cost

Each lookup is one model call plus a few searches; web search is billed per
search. Small per lookup, but it should have a daily allowance, as card
imports do (`claimUploadSlot`). Confirm current pricing before building.

## Settled so far

- Partners are channels, not tags.
- Channels are created and filled by Trivet's admins first; partners
  managing their own channel comes later, when a real partner needs it.
- Every suggestion says where it came from: your library, a channel, or a
  site.
- Results are a list to choose from. Nothing is added without the review
  step.

## Open questions

1. **Where does "cook with" live?** A box on the Recipes page, on the planner
   when filling an empty night, on a channel's this-week list, or all three?
2. **Who curates the site list?** Trivet only, or channels can add their own?
3. **Household signals:** should results lean on what a household has cooked
   and rated, its courses, and (if built) each person's diet from
   `DIET-PLAN.md`?
4. **Partner terms:** is a channel free for a partner, paid, or an exchange
   (they promote Trivet to their customers)? This decides how the paid label
   reads, and whether it is needed at all.
5. **Where people are:** does a partner's this-week list reach every follower,
   or only households near it?

## Phases, when it is time

1. **Cook with an ingredient, library and sites only.** No channels yet. It
   stands on its own and tests whether people use it.
2. **Channels, admin-curated.** _From Trivet's kitchen_ first, then one real
   partner set up by hand.
3. **Following and this-week lists**, feeding suggestions and the planner.
4. **Partner self-service**, if and when partners want to manage their own,
   with the moderation and reporting that already cover shared content.

Each phase gets a design board first, as the share sheet and loading states
did.

## Out of scope for now

- Ordering from a partner through Trivet. Shopping hand-off is a separate
  problem (see Instacart in the README).
- Ads, or any placement a partner pays for without a label.
- Recipes from video.

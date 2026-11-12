# Channels: plan

An exploratory plan, written down so the thinking survives the conversation it
came from (Ben, 12 November). Nothing here is scheduled. It is meant to be
useful in conversations with local food partners as much as for building.

## Context

**Local food partners.** A fishmonger, a farm or a CSA could recommend
recipes, say what is in this week, and appear in a household's suggestions.
That needs a way for someone other than the household to put curated things
in front of it. Tags cannot do that safely.

This plan builds on `COOK-WITH-PLAN.md` (cooking from one ingredient), which
stands on its own and can come first. Channels add one layer to it.

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

## What channels add to Cook with

`COOK-WITH-PLAN.md` answers an ingredient from two layers: your library, then
curated sites. Channels add a layer between them:

1. Your library.
2. **Channels you follow:** their picks for that ingredient, first.
3. Curated sites.

A partner's this-week list also becomes a way in: tap "grouper" on Red's list
and get the same answer.

## Settled so far

- Partners are channels, not tags.
- Channels are created and filled by Trivet's admins first; partners
  managing their own channel comes later, when a real partner needs it.
- Every suggestion says where it came from: your library, a channel, or a
  site.

## Open questions

1. **Can a channel add sites** to Cook with's curated list, or only recipes?
2. **Partner terms:** is a channel free for a partner, paid, or an exchange
   (they promote Trivet to their customers)? This decides how the paid label
   reads, and whether it is needed at all.
3. **Where people are:** does a partner's this-week list reach every follower,
   or only households near it?

## Phases, when it is time

0. **Cook with an ingredient** (`COOK-WITH-PLAN.md`), with no channels.
1. **Channels, admin-curated.** _From Trivet's kitchen_ first, then one real
   partner set up by hand.
2. **Following and this-week lists**, feeding suggestions and the planner.
3. **Partner self-service**, if and when partners want to manage their own,
   with the moderation and reporting that already cover shared content.

Each phase gets a design board first, as the share sheet and loading states
did.

## Out of scope for now

- Ordering from a partner through Trivet. Shopping hand-off is a separate
  problem (see Instacart in the README).
- Ads, or any placement a partner pays for without a label.
- Recipes from video.

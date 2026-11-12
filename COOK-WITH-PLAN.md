# Cook with an ingredient: plan

An exploratory plan from a conversation with Ben on 12 November. Nothing is
scheduled. It stands on its own: it needs no channels, partners or new kinds
of account, and could be designed and built whenever it is wanted.
`CHANNELS-PLAN.md` describes a later layer that would slot into it.

## Context

People often start from an ingredient rather than a dish: some grouper from
the fishmonger, a glut of courgettes, a bunch of something from a farm stand.
Trivet's library is searched by dish. The goal: **type one ingredient and get
a short, trustworthy list of dishes to cook with it, from your own library
first and from a few good recipe sites beyond it.**

## How it works

Type an ingredient and get a short list, in two labelled layers:

1. **Your library:** recipes already in Trivet that use it, or a close
   stand-in (snapper or cod for grouper). Plannable at once.
2. **Curated sites:** Claude's web search, restricted to a list of domains
   (`allowed_domains` on the web search tool), reads results from those sites
   only and returns a structured list: the dish, the site, roughly how long and
   how hard, one line on why it suits the ingredient, and the link.

Each result from a site has **Add to Trivet**, which is the existing link
import with its review step. Sites that refuse a server still get the
print-to-PDF handoff. Nothing joins the library without a person reviewing it.

Every result says which layer it came from.

## The curated sites

The editorial heart of the feature. Sites that answered a server in the
October measurement (`design_handoff_trivet_url_import/README.md`) can be
searched and imported: Smitten Kitchen, Bon Appétit, Epicurious, BBC Good
Food, Love and Lemons, King Arthur Baking, America's Test Kitchen, Once Upon a
Chef, among others. Sites that refuse a server (Serious Eats, Simply Recipes,
Allrecipes, The Kitchn) or sit behind a paywall (NYT Cooking) can be searched
but need the PDF step to import.

The list lives in code, chosen by Trivet's admins, and is short on purpose: a
dozen sites that are reliably good beats the whole web.

## Copyright

A list of titles and links, as a search engine shows, is fine. Imports stay
private to the household, as they are today. Anything that later joins the
shared library goes through the same rewrite as the rest of it: Trivet's own
words, "Adapted from".

## Cost

Each lookup is one model call plus a few searches; web search is billed per
search. Small per lookup, but it should have a daily allowance, as card
imports do (`claimUploadSlot`), and the library layer should answer first so
the web is searched only when asked or when the library has little. Confirm
current pricing before building.

## Open questions

1. **Where does it live?** A box on the Recipes page, on the planner when
   filling an empty night, or both?
2. **When does it search the web?** Always, or only on "Find more" after the
   library's results? The second is cheaper and keeps the library first.
3. **Household signals:** should results lean on what the household has
   cooked and rated, its courses, and (if built) each person's diet from
   `DIET-PLAN.md`?
4. **Stand-ins:** how far should "or a close stand-in" reach? Grouper → other
   firm white fish is helpful; grouper → chicken is not.

## Design

One board first, as for the share sheet and loading states: the ingredient
box, results in two labelled layers, _Add to Trivet_ from a site result, an
empty library layer, and the daily limit reached.

## Out of scope

- Channels and partners: `CHANNELS-PLAN.md`.
- Several ingredients at once ("what can I make with what's in the fridge").
  A natural follow-on, but a different question.
- Recipes from video.

## Effort

Website only, no iPhone build. The library layer is a search over ingredients
the app already has. The site layer is one new route around the web search
tool, with a structured result and an allowance, reusing the link import for
_Add to Trivet_.

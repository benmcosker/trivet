# Trivet for AI assistants (MCP): plan

## Context

People are starting to plan their lives through an AI assistant: Claude in the
Claude app, and others like it. The Model Context Protocol (MCP) is how an
assistant reaches an app's data and actions, with the person's permission.

The goal: **someone connects their assistant to Trivet once, and can then ask
it about their own recipes, week and shopping in plain words**: "what can I
make with the grouper I bought?", "plan next week, two fish nights, nothing
over 45 minutes on weeknights", "what's on the list that we don't already
have?"

Why it fits Trivet:

- **It costs Trivet nothing to think.** The reasoning happens in the person's
  own assistant, on their subscription, not on Trivet's Anthropic bill. That
  suits a pay-once app.
- **It is Cook with, nearly for free.** An assistant with web search, given
  Trivet's library, already answers "what can I make with this" across the
  library and the web (`COOK-WITH-PLAN.md`).
- **Everything still goes through Trivet's rules:** the household's own data
  only, the review step for new recipes, the same limits.

## The decisions

1. **A remote MCP server on the website,** at `https://trivetbox.com/api/mcp`,
   over the Streamable HTTP transport. Nothing on the iPhone side: the
   assistant connects to the website, as the app does.
2. **Sign-in with OAuth 2.1, from Trivet's own sign-in library.** Better Auth's
   `mcp()` plugin makes Trivet the OAuth provider an assistant signs in
   through: the person sees Trivet's own sign-in, then a consent screen, once.
   Client registration by Client ID Metadata Documents (`@better-auth/cimd`),
   which MCP now prefers; Dynamic Client Registration only if an assistant we
   need still requires it. The token is checked on every request with
   `verifyAccessTokenRequest`.
3. **The assistant sees exactly what the person sees.** Every tool is scoped
   to the signed-in person's household and the existing visibility rules
   (`visibleRecipes`, hidden households, private recipes), never wider.
4. **Read first, then small writes, never deletes.** An assistant can add a
   dinner or a pantry item, which the person can see and undo in the app. It
   cannot delete recipes, remove people or change the household.
5. **New recipes still get a human's review.** An assistant cannot save a
   recipe. It can hand back a link that opens Trivet's Add a recipe page,
   already reading it.

## The tools

Named for what they do, with short descriptions the assistant reads. All
return plain, compact JSON.

### Read (scope `recipes:read`)

| Tool                | Does                                                                                     | Built on                                 |
| ------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------- |
| `search_recipes`    | Search the library by words, ingredient, tag or course; title, id, time, rating, course  | `searchRecipes`                          |
| `get_recipe`        | One recipe in full: ingredients, method, timings, nutrition, notes, source               | `getRecipe`                              |
| `get_week`          | The plan for a week: each day's dinners, sides, servings                                 | `getWeekPlan`                            |
| `get_shopping_list` | The week's list, merged and scaled, minus the pantry and what is ticked off, plus extras | the planner's list builder, `withExtras` |
| `get_pantry`        | The staples the household always has in                                                  | `listPantryItems`                        |
| `suggest_dinners`   | Trivet's own ranking for the open evenings of a week                                     | `suggestDinners`                         |

### Write (scope `plan:write`)

| Tool                 | Does                                                                                      | Built on                            |
| -------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------- |
| `plan_dinner`        | Put a recipe on a day, or clear the day                                                   | the logic in `setPlannedMealAction` |
| `add_pantry_item`    | Add a staple                                                                              | `addPantryItem`                     |
| `add_to_list`        | Add something no recipe asks for ("dish soap")                                            | `addExtraItem`                      |
| `import_recipe_link` | Return a trivetbox.com link that opens Add a recipe already reading a page; saves nothing | `/upload?url=`                      |

Texting the list is left out on purpose: it sends messages to other people's
phones, and an assistant should not be able to do that on a whim.

### One refactor first

The planner's changes live inside server actions that read the browser's
session (`requireHousehold()`). They move into plain functions that take a
`householdId` (`src/lib/plan-mutations.ts`), called by both the actions and
the MCP tools, so there is one implementation and one set of tests. The
pantry and extras functions already have this shape.

## Safety

- **Shared recipes are other people's words.** A recipe from another
  household, or an imported page, is text the assistant reads, and could be
  written to steer it ("ignore your instructions..."). Tool results present
  recipe text as data, writes are small and visible, nothing destructive is
  offered, and the assistant's own client asks the person before acting.
- **Scopes the person chooses.** Read and write are separate on the consent
  screen; someone can connect an assistant that can only look.
- **Connected assistants on the Household page.** Each one listed with when it
  was connected and last used, and a Disconnect that revokes its tokens at
  once.
- **Limits.** A per-person request allowance, as card imports have, so a
  runaway assistant loop cannot hammer the database.
- **A record.** Each write logs which assistant made it, so "who planned
  this?" has an answer.

## Connecting, for a person

In the Claude app: Settings, Connectors, Add custom connector, paste
`https://trivetbox.com/api/mcp`, sign in to Trivet, approve. A short help
page on trivetbox.com says so, with the same steps for other assistants as
they support remote MCP.

## Phases

Status, 13 November: all four phases built. Phase 4 added the public help
page (`/assistants`, from the design board
https://claude.ai/artifact/GroZmtNXWFLMiFvP7jNn6b), a Connected assistants
card that always shows, and three MCP prompts.

1. **Sign-in.** The `mcp()` plugin, its discovery documents, the consent
   screen in Trivet's design, and the connected-assistants list with
   Disconnect.
2. **Read tools,** behind `recipes:read`. Enough to be useful on its own: ask
   about recipes, the week and the list.
3. **Write tools,** behind `plan:write`, after the refactor.
4. **Polish:** MCP prompts for common asks ("plan my week", "what can I make
   with..."), and the help page.

## Design

A small board: the consent screen (what the assistant will be able to see and
do), the connected-assistants list on the Household page, and the help page.

## Explicitly out of scope

- An assistant saving recipes without review, deleting anything, inviting
  people or texting the list.
- A Trivet assistant inside Trivet. People bring their own.
- Instacart through MCP. Instacart publishes an MCP server of its own; an
  assistant connected to both might one day carry Trivet's list to an
  Instacart cart, but what access it needs is unknown, so it is a lead, not
  part of this plan.

## Testing

1. Every tool, against the test database, returns only the signed-in
   household's data and shared recipes, never another household's private
   recipe, and nothing from a hidden household.
2. A token with only `recipes:read` is refused by every write tool.
3. Disconnecting revokes the token: the next call is refused.
4. `plan_dinner` matches the planner: same servings default, same refusal of a
   recipe the household cannot see.
5. By hand: connect from Claude as a custom connector and ask the three
   questions in Context; check the MCP Inspector lists the tools and their
   descriptions read well.

## Effort

Website only, no iPhone build. The sign-in is the biggest piece, and Better
Auth's plugin carries most of it. The read tools are thin wrappers over
functions that exist; the write tools wait on one small refactor. New
dependencies: `@modelcontextprotocol/sdk`, Better Auth's MCP plugin and
`@better-auth/cimd`.

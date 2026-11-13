import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

/**
 * Ready-made asks (MCP-PLAN.md, phase 4): MCP prompts, which an assistant
 * shows in its prompt menu once Trivet is connected (in Claude, under +).
 * Each is only a starting message in the person's voice, naming the tools to
 * use; the person can edit it before sending, and the tools enforce the
 * rules whatever it says.
 */

function ask(text: string) {
  return {
    messages: [
      { role: "user" as const, content: { type: "text" as const, text } },
    ],
  };
}

export function registerPrompts(server: McpServer, canPlan: boolean) {
  server.registerPrompt(
    "plan_my_week",
    {
      title: "Plan my week",
      description:
        "Suggest dinners for the open evenings of a week from your Trivet library, with anything you'd like taken into account.",
      argsSchema: {
        week: z
          .string()
          .optional()
          .describe('"this" or "next" (default "next"), or any day in it.'),
        wishes: z
          .string()
          .optional()
          .describe(
            "Anything to take into account, e.g. two fish nights, nothing over 45 minutes on weeknights.",
          ),
      },
    },
    ({ week, wishes }) => {
      const which = week?.trim() || "next";
      const lines = [
        `Help me plan ${/^\d{4}-\d{2}-\d{2}$/.test(which) ? `the week of ${which}` : `${which} week`} in Trivet.`,
        "Look at what's already planned with get_week, then use suggest_dinners for the open evenings, and search_recipes if my wishes call for something it didn't pick.",
        wishes?.trim() ? `Take this into account: ${wishes.trim()}` : "",
        "Show me the week as a short list, a day per line, with each dish's time and why it fits.",
        canPlan
          ? "Ask me before planning anything. Once I've agreed, plan them with plan_dinner and tell me what's new on the shopping list."
          : "Don't plan anything; I'll add the ones I like in Trivet.",
      ];
      return ask(lines.filter(Boolean).join("\n"));
    },
  );

  server.registerPrompt(
    "cook_with",
    {
      title: "What can I make with…",
      description:
        "Dishes from your Trivet library that use an ingredient you have.",
      argsSchema: {
        ingredient: z
          .string()
          .describe("The ingredient, e.g. grouper or courgettes."),
      },
    },
    ({ ingredient }) =>
      ask(
        [
          `What can I make with ${ingredient.trim()}?`,
          "Search my Trivet library for it with search_recipes (page through if there are more), and read the most promising with get_recipe.",
          "Give me up to three, best first: the dish, how long it takes, and what else I'd need. If nothing uses it, suggest recipes that would work with a close stand-in, and say that's what they are.",
          canPlan
            ? "If I pick one, ask which day and plan it with plan_dinner."
            : "",
        ]
          .filter(Boolean)
          .join("\n"),
      ),
  );

  server.registerPrompt(
    "still_to_buy",
    {
      title: "What do I still need to buy?",
      description: "This week's shopping list from Trivet, ready for the shop.",
    },
    () =>
      ask(
        [
          "What do I still need to buy this week? Use get_shopping_list.",
          "Group it the way a shop is laid out, keep the amounts, and leave out nothing. Pantry staples are already left off.",
          canPlan
            ? "If I tell you something else I need, add it with add_to_list."
            : "",
        ]
          .filter(Boolean)
          .join("\n"),
      ),
  );
}

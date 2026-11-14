import { afterAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Trivet for AI assistants (MCP-PLAN.md): every tool answers for the signed-in
 * person's household and nothing wider, and Disconnect takes effect on the
 * assistant's very next call. Against the database, since every rule here is
 * a query.
 */
const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
const { InMemoryTransport } =
  await import("@modelcontextprotocol/sdk/inMemory.js");
const { prisma } = await import("@/lib/db");
const { addExtraItem } = await import("@/lib/extras");
const { weekStartOf } = await import("@/lib/grocery");
const {
  assistantAccess,
  disconnectAssistant,
  listConnectedAssistants,
  pruneUnapprovedAssistants,
} = await import("@/lib/mcp/access");
const { claimAssistantCall, recentAssistantActions } =
  await import("@/lib/mcp/activity");
const { trivetMcpServer } = await import("@/lib/mcp/server");
const {
  addPantryItemTool,
  addToListTool,
  importRecipeLinkTool,
  planDinnerTool,
  suggestDinnersTool,
  getPantryTool,
  getRecipeTool,
  getShoppingListTool,
  getWeekTool,
  searchRecipesTool,
} = await import("@/lib/mcp/tools");
const { hideHousehold } = await import("@/lib/moderation");
const { addPantryItem } = await import("@/lib/pantry");
const { createRecipe, setRecipeShared } =
  await import("@/lib/recipe-mutations");
const { recipeInput } = await import("@/lib/recipe-schema");
const { makeHousehold, resetDatabase } = await import("./support/db");

type Kitchen = { householdId: string; userId: string };

const add = async (
  kitchen: Kitchen,
  title: string,
  { shared = false, ingredient = "butter" } = {},
) => {
  const id = await createRecipe(
    recipeInput.parse({
      title,
      course: "DINNER",
      instructions: ["Cook"],
      ingredients: [{ name: ingredient, quantity: 1, unit: "tbsp" }],
    }),
    kitchen.householdId,
    kitchen.userId,
  );
  if (shared) await setRecipeShared(id, kitchen.householdId, true);
  return prisma.recipe.findUniqueOrThrow({
    where: { id },
    select: { id: true, publicId: true },
  });
};

const titles = (result: { recipes: { title: string }[] }) =>
  result.recipes.map((r) => r.title).sort();

const WEEK = weekStartOf(new Date("2026-11-11T12:00:00.000Z"));
const WEEK_OF = "2026-11-11";

let ours: Kitchen;
let theirs: Kitchen;

beforeEach(async () => {
  await resetDatabase();
  ours = await makeHousehold("Ours");
  theirs = await makeHousehold("Theirs");
});

afterAll(async () => {
  await resetDatabase();
  await prisma.$disconnect();
});

describe("the read tools", () => {
  it("search the household's own recipes and the shared library, nothing else", async () => {
    await add(ours, "Our Grouper", { ingredient: "grouper" });
    await add(theirs, "Their Shared Grouper", {
      shared: true,
      ingredient: "grouper",
    });
    await add(theirs, "Their Private Grouper", { ingredient: "grouper" });

    const found = await searchRecipesTool(ours, { query: "grouper" });
    expect(titles(found)).toEqual(["Our Grouper", "Their Shared Grouper"]);
    expect(found.recipes[0].url).toMatch(/\/recipes\/.+/);
  });

  it("leave out a hidden household's shared recipes, by search and by id", async () => {
    const soup = await add(theirs, "Their Soup", { shared: true });
    await hideHousehold(ours.householdId, theirs.householdId);

    expect(titles(await searchRecipesTool(ours, { query: "soup" }))).toEqual(
      [],
    );
    expect(await getRecipeTool(ours, { id: soup.publicId })).toBeNull();
  });

  it("will not open another household's private recipe by its id", async () => {
    const secret = await add(theirs, "Their Secret");
    expect(await getRecipeTool(ours, { id: secret.publicId })).toBeNull();
    expect(await getRecipeTool(ours, { id: secret.id })).toBeNull();

    const mine = await add(ours, "Our Stew");
    const full = await getRecipeTool(ours, { id: mine.publicId });
    expect(full?.title).toBe("Our Stew");
    expect(full?.ingredients).toEqual([
      { quantity: 1, unit: "tbsp", name: "butter", note: null },
    ]);
  });

  it("filter by course and cap the count", async () => {
    for (const n of [1, 2, 3]) await add(ours, `Dinner ${n}`);
    expect(
      (await searchRecipesTool(ours, { course: "DINNER", limit: 2 })).recipes,
    ).toHaveLength(2);
    expect(await searchRecipesTool(ours, { course: "DESSERT" })).toMatchObject({
      total: 0,
      recipes: [],
      nextOffset: null,
    });
  });

  it("say how many match and page through all of them", async () => {
    for (let n = 1; n <= 25; n++) {
      await add(ours, `Chicken ${n}`, { ingredient: "chicken" });
    }
    await add(ours, "Lentil Soup", { ingredient: "lentils" });

    const first = await searchRecipesTool(ours, { query: "chicken" });
    expect(first).toMatchObject({ total: 25, showing: "1-20", nextOffset: 20 });
    expect(first.recipes).toHaveLength(20);

    const rest = await searchRecipesTool(ours, {
      query: "chicken",
      offset: 20,
    });
    expect(rest).toMatchObject({
      total: 25,
      showing: "21-25",
      nextOffset: null,
    });
    const seen = new Set(
      [...first.recipes, ...rest.recipes].map((r) => r.title),
    );
    expect(seen.size).toBe(25);

    expect(
      await searchRecipesTool(ours, { query: "chicken", limit: 50 }),
    ).toMatchObject({ total: 25, nextOffset: null });
  });

  it("show only this household's week, list and pantry", async () => {
    const stew = await add(ours, "Our Stew", { ingredient: "carrots" });
    const theirStew = await add(theirs, "Their Stew", {
      ingredient: "parsnips",
    });
    await prisma.plannedMeal.createMany({
      data: [
        {
          date: WEEK,
          slot: "DINNER",
          servings: 4,
          recipeId: stew.id,
          householdId: ours.householdId,
        },
        {
          date: WEEK,
          slot: "DINNER",
          servings: 4,
          recipeId: theirStew.id,
          householdId: theirs.householdId,
        },
      ],
    });
    await addExtraItem(
      { name: "dish soap" },
      WEEK,
      ours.householdId,
      ours.userId,
    );
    await addExtraItem(
      { name: "their foil" },
      WEEK,
      theirs.householdId,
      theirs.userId,
    );
    await addPantryItem("Salt", ours.householdId, ours.userId);
    await addPantryItem("Their Saffron", theirs.householdId, theirs.userId);

    const week = await getWeekTool(ours, { weekOf: WEEK_OF });
    expect(week.weekStarting).toBe(WEEK.toISOString().slice(0, 10));
    expect(week.days).toHaveLength(7);
    expect(
      week.days.flatMap((d) => d.meals.map((m) => m.recipe?.title)),
    ).toEqual(["Our Stew"]);

    const list = await getShoppingListTool(ours, { weekOf: WEEK_OF });
    expect(list.items.map((i) => i.name).sort()).toEqual([
      "carrots",
      "dish soap",
    ]);
    expect(list.items.find((i) => i.name === "dish soap")?.addedByHand).toBe(
      true,
    );

    expect(await getPantryTool(ours)).toEqual({ pantry: ["Salt"] });
  });
});

describe("the MCP server", () => {
  it("lists the read tools and answers a call for its own household", async () => {
    await add(ours, "Our Grouper", { ingredient: "grouper" });
    await add(theirs, "Their Private Grouper", { ingredient: "grouper" });

    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    const server = trivetMcpServer({
      ...ours,
      clientId: "test",
      canPlan: false,
    });
    await server.connect(serverSide);
    const client = new Client({ name: "test", version: "0" });
    await client.connect(clientSide);

    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "get_pantry",
      "get_recipe",
      "get_shopping_list",
      "get_week",
      "import_recipe_link",
      "search_recipes",
      "suggest_dinners",
    ]);
    // Read tools say so, which lets an assistant run them without asking.
    expect(tools.every((t) => t.annotations?.readOnlyHint)).toBe(true);

    const result = await client.callTool({
      name: "search_recipes",
      arguments: { query: "grouper" },
    });
    const [first] = result.content as { type: string; text: string }[];
    expect(titles(JSON.parse(first.text))).toEqual(["Our Grouper"]);

    const missing = await client.callTool({
      name: "get_recipe",
      arguments: { id: "nope" },
    });
    expect(missing.isError).toBe(true);

    await client.close();
  });
});

describe("connected assistants", () => {
  const connect = async (userId: string, clientId: string, name: string) => {
    const now = new Date();
    await prisma.oauthClient.upsert({
      where: { clientId },
      create: { id: clientId, clientId, name, createdAt: now, updatedAt: now },
      update: {},
    });
    await prisma.oauthConsent.create({
      data: {
        id: `${clientId}-${userId}`,
        clientId,
        userId,
        scopes: ["openid", "recipes:read"],
        resources: [],
        requestedUserInfoClaims: [],
        createdAt: now,
        updatedAt: now,
      },
    });
  };

  it("speak for the person's household while the consent stands", async () => {
    await connect(ours.userId, "claude", "Claude");

    expect(
      await assistantAccess({ sub: ours.userId, client_id: "claude" }),
    ).toEqual({
      userId: ours.userId,
      householdId: ours.householdId,
      clientId: "claude",
    });
    // The client named by `azp` alone, as some tokens carry it.
    expect(
      (await assistantAccess({ sub: ours.userId, azp: "claude" }))?.householdId,
    ).toBe(ours.householdId);
  });

  it("are refused once disconnected, and for anyone who never connected", async () => {
    await connect(ours.userId, "claude", "Claude");

    expect(
      await assistantAccess({ sub: theirs.userId, client_id: "claude" }),
    ).toBeNull();
    expect(await assistantAccess({ sub: ours.userId })).toBeNull();

    await disconnectAssistant(ours.userId, "claude");
    expect(
      await assistantAccess({ sub: ours.userId, client_id: "claude" }),
    ).toBeNull();
    expect(await listConnectedAssistants(ours.userId)).toEqual([]);
  });

  it("are refused for someone no longer in a household", async () => {
    await connect(ours.userId, "claude", "Claude");
    await prisma.user.update({
      where: { id: ours.userId },
      data: { householdId: null },
    });
    expect(
      await assistantAccess({ sub: ours.userId, client_id: "claude" }),
    ).toBeNull();
  });

  it("are listed for their own person only, and Disconnect touches no one else's", async () => {
    await connect(ours.userId, "claude", "Claude");
    await connect(theirs.userId, "claude", "Claude");

    const mine = await listConnectedAssistants(ours.userId);
    expect(mine.map((a) => [a.name, a.scopes])).toEqual([
      ["Claude", ["openid", "recipes:read"]],
    ]);

    await disconnectAssistant(ours.userId, "claude");
    expect(
      await assistantAccess({ sub: theirs.userId, client_id: "claude" }),
    ).not.toBeNull();
  });
});

describe("the write tools", () => {
  const writer = () => ({ ...ours, clientId: "claude" });
  const NEXT_WEEK = (() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 7);
    return weekStartOf(d);
  })();
  const day = (offset: number) => {
    const d = new Date(NEXT_WEEK);
    d.setUTCDate(d.getUTCDate() + offset);
    return d.toISOString().slice(0, 10);
  };

  it("state every safety hint, as the ChatGPT and Claude directories ask", async () => {
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await trivetMcpServer({ ...writer(), canPlan: true }).connect(serverSide);
    const client = new Client({ name: "test", version: "0" });
    await client.connect(clientSide);
    const { tools } = await client.listTools();
    await client.close();

    for (const tool of tools) {
      for (const hint of [
        "readOnlyHint",
        "destructiveHint",
        "idempotentHint",
        "openWorldHint",
      ] as const) {
        expect(typeof tool.annotations?.[hint], `${tool.name} ${hint}`).toBe(
          "boolean",
        );
      }
    }
  });

  it("are offered only to an assistant the person allowed to plan", async () => {
    const names = async (canPlan: boolean) => {
      const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
      await trivetMcpServer({ ...writer(), canPlan }).connect(serverSide);
      const client = new Client({ name: "test", version: "0" });
      await client.connect(clientSide);
      const { tools } = await client.listTools();
      await client.close();
      return tools.map((t) => t.name);
    };

    const looking = await names(false);
    for (const tool of ["plan_dinner", "add_pantry_item", "add_to_list"]) {
      expect(looking).not.toContain(tool);
    }
    expect(await names(true)).toEqual(
      expect.arrayContaining(["plan_dinner", "add_pantry_item", "add_to_list"]),
    );
  });

  it("plan a dinner the way the planner does, and record who did it", async () => {
    await prisma.household.update({
      where: { id: ours.householdId },
      data: { defaultServings: 6 },
    });
    const stew = await add(ours, "Our Stew");

    const planned = await planDinnerTool(writer(), {
      date: day(1),
      recipeId: stew.publicId,
    });
    expect(planned).toMatchObject({
      ok: true,
      planned: "Our Stew",
      servings: 6,
      replaced: null,
    });

    const soup = await add(ours, "Our Soup");
    expect(
      await planDinnerTool(writer(), { date: day(1), recipeId: soup.id }),
    ).toMatchObject({ planned: "Our Soup", replaced: "Our Stew" });

    expect(
      await planDinnerTool(writer(), { date: day(1), clear: true }),
    ).toMatchObject({ ok: true, removed: "Our Soup" });
    expect(await prisma.plannedMeal.count()).toBe(0);

    expect(
      (await recentAssistantActions(ours.userId)).map((a) => a.summary),
    ).toEqual([
      `Took Our Soup off dinner on ${day(1)}`,
      `Planned Our Soup for dinner on ${day(1)}`,
      `Planned Our Stew for dinner on ${day(1)}`,
    ]);
  });

  it("will not plan another household's private recipe, or a malformed day", async () => {
    const secret = await add(theirs, "Their Secret");
    expect(
      await planDinnerTool(writer(), {
        date: day(2),
        recipeId: secret.publicId,
      }),
    ).toMatchObject({ ok: false });
    const mine = await add(ours, "Our Stew");
    expect(
      await planDinnerTool(writer(), {
        date: "2026-02-30",
        recipeId: mine.publicId,
      }),
    ).toMatchObject({ ok: false });
    expect(await planDinnerTool(writer(), { date: day(2) })).toMatchObject({
      ok: false,
    });
    expect(await prisma.plannedMeal.count()).toBe(0);
    expect(await recentAssistantActions(ours.userId)).toEqual([]);
  });

  it("add to the pantry and the list, for this household only", async () => {
    expect(await addPantryItemTool(writer(), { name: "Rice" })).toMatchObject({
      ok: true,
      pantryItem: "Rice",
    });
    expect(
      await addToListTool(writer(), {
        name: "dish soap",
        amount: "1 bottle",
        weekOf: day(0),
      }),
    ).toMatchObject({ ok: true, added: "dish soap", amount: "1 bottle" });

    expect(await getPantryTool(ours)).toEqual({ pantry: ["Rice"] });
    expect(await getPantryTool(theirs)).toEqual({ pantry: [] });
    expect(
      (await getShoppingListTool(ours, { weekOf: day(0) })).items.map(
        (i) => i.name,
      ),
    ).toEqual(["dish soap"]);
    expect(await recentAssistantActions(ours.userId)).toHaveLength(2);
  });

  it("suggest dinners for open evenings without planning any", async () => {
    for (const n of [1, 2, 3, 4]) await add(ours, `Dinner ${n}`);
    const stew = await add(ours, "Our Stew");
    await planDinnerTool(writer(), { date: day(0), recipeId: stew.publicId });

    const { suggestions } = await suggestDinnersTool(ours, {
      weekOf: day(0),
    });
    expect(suggestions.map((s) => s.date)).toEqual([1, 2, 3, 4, 5, 6].map(day));
    const picked = suggestions.flatMap((s) => (s.recipe ? [s.recipe] : []));
    expect(picked.length).toBeGreaterThan(0);
    expect(picked.map((r) => r.title)).not.toContain("Our Stew");
    expect(await prisma.plannedMeal.count()).toBe(1);
  });

  it("hand back an import link and save nothing", () => {
    const result = importRecipeLinkTool({
      url: "https://example.com/recipes/grouper",
    });
    expect(result).toMatchObject({ ok: true });
    expect(result.ok && result.link).toMatch(
      /\/upload\?url=https%3A%2F%2Fexample\.com%2Frecipes%2Fgrouper$/,
    );
    expect(importRecipeLinkTool({ url: "javascript:alert(1)" })).toMatchObject({
      ok: false,
    });
  });
});

describe("the daily allowance", () => {
  it("refuses an assistant past the day's limit, and starts again tomorrow", async () => {
    process.env.MCP_DAILY_LIMIT = "2";
    try {
      const now = new Date("2026-11-13T10:00:00.000Z");
      expect(await claimAssistantCall(ours.userId, now)).toEqual({ ok: true });
      expect(await claimAssistantCall(ours.userId, now)).toEqual({ ok: true });
      expect(await claimAssistantCall(ours.userId, now)).toEqual({
        ok: false,
        retryAfterSeconds: 14 * 60 * 60,
      });
      // Someone else's assistants have their own allowance.
      expect(await claimAssistantCall(theirs.userId, now)).toEqual({
        ok: true,
      });
      expect(
        await claimAssistantCall(
          ours.userId,
          new Date("2026-11-14T00:00:01.000Z"),
        ),
      ).toEqual({ ok: true });
    } finally {
      delete process.env.MCP_DAILY_LIMIT;
    }
  });
});

describe("the prompts", () => {
  const connect = async (canPlan: boolean) => {
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await trivetMcpServer({ ...ours, clientId: "claude", canPlan }).connect(
      serverSide,
    );
    const client = new Client({ name: "test", version: "0" });
    await client.connect(clientSide);
    return client;
  };
  const text = (result: { messages: { content: unknown }[] }) =>
    (result.messages[0].content as { text: string }).text;

  it("offers the three ready-made asks", async () => {
    const client = await connect(false);
    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name).sort()).toEqual([
      "cook_with",
      "plan_my_week",
      "still_to_buy",
    ]);
    await client.close();
  });

  it("only mention planning to an assistant allowed to plan", async () => {
    const looking = await connect(false);
    const asLooker = text(
      await looking.getPrompt({
        name: "plan_my_week",
        arguments: { wishes: "two fish nights" },
      }),
    );
    expect(asLooker).toContain("two fish nights");
    expect(asLooker).not.toContain("plan_dinner");
    await looking.close();

    const planning = await connect(true);
    expect(
      text(
        await planning.getPrompt({
          name: "cook_with",
          arguments: { ingredient: "grouper" },
        }),
      ),
    ).toMatch(/grouper[\s\S]*plan_dinner/);
    await planning.close();
  });
});

describe("pruning unapproved registrations", () => {
  const register = (clientId: string, daysAgo: number) => {
    const at = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
    return prisma.oauthClient.create({
      data: {
        id: clientId,
        clientId,
        name: clientId,
        createdAt: at,
        updatedAt: at,
      },
    });
  };

  it("removes week-old registrations nobody approved, and nothing else", async () => {
    await register("old-unapproved", 8);
    await register("new-unapproved", 1);
    await register("old-connected", 30);
    await prisma.oauthConsent.create({
      data: {
        id: "consent-1",
        clientId: "old-connected",
        userId: ours.userId,
        scopes: ["recipes:read"],
        resources: [],
        requestedUserInfoClaims: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    expect(await pruneUnapprovedAssistants()).toBe(1);
    const left = await prisma.oauthClient.findMany({
      select: { clientId: true },
      orderBy: { clientId: "asc" },
    });
    expect(left.map((c) => c.clientId)).toEqual([
      "new-unapproved",
      "old-connected",
    ]);
  });
});

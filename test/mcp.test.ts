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
const { assistantAccess, disconnectAssistant, listConnectedAssistants } =
  await import("@/lib/mcp/access");
const { trivetMcpServer } = await import("@/lib/mcp/server");
const {
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
    expect(
      (await searchRecipesTool(ours, { course: "DESSERT" })).recipes,
    ).toHaveLength(0);
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
    const server = trivetMcpServer({ householdId: ours.householdId });
    await server.connect(serverSide);
    const client = new Client({ name: "test", version: "0" });
    await client.connect(clientSide);

    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "get_pantry",
      "get_recipe",
      "get_shopping_list",
      "get_week",
      "search_recipes",
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

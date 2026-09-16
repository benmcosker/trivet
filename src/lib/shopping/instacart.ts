import type { GroceryLine } from "../grocery";

import type { ProviderInfo, ShoppingProviderAdapter } from "./types";

/**
 * Instacart Developer Platform integration.
 *
 * Two things worth knowing about what this can and cannot do:
 *
 * - It does not place an order. Both endpoints return a URL to a prepared page
 *   on Instacart; the customer completes checkout there. That is the whole of
 *   the integration surface.
 * - As of August 2026 Instacart is not accepting new developer applications,
 *   and offers no waitlist. That closes the door on both development and
 *   production keys, so this provider cannot be switched on today no matter
 *   how it is configured.
 *
 *   The integration is kept rather than deleted: it is written and tested, and
 *   works the day applications reopen. INSTACART_API_BASE stays configuration
 *   rather than a constant for the same reason - the dev and production hosts
 *   differ, and that is a setting, not a code change.
 */

const DEFAULT_BASE = "https://connect.dev.instacart.tools";

export type InstacartLineItem = {
  name: string;
  display_text?: string;
  line_item_measurements?: { quantity: number; unit: string }[];
};

export type ShoppingListPayload = {
  title: string;
  image_url?: string;
  link_type: "shopping_list";
  line_items: InstacartLineItem[];
};

export type InstacartResult =
  { ok: true; url: string } | { ok: false; error: string };

/**
 * Turn aggregated grocery lines into Instacart line items.
 *
 * `quantity`/`unit` directly on a line item are deprecated in favour of
 * `line_item_measurements`, which allows several measurements per item.
 * Unquantified lines carry no measurement at all rather than a fabricated 1.
 */
export function buildShoppingListPayload(
  lines: GroceryLine[],
  title: string,
): ShoppingListPayload {
  return {
    title,
    link_type: "shopping_list",
    line_items: lines
      .filter((line) => line.name.trim().length > 0)
      .map((line) => {
        const item: InstacartLineItem = { name: line.name.trim() };

        if (line.quantity != null && line.quantity > 0 && line.unit) {
          item.line_item_measurements = [
            { quantity: line.quantity, unit: line.unit },
          ];
        }

        // Show where a line came from, so a combined total is explicable in
        // the cart rather than looking arbitrary.
        if (line.fromRecipes.length > 0) {
          item.display_text = `${line.name.trim()} (${line.fromRecipes.join(", ")})`;
        }

        return item;
      }),
  };
}

export function instacartConfigured(): boolean {
  return Boolean(process.env.INSTACART_API_KEY);
}

export const instacartProvider: ShoppingProviderAdapter = {
  info(): ProviderInfo {
    const available = instacartConfigured();
    return {
      id: "INSTACART",
      label: "Instacart",
      kind: "cart",
      description:
        "Builds a real cart from the whole list. You check out on Instacart.",
      available,
      unavailableReason: available
        ? undefined
        : "Instacart closed new developer applications, with no waitlist, so " +
          "a key cannot be obtained at present. The integration is built and " +
          "switches on the moment one exists.",
    };
  },

  async handoff(lines, weekStart) {
    if (lines.length === 0) {
      return { ok: false, error: "There is nothing on the list to send." };
    }

    const label = weekStart.toISOString().slice(0, 10);
    const result = await createShoppingListPage(
      buildShoppingListPayload(lines, `Trivet \u2014 week of ${label}`),
    );

    if (!result.ok) return result;
    return { ok: true, kind: "cart", url: result.url, itemCount: lines.length };
  },
};

/**
 * Create a shopping list page and return its URL.
 *
 * Network failures and API errors are returned rather than thrown: a failed
 * hand-off should surface as a message next to the button, not a crashed page.
 */
export async function createShoppingListPage(
  payload: ShoppingListPayload,
): Promise<InstacartResult> {
  const apiKey = process.env.INSTACART_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      error:
        "Instacart is not available: they are not accepting new developer " +
        "applications, so there is no key to configure yet. Use Amazon Fresh " +
        "or Whole Foods in the meantime.",
    };
  }

  const base = process.env.INSTACART_API_BASE || DEFAULT_BASE;

  let response: Response;
  try {
    response = await fetch(`${base}/idp/v1/products/products_link`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch {
    return {
      ok: false,
      error: "Could not reach Instacart. Try again shortly.",
    };
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    return {
      ok: false,
      error:
        `Instacart rejected the request (${response.status}). ${detail.slice(0, 200)}`.trim(),
    };
  }

  const body = (await response.json().catch(() => null)) as {
    products_link_url?: string;
  } | null;

  const url = body?.products_link_url;
  if (!url) {
    return { ok: false, error: "Instacart returned no link for the list." };
  }

  return { ok: true, url };
}

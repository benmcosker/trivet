import type { ShoppingProvider } from "@/generated/prisma/enums";
import type { GroceryLine } from "../grocery";

/**
 * How a provider hands a shopping list over: `cart`, an API that builds a real
 * basket and returns one URL to it. Instacart works this way.
 *
 * There used to be a second kind, a search link per ingredient for shops with
 * no ordering API. It was removed with Amazon, the only shop that used it - a
 * hand-off that does not build a basket is not worth a button.
 */
export type HandoffKind = "cart";

export type HandoffResult =
  | { ok: true; kind: "cart"; url: string; itemCount: number }
  | { ok: false; error: string };

export type ProviderInfo = {
  id: ShoppingProvider;
  label: string;
  kind: HandoffKind;
  /** Shown under the button so the difference in behaviour is not a surprise. */
  description: string;
  /** False when the provider needs configuration it has not been given. */
  available: boolean;
  /** Why it is unavailable, when it is. */
  unavailableReason?: string;
};

export type ShoppingProviderAdapter = {
  info(): ProviderInfo;
  handoff(lines: GroceryLine[], weekStart: Date): Promise<HandoffResult>;
};

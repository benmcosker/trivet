import type { ShoppingProvider } from "@/generated/prisma/enums";

import { instacartProvider } from "./instacart";
import type { ProviderInfo, ShoppingProviderAdapter } from "./types";

/**
 * The shops a list can be handed to.
 *
 * Instacart only. Amazon Fresh and Whole Foods were here as a search link per
 * ingredient - Amazon has no ordering API - and nobody adds a week's shopping
 * to a basket one search at a time, so they went. Their enum values stay:
 * past hand-offs in `ShoppingHandoff` are recorded against them.
 */
const providers: Partial<Record<ShoppingProvider, ShoppingProviderAdapter>> = {
  INSTACART: instacartProvider,
};

/** The adapter for a shop, or undefined for one no longer offered. */
export function getProvider(
  id: ShoppingProvider,
): ShoppingProviderAdapter | undefined {
  return providers[id];
}

/** Every registered provider, in the order they should appear in the UI. */
export function listProviders(): ProviderInfo[] {
  return Object.values(providers).map((provider) => provider.info());
}

/**
 * The providers worth putting in front of someone: the ones that can actually
 * do something right now.
 *
 * Instacart is registered, tested and ready, but until a key exists it can only
 * appear as a greyed-out button above a sentence explaining that it will never
 * work. That is a notice, not an option, and it sits on the page every week
 * saying the same thing. Filtering on `available` rather than naming Instacart
 * means the day a key is set it comes back on its own, in its proper place, with
 * no code change.
 */
export function listUsableProviders(): ProviderInfo[] {
  return listProviders().filter((provider) => provider.available);
}

export * from "./types";
export { formatAmount, formatAsPlainText } from "./format";

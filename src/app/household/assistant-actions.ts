"use server";

import { disconnectAssistant } from "@/lib/mcp/access";
import { requireUser } from "@/lib/session";

/**
 * Disconnect an assistant from the signed-in person's Trivet. Its consent and
 * tokens go at once, and the MCP route checks the consent on every call, so
 * the very next request it makes is refused. Only ever the person's own:
 * the user id comes from the session, never from the page.
 */
export async function disconnectAssistantAction(clientId: string) {
  const user = await requireUser();
  await disconnectAssistant(user.id, clientId);
}

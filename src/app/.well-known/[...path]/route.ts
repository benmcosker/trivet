import {
  oauthProviderAuthServerMetadata,
  oauthProviderOpenIdConfigMetadata,
} from "@better-auth/oauth-provider";

import { auth } from "@/lib/auth";

/**
 * The discovery documents an AI assistant reads before signing in
 * (MCP-PLAN.md). They have to sit at the site root, where the standards put
 * them, while Better Auth lives under /api/auth, so this route hands each one
 * to the right place:
 *
 * - `oauth-protected-resource[/api/mcp]` (RFC 9728): what the MCP server is
 *   and which authorization server signs for it. Served by the `mcp()`
 *   plugin, which answers it from inside the auth handler.
 * - `oauth-authorization-server[/api/auth]` (RFC 8414) and
 *   `openid-configuration[/api/auth]`: where to register, sign in and get a
 *   token.
 *
 * Anything else under /.well-known is not ours to answer.
 */
const authServerMetadata = oauthProviderAuthServerMetadata(auth);
const openIdConfig = oauthProviderOpenIdConfigMetadata(auth);

export async function GET(request: Request): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (pathname.startsWith("/.well-known/oauth-protected-resource")) {
    return auth.handler(request);
  }
  if (pathname.startsWith("/.well-known/oauth-authorization-server")) {
    return authServerMetadata(request);
  }
  if (pathname.startsWith("/.well-known/openid-configuration")) {
    return openIdConfig(request);
  }
  return new Response("Not found", { status: 404 });
}

/**
 * Where Trivet's MCP server lives, and what an assistant can be allowed to do.
 * See MCP-PLAN.md.
 *
 * The resource is the address assistants connect to, and the audience every
 * token for it is bound to: a token issued for Trivet's MCP server is no good
 * anywhere else, and a token issued for anything else is no good here.
 */

/** The site's own origin, as sign-in already uses it. */
export function siteOrigin(
  env: Record<string, string | undefined> = process.env,
): string {
  return (env.BETTER_AUTH_URL ?? "https://trivetbox.com").replace(/\/+$/, "");
}

/** `https://trivetbox.com/api/mcp`, or the local equivalent in development. */
export function mcpResource(
  env: Record<string, string | undefined> = process.env,
): string {
  return `${siteOrigin(env)}/api/mcp`;
}

/**
 * What a person can let an assistant do, chosen on the consent screen.
 * Looking and changing are separate, so an assistant can be allowed only to
 * look.
 */
export const MCP_SCOPES = {
  read: "recipes:read",
  write: "plan:write",
} as const;

/** The OpenID scopes an assistant needs to know who signed in, and to stay signed in. */
export const BASE_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
] as const;

/**
 * Whether the consent screen offers planning: on now the write tools exist
 * (MCP-PLAN.md phase 3). Unticked by default, so looking is what a person
 * allows unless they choose more.
 */
export const PLANNING_OFFERED = true;

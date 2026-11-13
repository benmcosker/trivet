"use client";

import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { createAuthClient } from "better-auth/react";

/*
 * `oauthProviderClient` carries an AI assistant's sign-in request through
 * Trivet's own sign-in and consent pages (MCP-PLAN.md): on those pages it
 * adds the signed request to the form's POST, so the server can send the
 * person back to the assistant once they are in. Everywhere else it does
 * nothing.
 */
export const authClient = createAuthClient({
  plugins: [oauthProviderClient()],
});

export const {
  signIn,
  signOut,
  signUp,
  useSession,
  requestPasswordReset,
  resetPassword,
} = authClient;

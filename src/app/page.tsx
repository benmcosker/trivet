import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/AppShell";
import { FrontPage } from "@/components/FrontPage";
import { getCurrentUser } from "@/lib/session";
import { SITE_DESCRIPTION, SITE_TITLE, isTrivetApp } from "@/lib/site";

export const metadata: Metadata = {
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/" },
};

/**
 * The front door. Signed in goes to the library, the iPhone app goes to
 * signing in (it is the app already), and everyone else - people and web
 * filters alike - reads what Trivet is (`FrontPage`).
 */
export default async function Home() {
  if (await getCurrentUser()) redirect("/recipes");
  if (isTrivetApp((await headers()).get("user-agent"))) redirect("/sign-in");

  return (
    <AppShell>
      <FrontPage />
    </AppShell>
  );
}

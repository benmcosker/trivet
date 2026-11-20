import { NextResponse } from "next/server";

import {
  exportFileName,
  householdRecipes,
  toRecipeData,
  toRecipePage,
} from "@/lib/recipe-export";
import { reportError } from "@/lib/report-error";
import { getCurrentHousehold } from "@/lib/session";

/**
 * Download the household's own recipes (`recipe-export.ts`).
 *
 *   /api/export?format=page   a page to read and print (.html)
 *   /api/export?format=data   schema.org recipe data (.json)
 *
 * Sent as an attachment, so a browser saves it and the iPhone app offers the
 * share sheet (`ContentView.swift`) rather than showing it in place.
 */
export async function GET(request: Request) {
  const user = await getCurrentHousehold();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const format = new URL(request.url).searchParams.get("format");
  if (format !== "page" && format !== "data") {
    return NextResponse.json(
      { error: "Ask for format=page or format=data." },
      { status: 400 },
    );
  }

  try {
    const recipes = await householdRecipes(user.householdId);
    const now = new Date();
    const extension = format === "page" ? "html" : "json";
    const body =
      format === "page"
        ? toRecipePage(recipes, user.householdName, now)
        : toRecipeData(recipes);

    return new Response(body, {
      headers: {
        "Content-Type":
          format === "page"
            ? "text/html; charset=utf-8"
            : "application/ld+json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${exportFileName(now, extension)}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    reportError("[export] could not build the download", error);
    return NextResponse.json(
      { error: "The download could not be made. Try again." },
      { status: 500 },
    );
  }
}

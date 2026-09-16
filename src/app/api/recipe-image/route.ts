import { BlobError } from "@vercel/blob";
import { NextResponse } from "next/server";

import { inspectImage } from "@/lib/image-inspect";
import { clearRecipeImage, setRecipeImage } from "@/lib/recipe-image";
import { getCurrentHousehold } from "@/lib/session";

/**
 * A photo is small next to a PDF and needs no model call, but it still crosses
 * a network and a blob store on a phone connection.
 */
export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    return await handle(request);
  } catch (error) {
    console.error("[trivet] recipe image upload failed", error);

    if (error instanceof BlobError) {
      return NextResponse.json(
        {
          error:
            "File storage rejected the image. Nothing was changed - this is " +
            "a configuration problem, not a problem with your photo.",
        },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { error: "Something went wrong saving that image." },
      { status: 500 },
    );
  }
}

async function handle(request: Request) {
  // Every recipe is shared, so any signed-in member of the household can put a
  // photo on any of them - the same rule as editing.
  const user = await getCurrentHousehold();
  if (!user) {
    return NextResponse.json({ error: "Sign in to upload." }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected a file upload." },
      { status: 400 },
    );
  }

  const recipeId = formData.get("recipeId");
  if (typeof recipeId !== "string" || !recipeId) {
    return NextResponse.json({ error: "No recipe given." }, { status: 400 });
  }

  // Removal comes through the same endpoint, so the client never has to decide
  // which one it is calling.
  if (formData.get("remove") === "true") {
    await clearRecipeImage(recipeId, user.householdId);
    return NextResponse.json({ imageUrl: null });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No image received." }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const inspection = inspectImage(bytes);
  if (!inspection.ok) {
    return NextResponse.json({ error: inspection.reason }, { status: 400 });
  }

  const imageUrl = await setRecipeImage(
    recipeId,
    user.householdId,
    bytes,
    `photo.${inspection.extension}`,
    inspection.contentType,
  );

  return NextResponse.json({ imageUrl });
}

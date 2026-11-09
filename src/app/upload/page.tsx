import Typography from "@mui/material/Typography";

import { AppShell } from "@/components/AppShell";
import { UploadWorkflow } from "@/components/UploadWorkflow";
import { requireUser } from "@/lib/session";
import { linkFromShare } from "@/lib/social-links";

export default async function UploadPage({
  searchParams,
}: PageProps<"/upload">) {
  // Upload is for signed-in users only.
  await requireUser();

  // A link shared in from the iPhone Shortcut, read on arrival.
  const { url } = await searchParams;
  const shared = linkFromShare(typeof url === "string" ? url : null);

  return (
    <AppShell>
      {/*
       * "Upload a recipe card" excluded half of what this page now does. The
       * nav item stays "Upload": nav labels and page titles already diverge
       * here - nav "Household", h1 "Your household" - and the deck below is
       * what distinguishes this from /recipes/new, where you type one out.
       */}
      <Typography variant="h1" sx={{ mb: 1 }}>
        Add a recipe
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        A link to a recipe online, a PDF, a photograph of a card, a screenshot,
        or text you have copied. Whichever you give it, it is read
        automatically, and you get a chance to correct anything before it joins
        the shared library.
      </Typography>
      <UploadWorkflow sharedUrl={shared} />
    </AppShell>
  );
}

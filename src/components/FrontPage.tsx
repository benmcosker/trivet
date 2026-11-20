import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Image from "next/image";

import { LinkButton } from "@/components/LinkButton";
import { SITE_DESCRIPTION, SITE_NAME, siteUrl } from "@/lib/site";

/**
 * What a visitor who is not signed in sees at trivetbox.com.
 *
 * Two readers. A person, who should learn in one screen what Trivet is and
 * find the way in. And the classifiers behind workplace web filters, which
 * decide what a site is from the words they can read on it: until this page
 * existed they found a redirect to a sign-in form, filed the site as unknown
 * or suspicious, and blocked it. So the page says plainly, in text rather than
 * in pictures, that this is recipes, meal planning and grocery lists.
 *
 * Signup is by invitation for now, and the page says so rather than offering
 * a form that would refuse most people.
 */

const FEATURES = [
  {
    title: "Bring in any recipe",
    body: "Photograph a recipe card or a cookbook page, paste a link, upload a PDF or share a caption from your phone. Trivet reads it into a recipe you can check and edit: ingredients, method, timings, oven temperature.",
  },
  {
    title: "Plan the week together",
    body: "One plan for the whole household. Pick dinners for the evenings ahead, or let Trivet suggest them from what you have not had for a while, what fits a weeknight and what everyone rated well.",
  },
  {
    title: "The list writes itself",
    body: "Ingredients add up across the week, scaled to how many you are cooking for, minus the staples already in the pantry. Text the list to whoever is shopping, or print it.",
  },
] as const;

const MORE = [
  {
    title: "A library to start from",
    body: "Every household starts with a shared library of family dinners, each with its own photo, so the planner has something in it on day one.",
  },
  {
    title: "Cook mode",
    body: "One step at a time in large type, ingredients a tap away, and the screen kept awake while the phone is propped up.",
  },
  {
    title: "Ask your assistant",
    body: "Connect Claude or ChatGPT and ask what is for dinner tonight, what is on the list, or what to make with the fish you just bought.",
  },
  {
    title: "Yours, not everyone's",
    body: "The recipes you add stay with your household. Share one with a household you choose. No ads, and your data is never sold.",
  },
] as const;

/** Structured data: the nearest thing to a declared category that crawlers read. */
function structuredData() {
  const url = siteUrl();
  return {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebSite", name: SITE_NAME, url },
      {
        "@type": "SoftwareApplication",
        name: SITE_NAME,
        url,
        applicationCategory: "LifestyleApplication",
        operatingSystem: "iOS, Web",
        description: SITE_DESCRIPTION,
        keywords:
          "recipes, recipe box, meal planner, meal planning, grocery list, shopping list, cooking",
      },
    ],
  };
}

export function FrontPage() {
  return (
    <>
      <script
        type="application/ld+json"
        // Static, built from constants above: nothing a visitor typed.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData()) }}
      />

      <Grid
        container
        spacing={{ xs: 4, md: 7 }}
        sx={{ alignItems: "center", mb: { xs: 7, md: 11 } }}
      >
        <Grid size={{ xs: 12, md: 7 }}>
          <Typography
            variant="overline"
            component="p"
            sx={{ color: "secondary.main", mb: { xs: 1, md: 2 } }}
          >
            Recipe box &middot; Meal planner &middot; Grocery list
          </Typography>
          <Typography variant="h1" sx={{ mb: 3, textWrap: "balance" }}>
            Dinner for the week, decided together.
          </Typography>
          <Typography
            sx={{ mb: 4, maxWidth: "48ch", fontSize: { md: "1.25rem" } }}
          >
            {SITE_NAME} keeps your household&apos;s recipes in one place, plans
            the week&apos;s dinners with you, and writes the shopping list.
          </Typography>
          {/*
           * Ink, like the top bar's Sign in: the same way in, so the same
           * button. And its own width on a phone, not the full row - full
           * width is how a form's submit button looks, and nothing is being
           * submitted here.
           */}
          <Stack
            direction={{ xs: "column", sm: "row" }}
            sx={{ gap: 2, alignItems: { xs: "flex-start", sm: "center" } }}
          >
            <LinkButton
              href="/sign-in"
              variant="contained"
              color="ink"
              size="large"
            >
              Sign in
            </LinkButton>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ maxWidth: "36ch" }}
            >
              {SITE_NAME} is invite-only for now. Got an invite? The link in it
              takes you straight to sign-up.
            </Typography>
          </Stack>
        </Grid>
        <Grid size={{ xs: 12, md: 5 }}>
          <Screenshot
            src="/front/plan.jpg"
            alt="This week's dinners in Trivet, one evening per day"
            preload
          />
        </Grid>
      </Grid>

      <Box component="section" sx={{ mb: { xs: 7, md: 11 } }}>
        <Typography variant="h2" sx={{ mb: { xs: 3, md: 4 } }}>
          How it works
        </Typography>
        <Grid container spacing={{ xs: 4, md: 5 }}>
          {FEATURES.map((feature, i) => (
            <Grid key={feature.title} size={{ xs: 12, md: 4 }}>
              <Typography
                variant="overline"
                component="p"
                sx={{ color: "text.secondary", mb: 1 }}
              >
                {String(i + 1).padStart(2, "0")}
              </Typography>
              <Typography variant="h3" sx={{ mb: 1.5 }}>
                {feature.title}
              </Typography>
              <Typography sx={{ maxWidth: "52ch" }}>{feature.body}</Typography>
            </Grid>
          ))}
        </Grid>
      </Box>

      <Grid
        container
        spacing={{ xs: 4, md: 7 }}
        sx={{ alignItems: "center", mb: { xs: 7, md: 11 } }}
      >
        <Grid size={{ xs: 12, md: 5 }} sx={{ order: { xs: 2, md: 1 } }}>
          <Screenshot
            src="/front/upload.jpg"
            alt="Adding a recipe in Trivet from a photo, a PDF, a link or text"
          />
        </Grid>
        <Grid size={{ xs: 12, md: 7 }} sx={{ order: { xs: 1, md: 2 } }}>
          <Typography variant="h2" sx={{ mb: { xs: 3, md: 4 } }}>
            Also in {SITE_NAME}
          </Typography>
          <Stack spacing={3}>
            {MORE.map((item) => (
              <Box key={item.title}>
                <Typography variant="h3" sx={{ mb: 1 }}>
                  {item.title}
                </Typography>
                <Typography sx={{ maxWidth: "56ch" }}>{item.body}</Typography>
              </Box>
            ))}
          </Stack>
        </Grid>
      </Grid>

      <Box
        component="section"
        sx={{ borderTop: 1, borderColor: "divider", pt: { xs: 4, md: 5 } }}
      >
        {/* The privacy, terms and assistants links are in the site footer. */}
        <Typography sx={{ maxWidth: "60ch" }}>
          On iPhone, {SITE_NAME} is also an app: share a photo, a PDF or a
          recipe page to it from any other app and {SITE_NAME} reads it into a
          recipe. Everywhere else, it runs in the browser.
        </Typography>
      </Box>
    </>
  );
}

/**
 * A phone screenshot in a hairline frame.
 *
 * No shadow and no rounding: the theme separates things with a hairline and
 * whitespace, and a floating card would be the one shadow on the site.
 *
 * Smaller than life on a phone. At 340px a screenshot of the app is the width
 * of the screen it is shown on, and its own top bar ("Sign out", the nav)
 * reads as the page carrying on rather than as a picture of the app.
 */
function Screenshot({
  src,
  alt,
  preload = false,
}: {
  src: string;
  alt: string;
  preload?: boolean;
}) {
  return (
    <Box
      sx={{
        maxWidth: { xs: 260, sm: 340 },
        mx: "auto",
        overflow: "hidden",
        border: 1,
        borderColor: "divider",
        bgcolor: "background.paper",
      }}
    >
      <Image
        src={src}
        alt={alt}
        width={786}
        height={1500}
        sizes="(max-width: 599px) 260px, 340px"
        preload={preload}
        style={{ width: "100%", height: "auto", display: "block" }}
      />
    </Box>
  );
}

"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { signOut } from "@/lib/auth-client";
import { PAGE_MAX_WIDTH, PAGE_PADDING_X } from "@/theme/page";
import { fonts } from "@/theme/theme";

const navItems = [
  { href: "/recipes", label: "Recipes" },
  { href: "/plan", label: "This week" },
  { href: "/pantry", label: "Pantry" },
  { href: "/upload", label: "Upload" },
  { href: "/household", label: "Household" },
] as const;

/** Only ever shown to somebody the server has already decided is an admin. */
const adminNavItem = { href: "/admin", label: "Activity" } as const;

/** Karla, small, wide and uppercase - the register the whole chrome speaks in. */
const chromeText = {
  fontFamily: fonts.sans,
  fontSize: 12,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
} as const;

/**
 * Client component on purpose: MUI's `component={Link}` passes a component
 * function as a prop, which a server component cannot send across the RSC
 * boundary. Only the serialisable parts of the user are handed in.
 */
export function TopBar({
  userName,
  isAdmin = false,
}: {
  userName: string | null;
  isAdmin?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [signingOut, setSigningOut] = useState(false);

  /*
   * The link is a convenience for the one person who has the page, not the
   * thing that grants it. `/admin` decides for itself on every request and
   * still answers 404 to anybody else, so a stale or forged `isAdmin` here
   * shows a link that leads nowhere rather than opening anything.
   */
  const items = isAdmin ? [...navItems, adminNavItem] : navItems;

  return (
    <Box
      component="header"
      sx={{
        bgcolor: "background.default",
        borderBottom: 1,
        borderColor: "divider",
      }}
    >
      {/*
       * The rule spans the window; the bar's contents do not. Capped and
       * padded to the same measurements as the page below, so the wordmark and
       * the page title share a left edge at any width.
       */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: { xs: 2, md: 4.25 },
          // Five destinations and a wordmark do not fit across 393px. On a
          // phone the nav wraps to a row of its own rather than being squeezed
          // into whatever is left, which was about one and a half words.
          flexWrap: { xs: "wrap", md: "nowrap" },
          rowGap: { xs: 1, md: 0 },
          width: "100%",
          maxWidth: PAGE_MAX_WIDTH,
          mx: "auto",
          px: PAGE_PADDING_X,
          py: { xs: 2, md: 2.5 },
        }}
      >
        <Box
          component={Link}
          href="/"
          aria-label="Trivet, home"
          sx={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            mr: { xs: 0, md: "14px" },
            flexShrink: 0,
            textDecoration: "none",
            order: 1,
          }}
        >
          {/* A placeholder device, not a finished logo: a clay dot in a green
            field. Drawn in CSS rather than shipped as an asset because two
            circles are two circles, and it inherits the palette for free. */}
          <Box
            aria-hidden
            sx={{
              width: 24,
              height: 24,
              borderRadius: "50%",
              bgcolor: "primary.main",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Box
              sx={{
                width: 9,
                height: 9,
                borderRadius: "50%",
                bgcolor: "secondary.main",
              }}
            />
          </Box>
          <Box
            component="span"
            sx={{
              fontFamily: fonts.serif,
              fontSize: 23,
              letterSpacing: "-0.015em",
              color: "text.primary",
              whiteSpace: "nowrap",
            }}
          >
            {/*
              Set plainly: "Meal Magic" was two words and took a roman/italic
              split, and one word has nothing to split. The mark itself - this
              and the placeholder device above it - is a design job of its own
              rather than something to improvise during a rename.
            */}
            Trivet
          </Box>
        </Box>

        {userName ? (
          <Box
            component="nav"
            sx={{
              display: "flex",
              gap: { xs: "22px", md: "28px" },
              // Second row on a phone, sharing row one at desktop. Wrapping
              // costs about forty pixels and buys five reachable destinations
              // instead of "Recipes" and a clipped T.
              order: { xs: 3, md: 2 },
              flexBasis: { xs: "100%", md: "auto" },
              flex: { md: 1 },
              minWidth: 0,
              overflowX: "auto",
              scrollbarWidth: "none",
              "&::-webkit-scrollbar": { display: "none" },
              // Even a full-width row does not hold five words, so the last one
              // is faded rather than guillotined: a word cut mid-letter reads
              // as a bug, a word fading out reads as more to the right.
              maskImage: {
                xs: "linear-gradient(to right, #000 88%, transparent)",
                md: "none",
              },
              WebkitMaskImage: {
                xs: "linear-gradient(to right, #000 88%, transparent)",
                md: "none",
              },
            }}
          >
            {items.map((item) => {
              const active =
                pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Box
                  key={item.href}
                  component={Link}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  sx={{
                    display: "inline-flex",
                    alignItems: "center",
                    // The link is a comfortable target; the rule underneath it
                    // is not. Padding lives out here so the 2px clay stays 3px
                    // under the word instead of at the bottom of a tall box.
                    minHeight: 34,
                    flexShrink: 0,
                    textDecoration: "none",
                    color: active ? "text.primary" : "text.secondary",
                    "&:hover": { color: "text.primary" },
                  }}
                >
                  <Box
                    component="span"
                    sx={{
                      ...chromeText,
                      fontWeight: active ? 700 : 600,
                      whiteSpace: "nowrap",
                      pb: "3px",
                      borderBottom: 2,
                      borderColor: active ? "secondary.main" : "transparent",
                    }}
                  >
                    {item.label}
                  </Box>
                </Box>
              );
            })}
          </Box>
        ) : null}

        {userName ? (
          <Stack
            direction="row"
            spacing={{ xs: 2, md: 3.5 }}
            sx={{
              alignItems: "center",
              flexShrink: 0,
              order: { xs: 2, md: 3 },
              ml: { xs: "auto", md: 0 },
            }}
          >
            <Box
              component="span"
              sx={{
                fontFamily: fonts.serif,
                fontStyle: "italic",
                fontSize: 16,
                color: "text.muted",
                whiteSpace: "nowrap",
                display: { xs: "none", sm: "block" },
              }}
            >
              {firstName(userName)}
            </Box>
            <Button
              variant="text"
              disabled={signingOut}
              onClick={async () => {
                setSigningOut(true);
                await signOut();
                router.push("/sign-in");
                router.refresh();
              }}
              sx={{ ...chromeText, fontWeight: 600, whiteSpace: "nowrap" }}
            >
              Sign out
            </Button>
          </Stack>
        ) : (
          /*
           * Ordered and pushed right explicitly, mirroring the signed-in
           * controls above. Before this it had neither, and neither did the
           * flexGrow spacer that used to stand in for the nav - so both
           * defaulted to `order: 0` and sorted ahead of the wordmark's
           * `order: 1`. The spacer then grew, and the signed-out header read
           * "Sign in | Trivet", right-aligned, with the wordmark second.
           */
          <Button
            component={Link}
            href="/sign-in"
            variant="contained"
            color="ink"
            sx={{ flexShrink: 0, order: 2, ml: "auto" }}
          >
            Sign in
          </Button>
        )}
      </Box>
    </Box>
  );
}

/** "Ben McOsker" is the account; "Ben" is who is standing at the counter. */
function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

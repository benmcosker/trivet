"use client";

import Box from "@mui/material/Box";
import { keyframes } from "@mui/material/styles";
import Typography from "@mui/material/Typography";

/**
 * What a page shows while it loads: its outline, at once, instead of nothing.
 *
 * Drawn in design_handoff_trivet_loading/ (state 4). The page's own heading
 * where it is known, then quiet shapes where the content will be: tiles in
 * the same stripes as a recipe with no photo, rules where lists will be. They
 * breathe slowly rather than shimmer, which suits a page that otherwise never
 * moves, and stand still for anyone who has asked for reduced motion.
 *
 * Used by each main page's `loading.tsx`, which Next.js shows while the page's
 * data is fetched and prefetches, so a tap shows it straight away.
 */

const breathe = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.55; }
`;

const waiting = {
  animation: `${breathe} 1.8s ease-in-out infinite`,
  "@media (prefers-reduced-motion: reduce)": { animation: "none" },
} as const;

const stripes =
  "repeating-linear-gradient(135deg, var(--mui-palette-background-stripeA) 0 11px, var(--mui-palette-background-stripeB) 11px 22px)";

function Bar({ width, height = 12 }: { width: string; height?: number }) {
  return (
    <Box sx={{ height, width, bgcolor: "background.stripeB", flexShrink: 0 }} />
  );
}

/** Varied, so a column of placeholders does not read as a table. */
const WIDTHS = ["88%", "74%", "92%", "80%", "70%", "86%", "78%", "90%"];
const SHORT = ["52%", "40%", "60%", "46%", "55%", "38%", "48%", "44%"];

export function PageOutline({
  kind,
  title,
}: {
  kind: "library" | "week" | "list" | "recipe";
  /** The page's heading, when it is the same whatever loads. */
  title?: string;
}) {
  return (
    <Box role="status" aria-label="Loading" aria-busy="true">
      {title ? (
        <Typography
          variant="h1"
          component="p"
          sx={{
            mb: 2.5,
            // The library's heading is set smaller on a phone than the
            // theme's h1 (see recipes/page.tsx); the outline matches it, so
            // nothing jumps when the page arrives.
            ...(kind === "library"
              ? {
                  fontSize: { xs: "1.875rem", sm: "3rem", md: "4.75rem" },
                  lineHeight: { xs: 1.05, sm: 0.95 },
                }
              : {}),
          }}
        >
          {title}
        </Typography>
      ) : (
        <Box sx={{ ...waiting, mb: 2.5, pt: 1 }}>
          <Bar width="60%" height={36} />
        </Box>
      )}

      <Box sx={waiting}>
        {kind === "library" ? (
          <>
            <Box
              sx={{
                height: 44,
                borderBottom: 1,
                borderColor: "divider",
                mb: 3,
              }}
            />
            {/*
             * The featured recipe at the top of the library, as `RecipeHero`
             * lays it out: photo beside its words on a wide screen, above
             * them on a phone.
             */}
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", md: "1.35fr 1fr" },
                gap: { xs: 2, sm: 3, md: "52px" },
                pb: { xs: "32px", sm: "56px" },
                borderBottom: 1,
                borderColor: "divider",
              }}
            >
              <Box
                sx={{
                  height: { xs: 190, sm: 340, md: 480 },
                  background: stripes,
                }}
              />
              <Box
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  gap: "22px",
                }}
              >
                <Bar width="30%" height={10} />
                <Box
                  sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}
                >
                  <Bar width="90%" height={36} />
                  <Bar width="55%" height={36} />
                </Box>
                <Box
                  sx={{
                    display: { xs: "none", sm: "flex" },
                    flexDirection: "column",
                    gap: 1.25,
                  }}
                >
                  <Bar width="80%" />
                  <Bar width="72%" />
                  <Bar width="40%" />
                </Box>
                <Bar width="45%" height={10} />
              </Box>
            </Box>

            {/*
             * The grid under it, as the library lays it out: one column on a
             * phone with the photo beside the words, two and then three with
             * the photo above.
             */}
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: {
                  xs: "1fr",
                  sm: "repeat(2, minmax(0, 1fr))",
                  md: "repeat(3, minmax(0, 1fr))",
                },
                gap: "44px 40px",
                pt: "44px",
              }}
            >
              {WIDTHS.slice(0, 6).map((width, index) => (
                <Box
                  key={index}
                  sx={{
                    display: "grid",
                    gridTemplateColumns: { xs: "116px 1fr", sm: "1fr" },
                    alignItems: { xs: "center", sm: "start" },
                    gap: { xs: 2, sm: 1.25 },
                  }}
                >
                  <Box
                    sx={{ height: { xs: 116, sm: 230 }, background: stripes }}
                  />
                  <Box
                    sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}
                  >
                    <Bar width={width} />
                    <Bar width={SHORT[index]} />
                  </Box>
                </Box>
              ))}
            </Box>
          </>
        ) : null}

        {kind === "week" ? (
          <Box sx={{ display: "flex", flexDirection: "column" }}>
            {WIDTHS.slice(0, 7).map((width, index) => (
              <Box
                key={index}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 2,
                  py: 2,
                  borderTop: 1,
                  borderColor: "divider",
                }}
              >
                <Box
                  sx={{
                    width: 64,
                    height: 48,
                    background: stripes,
                    flexShrink: 0,
                  }}
                />
                <Box
                  sx={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    gap: 1,
                  }}
                >
                  <Bar width="30%" height={10} />
                  <Bar width={width} />
                </Box>
              </Box>
            ))}
          </Box>
        ) : null}

        {kind === "list" ? (
          <Box sx={{ display: "flex", flexDirection: "column" }}>
            {SHORT.map((width, index) => (
              <Box
                key={index}
                sx={{ py: 2, borderTop: 1, borderColor: "divider" }}
              >
                <Bar width={width} />
              </Box>
            ))}
          </Box>
        ) : null}

        {kind === "recipe" ? (
          <>
            <Box
              sx={{ height: { xs: 160, sm: 380 }, background: stripes, mb: 3 }}
            />
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", md: "1fr 2fr" },
                gap: 3,
              }}
            >
              {[5, 4].map((rows, column) => (
                <Box
                  key={column}
                  sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}
                >
                  <Bar width="40%" height={20} />
                  {WIDTHS.slice(0, rows).map((width, index) => (
                    <Bar key={index} width={width} />
                  ))}
                </Box>
              ))}
            </Box>
          </>
        ) : null}
      </Box>
    </Box>
  );
}

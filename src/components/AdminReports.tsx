"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { resolveReportAction } from "@/app/recipes/moderation-actions";
import type { OpenReport } from "@/lib/moderation";

/**
 * Reports waiting for an answer, oldest first. Apple asks that a report get a
 * timely answer, and the terms promise one within a day.
 */
export function AdminReports({ reports }: { reports: OpenReport[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function act(id: string, action: "unshare" | "deleteReview" | "dismiss") {
    startTransition(async () => {
      await resolveReportAction(id, action);
      router.refresh();
    });
  }

  return (
    <Card variant="outlined" sx={{ mb: 3 }}>
      <CardContent>
        <Typography variant="h3" sx={{ mb: 0.5 }}>
          Reports
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {reports.length === 0
            ? "Nothing reported. Every report is emailed to the admins too."
            : `${reports.length} waiting. Answer within a day, as the terms promise.`}
        </Typography>

        <Stack spacing={2}>
          {reports.map((report) => (
            <Box
              key={report.id}
              sx={{ borderTop: 1, borderColor: "divider", pt: 1.5 }}
            >
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {report.reason}
                {report.recipe ? (
                  <>
                    {" · "}
                    <Link href={`/recipes/${report.recipe.publicId}`}>
                      {report.recipe.title}
                    </Link>{" "}
                    from {report.recipe.household}
                  </>
                ) : report.review ? (
                  <>
                    {" · "}review by {report.review.author} on{" "}
                    <Link href={`/recipes/${report.review.recipePublicId}`}>
                      {report.review.recipeTitle}
                    </Link>
                  </>
                ) : null}
              </Typography>
              {report.review?.body ? (
                <Typography
                  variant="body2"
                  sx={{ whiteSpace: "pre-wrap", mt: 0.5 }}
                >
                  “{report.review.body}” ({report.review.stars} stars)
                </Typography>
              ) : null}
              {report.note ? (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mt: 0.5 }}
                >
                  Note: {report.note}
                </Typography>
              ) : null}
              <Typography variant="caption" color="text.secondary">
                {report.reporter ?? "A deleted account"},{" "}
                {new Date(report.createdAt).toISOString().slice(0, 10)}
              </Typography>
              <Stack direction="row" sx={{ gap: 1, mt: 1, flexWrap: "wrap" }}>
                {report.recipe?.isShared ? (
                  <Button
                    size="small"
                    color="error"
                    variant="outlined"
                    disabled={pending}
                    onClick={() => act(report.id, "unshare")}
                  >
                    Take it out of the library
                  </Button>
                ) : null}
                {report.review ? (
                  <Button
                    size="small"
                    color="error"
                    variant="outlined"
                    disabled={pending}
                    onClick={() => act(report.id, "deleteReview")}
                  >
                    Delete the review
                  </Button>
                ) : null}
                <Button
                  size="small"
                  disabled={pending}
                  onClick={() => act(report.id, "dismiss")}
                >
                  {report.recipe && !report.recipe.isShared
                    ? "Already private: close"
                    : "Nothing wrong: close"}
                </Button>
              </Stack>
            </Box>
          ))}
        </Stack>
      </CardContent>
    </Card>
  );
}

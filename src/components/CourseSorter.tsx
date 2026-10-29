"use client";

import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useState, useTransition } from "react";

import { setCourseAction } from "@/app/recipes/sort/actions";
import {
  COURSE_LABEL,
  RECIPE_COURSES,
  type RecipeCourse,
} from "@/lib/recipe-schema";

type SortableRecipe = {
  id: string;
  title: string;
  course: RecipeCourse | null;
};

/**
 * One row per recipe: its title in the library's voice, and the six courses
 * beneath it as small uppercase labels - the operable voice - tapped once to
 * set.
 *
 * The chosen one wears the clay underline the navigation uses for "you are
 * here", so a sorted row and the page you are on are marked the same way.
 * Saved on tap, shown before the server answers, and put back if it refuses:
 * a hundred rows is a lot of taps to make anyone wait on.
 */
export function CourseSorter({ recipes }: { recipes: SortableRecipe[] }) {
  const [courses, setCourses] = useState<Record<string, RecipeCourse | null>>(
    () => Object.fromEntries(recipes.map((r) => [r.id, r.course])),
  );
  const [failed, setFailed] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function choose(id: string, course: RecipeCourse) {
    const previous = courses[id];
    if (previous === course) return;

    setCourses((c) => ({ ...c, [id]: course }));
    setFailed(null);
    startTransition(async () => {
      const result = await setCourseAction(id, course);
      if (!result.ok) {
        setCourses((c) => ({ ...c, [id]: previous }));
        setFailed(id);
      }
    });
  }

  if (recipes.length === 0) {
    return (
      <Typography color="text.secondary">
        No recipes of your own yet.
      </Typography>
    );
  }

  return (
    <Stack divider={<Divider />}>
      {recipes.map((recipe) => (
        <Box key={recipe.id} sx={{ py: 1.5 }}>
          {/* Serif, wrapping, never truncated - the library's own voice. */}
          <Typography variant="h6" component="p" sx={{ fontSize: "1.125rem" }}>
            {recipe.title}
          </Typography>
          {/*
           * Two rows of three on a phone, one line from `sm` up. Six labels
           * in this voice measure about 400px and the phone gives 353: as a
           * wrapping row, five fit and OTHER was stranded on a line of its
           * own, which read as a layout accident. Tightening the gaps to
           * squeeze one line left 8px to spare at 393 and wrapped anyway on
           * a 360px Android. A grid makes the break deliberate and the same
           * on every row, so each label is in the same place every time -
           * which matters on a page tapped a hundred times in a row.
           */}
          <Box
            role="group"
            aria-label={`What ${recipe.title} is`}
            sx={{
              mt: 0.5,
              display: "grid",
              gridTemplateColumns: {
                xs: "repeat(3, max-content)",
                sm: "repeat(6, max-content)",
              },
              columnGap: "20px",
              justifyContent: "start",
            }}
          >
            {RECIPE_COURSES.map((course) => {
              const chosen = courses[recipe.id] === course;
              return (
                <ButtonBase
                  key={course}
                  aria-pressed={chosen}
                  onClick={() => choose(recipe.id, course)}
                  sx={(theme) => ({
                    ...theme.typography.overline,
                    justifySelf: "start",
                    lineHeight: 1.6,
                    // A padded target, not a bare word: these sit close
                    // together and are tapped a hundred times in a row.
                    py: "6px",
                    color: chosen ? "text.primary" : "text.secondary",
                    fontWeight: chosen ? 700 : 600,
                    "&:hover": { color: "text.primary" },
                  })}
                >
                  <Box
                    component="span"
                    sx={{
                      pb: "3px",
                      borderBottom: 2,
                      borderColor: chosen ? "secondary.main" : "transparent",
                    }}
                  >
                    {COURSE_LABEL[course]}
                  </Box>
                </ButtonBase>
              );
            })}
          </Box>
          {failed === recipe.id ? (
            <Typography
              variant="body2"
              sx={{ color: "secondary.main", mt: 0.5 }}
            >
              That did not save. Try again.
            </Typography>
          ) : null}
        </Box>
      ))}
    </Stack>
  );
}

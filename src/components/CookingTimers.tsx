"use client";

import CloseIcon from "@mui/icons-material/Close";
import TimerOutlinedIcon from "@mui/icons-material/TimerOutlined";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Collapse from "@mui/material/Collapse";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { visuallyHidden } from "@mui/utils";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import {
  MAX_TIMERS,
  describeSeconds,
  formatCountdown,
  parseTimers,
  spokenCountdown,
  type CookingTimer,
  type StepDuration,
} from "@/lib/cooking-timers";
import {
  cancelNativeTimer,
  hasTimerBridge,
  scheduleNativeTimer,
} from "@/lib/timer-bridge";

/**
 * Timers for cooking mode.
 *
 * Where they are kept: `localStorage`, not `sessionStorage` like the step
 * position. A step is a convenience; a timer is a promise about the wall clock
 * that has to outlive the phone killing the web view. Each is stored as the
 * absolute time it ends, so nothing is written as it ticks and a reload, or a
 * phone that slept, recomputes correctly.
 *
 * The store is read during render with `useSyncExternalStore` and written only
 * from the handlers that start, extend or stop a timer - the shape CLAUDE.md
 * asks for, and for the same reason: an effect that mirrors state into storage
 * fires on mount and overwrites what was there.
 */

const subscribeNever = () => () => {};
const listeners = new Set<() => void>();

function subscribeStore(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeTimers(key: string, timers: CookingTimer[]) {
  try {
    localStorage.setItem(key, JSON.stringify(timers));
  } catch {
    // Storage refused (private mode, full). The timer still runs this visit.
    return;
  }
  listeners.forEach((l) => l());
}

let audio: AudioContext | null = null;

/** Must run inside a tap, or iOS refuses to play anything later. */
function unlockAudio() {
  try {
    audio ??= new AudioContext();
    void audio.resume();
  } catch {
    // No Web Audio. The row, the title and the vibration still say so.
  }
}

/** Three short beeps. */
function beep() {
  if (!audio || audio.state !== "running") return;
  const start = audio.currentTime;
  for (let i = 0; i < 3; i++) {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.2;
    osc.connect(gain);
    gain.connect(audio.destination);
    osc.start(start + i * 0.35);
    osc.stop(start + i * 0.35 + 0.2);
  }
}

function ring() {
  beep();
  try {
    navigator.vibrate?.([300, 150, 300]);
  } catch {
    // Not everywhere (iOS has none).
  }
}

export function useCookingTimers(recipeId: string, recipeTitle: string) {
  const key = `cooking-timers:${recipeId}`;
  const getSnapshot = useCallback(() => readRaw(key), [key]);
  const raw = useSyncExternalStore(subscribeStore, getSnapshot, () => null);
  const [now, setNow] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const inApp = useSyncExternalStore(
    subscribeNever,
    () => hasTimerBridge(),
    () => false,
  );

  // The clock is read in a timer callback, never during render: the server
  // has none worth matching, and the dock only appears after the first tick.
  const timers = useMemo(() => parseTimers(raw, now || 0), [raw, now]);
  const active = timers.length > 0;
  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const interval = setInterval(tick, 1000);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(first);
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [active]);

  // Ring while a timer has just finished: now, then every five seconds for a
  // minute. One that finished while the page was away and is older than that
  // is shown as finished, quietly.
  const rung = useRef(new Map<string, number>());
  useEffect(() => {
    if (!now) return;
    for (const t of timers) {
      if (t.endsAt > now) continue;
      const since = now - t.endsAt;
      if (since > 60_000) continue;
      const bucket = Math.floor(since / 5000);
      if (rung.current.get(t.id) === bucket) continue;
      rung.current.set(t.id, bucket);
      ring();
    }
  }, [now, timers]);

  const anyDone = now > 0 && timers.some((t) => t.endsAt <= now);
  useEffect(() => {
    if (!anyDone) return;
    const original = document.title;
    document.title = `Timer done - ${original}`;
    return () => {
      document.title = original;
    };
  }, [anyDone]);

  const current = useCallback(
    () => parseTimers(readRaw(key), Date.now()),
    [key],
  );

  const schedule = useCallback(
    (t: CookingTimer) =>
      scheduleNativeTimer({
        id: `${recipeId}:${t.id}`,
        at: t.endsAt,
        title: recipeTitle,
        body: `Step ${t.step + 1}: ${t.display} is up. Time to check.`,
      }),
    [recipeId, recipeTitle],
  );

  const start = useCallback(
    (step: number, duration: StepDuration) => {
      unlockAudio();
      const at = Date.now();
      const existing = current();
      if (existing.length >= MAX_TIMERS) return;
      const timer: CookingTimer = {
        id: `${at.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        step,
        label: duration.label,
        endsAt: at + duration.seconds * 1000,
        // What it runs for, not what the step said: a range starts at its low
        // end, and "5–8 min is up" would be wrong at five.
        display: describeSeconds(duration.seconds),
      };
      writeTimers(key, [...existing, timer]);
      schedule(timer);
      setNow(at);
      setAnnouncement(`Timer started: ${duration.display}, step ${step + 1}.`);
    },
    [current, key, schedule],
  );

  const addTime = useCallback(
    (id: string, minutes: number) => {
      unlockAudio();
      const at = Date.now();
      const next = current().map((t) =>
        t.id === id
          ? { ...t, endsAt: Math.max(t.endsAt, at) + minutes * 60_000 }
          : t,
      );
      writeTimers(key, next);
      const changed = next.find((t) => t.id === id);
      if (changed) {
        rung.current.delete(id);
        schedule(changed);
      }
      setNow(at);
    },
    [current, key, schedule],
  );

  const stop = useCallback(
    (id: string, step: number) => {
      writeTimers(
        key,
        current().filter((t) => t.id !== id),
      );
      rung.current.delete(id);
      cancelNativeTimer(`${recipeId}:${id}`);
      setAnnouncement(`Step ${step + 1} timer stopped.`);
    },
    [current, key, recipeId],
  );

  return { timers, now, inApp, announcement, start, addTime, stop };
}

/** The tap-to-start buttons under a step, one per duration in its text. */
export function StepTimerButtons({
  durations,
  full,
  onStart,
}: {
  durations: StepDuration[];
  full: boolean;
  onStart: (duration: StepDuration) => void;
}) {
  if (durations.length === 0) return null;
  if (full) {
    return (
      <Typography
        variant="body2"
        color="secondary.main"
        sx={{ mt: 2, fontStyle: "italic" }}
      >
        Three timers is the most. Stop one to start another.
      </Typography>
    );
  }
  return (
    <Stack direction="row" sx={{ mt: 2, flexWrap: "wrap", gap: 1 }}>
      {durations.map((d, i) => (
        <Button
          key={`${d.display}-${i}`}
          variant="outlined"
          startIcon={<TimerOutlinedIcon />}
          onClick={() => onStart(d)}
          sx={{ minHeight: 48, textTransform: "uppercase" }}
        >
          {d.display}
        </Button>
      ))}
    </Stack>
  );
}

/** Running timers, above the step so Back and Next never move for them. */
export function TimerDock({
  timers,
  now,
  inApp,
  announcement,
  onGoTo,
  onAdd,
  onStop,
}: {
  timers: CookingTimer[];
  now: number;
  inApp: boolean;
  announcement: string;
  onGoTo: (step: number) => void;
  onAdd: (id: string, minutes: number) => void;
  onStop: (id: string, step: number) => void;
}) {
  const open = timers.length > 0 && now > 0;
  return (
    <>
      <Box role="status" aria-live="polite" sx={visuallyHidden}>
        {announcement}
      </Box>
      <Collapse in={open} unmountOnExit>
        <Box
          role="region"
          aria-label="Timers"
          sx={{ position: "sticky", top: 0, zIndex: 2 }}
        >
          {timers.map((t) => {
            const left = t.endsAt - now;
            const done = left <= 0;
            const label = `STEP ${t.step + 1}${t.label ? ` · ${t.label.toUpperCase()}` : ""}`;
            return (
              <Box
                key={t.id}
                role={done ? "alert" : undefined}
                aria-label={
                  done
                    ? `Step ${t.step + 1} ${t.label}: ${t.display} is up`
                    : `Step ${t.step + 1} ${t.label}, ${spokenCountdown(left)} left`
                }
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  minHeight: done ? 72 : 48,
                  px: 1,
                  bgcolor: done ? "secondary.main" : "background.raised",
                  color: done ? "background.default" : "text.primary",
                  borderBottom: "1px solid",
                  borderColor: "divider",
                }}
              >
                <Button
                  onClick={() => onGoTo(t.step)}
                  sx={{
                    minHeight: 48,
                    flex: 1,
                    justifyContent: "flex-start",
                    textAlign: "left",
                    color: "inherit",
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                  }}
                >
                  {done ? `${t.display} is up · ${label}` : label}
                </Button>
                {done ? (
                  <>
                    <Button
                      variant="contained"
                      onClick={() => onStop(t.id, t.step)}
                      sx={{
                        minHeight: 48,
                        bgcolor: "background.default",
                        color: "text.primary",
                        "&:hover": { bgcolor: "background.default" },
                      }}
                    >
                      Stop
                    </Button>
                    <Button
                      onClick={() => onAdd(t.id, 2)}
                      sx={{ minHeight: 48, color: "inherit" }}
                    >
                      +2 min
                    </Button>
                  </>
                ) : (
                  <>
                    <Typography
                      sx={{
                        fontWeight: 700,
                        fontSize: "1.5rem",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {formatCountdown(left)}
                    </Typography>
                    <Button
                      onClick={() => onAdd(t.id, 1)}
                      sx={{ minHeight: 48 }}
                    >
                      +1 min
                    </Button>
                    <IconButton
                      aria-label={`Stop step ${t.step + 1} timer`}
                      onClick={() => onStop(t.id, t.step)}
                      sx={{ width: 48, height: 48 }}
                    >
                      <CloseIcon />
                    </IconButton>
                  </>
                )}
              </Box>
            );
          })}
          {inApp ? null : (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: "block", px: 1, py: 0.5 }}
            >
              Timers only sound while this page is open.
            </Typography>
          )}
        </Box>
      </Collapse>
    </>
  );
}

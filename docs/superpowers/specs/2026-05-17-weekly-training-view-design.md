# Weekly training view — design

Date: 2026-05-17
Status: implemented (2026-05-17)

## Problem

The dashboard "recent activity" section is an accordion of the last 30 logged
workouts. It answers "what did I lift" only by drilling in, and gives no sense
of training cadence — you cannot see at a glance which days you trained, which
you rested, or which planned sessions you skipped. Users want to know **when**
and **what** each recent workout was, and whether they are showing up.

## Goal

Replace the accordion with a **weekly training view**: a Monday→Sunday agenda
for one week at a time, showing each day's state (trained / rest / missed /
planned) and the logged session content, with prev/next week navigation.

This serves two needs equally: the day-by-day column makes the
trained/rest/missed pattern obvious (cadence), while inline summaries plus
expand give quick recall of what each session contained (content).

## Scope decisions

- **Window:** one week at a time, Monday-anchored. Not a multi-week heatmap.
- **Plan overlay:** the structured weekly plan (`planned_session` per weekday)
  is used to distinguish a planned-but-skipped day ("missed") from a true
  "rest" day (no plan).
- **History:** reachable via prev-week navigation, not a separate list.
- Out of scope (deferred, consistent with the MVP spec): progression charts,
  endurance/Strava, per-user timezone, RPE.

## Behavior & day states

Seven day-rows, Monday→Sunday. Each row resolves to exactly one state:

| State     | Condition                                                                                        | Display                                                                                                                                            |
| --------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `done`    | ≥1 workout logged that day (regardless of whether a plan existed)                                | session title + one-line lift summary (`bench 185×5 · ohp 115×6 · +3 more`); click expands the full set list (existing per-day accordion behavior) |
| `missed`  | a `planned_session` exists for that weekday, day is strictly **before** today, no workout logged | planned session title, "missed" label                                                                                                              |
| `planned` | a `planned_session` exists for that weekday, day is today or later this week, no workout logged  | planned session title, "planned" label                                                                                                             |
| `rest`    | no `planned_session` for that weekday and no workout logged                                      | "rest" / "no plan"                                                                                                                                 |

Rules:

- State is conveyed by **glyph and text label**, never color alone (design
  system rule: color is never the only state signal).
- Today's row is visually highlighted.
- Multiple workouts on one day → still `done`; the summary concatenates across
  that day's sessions.
- A logged workout on a day with no plan is still `done` (not `rest`).

## Week boundaries & navigation

- Weeks are **Monday-start**, computed in `APP_TZ` (`America/New_York`),
  consistent with the existing `todayInfo` / `dayOfWeek` convention
  (Sun=0 … Sat=6, JS `getDay` style).
- Header shows the range, e.g. `‹ may 11–17 ›`.
- `‹` pages to prior weeks indefinitely.
- `›` is **disabled once the current week is reached**: there are no logged
  future workouts, and the plan is the same recurring plan every week, so
  paging forward shows nothing new.

## Architecture

Follows the project rule: thin server actions over pure, testable libs.

- **`src/lib/week.ts`** — pure week math. `weekStartFor(date)` and
  `weekRange(weekStart)` in `APP_TZ`, Monday-anchored. No DB. Unit-tested for
  month/year and DST boundaries.
- **`src/lib/week-view.ts`** — pure state derivation.
  `buildTrainingWeek({ weekStart, now, workouts, sets, planDays }) → DayCell[7]`.
  All `done`/`missed`/`planned`/`rest` logic lives here. No DB. Unit-tested
  against the full state matrix.
- **`src/app/actions/training-week.ts`** — thin `"use server"` wrapper:
  resolves the session, scopes by `userId`, queries that week's `workout` +
  `workout_set` (windowed by `performedAt`, replacing the current dashboard
  `limit(30)` fetch) and the user's plan, delegates to `buildTrainingWeek`.
  Unauthenticated → `redirect("/login")`, consistent with other actions.
- **`src/app/(app)/dashboard/training-week.tsx`** — client component. Renders
  the agenda and the `‹ ›` controls; per-day expand for `done` days. Prev/next
  call the server action.
- **`src/app/(app)/page.tsx`** — server-renders the current week initially (no
  extra round-trip, same as today). Its bespoke 30-workout query and
  `workoutViews` mapping are removed; that logic moves into the action/lib.
  `loadTrailingLoad`, `TodaySession`, `ProgressionInbox`, and the "past
  readiness checks" section are untouched.
- The old `src/app/(app)/dashboard/recent-activity.tsx` is removed.

## UI / design system

- Layout direction **B (vertical agenda)** from brainstorming: one row per day,
  top-down, inline one-line lift summary with expand for full sets. Reads
  naturally on mobile.
- Built from `@dustin-riley/design` primitives only: `--ds-*` tokens, `.ds-*`
  classes, Lucide icons. No hard-coded hex/px. Three radii (8/16/999), warm
  shadows only, sentence-case copy, no emoji.
- Section heading changes from "recent activity" to **"training week"**
  (sentence case).

## Edge cases

- New user, no workouts and no plan → seven `rest` rows plus the existing
  "import your Strong CSV" prompt shown once below the week.
- Plan exists but nothing logged → rows correctly show `planned` / `missed`
  even with zero workouts.
- Empty week in the past (no plan, no workouts that week) → seven `rest` rows,
  navigation still works.

## Testing

- **Unit** (`npm test`, offline, no DB/network):
  - `week.ts`: week-start math across month boundary, year boundary, and DST
    transitions, in `APP_TZ`.
  - `week-view.ts`: full day-state matrix — `done`, `missed`, `planned`,
    `rest`; the today edge (planned today with/without a logged workout);
    an unplanned logged workout counting as `done`; multiple workouts on one
    day; summary truncation (`+N more`).
- **Integration** (`npm run test:integration`, live `DATABASE_URL`):
  - `training-week` server action: `userId` scoping, week windowing by
    `performedAt`, a synthetic `itest-*` user with one planned day and one
    logged day; self-cleaning.

## Definition of done

`npm test` + `npx tsc --noEmit` + `npm run lint` + `npm run format:check` +
`npm run build` green, plus `npm run test:integration` (server-action/DB path
is touched). Spec and plan in `docs/superpowers/` updated to reflect the
implemented state.

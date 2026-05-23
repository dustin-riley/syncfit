import {
  pgTable,
  text,
  timestamp,
  integer,
  numeric,
  jsonb,
  uuid,
  unique,
  date,
} from "drizzle-orm/pg-core";

export const workout = pgTable(
  "workout",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").notNull(),
    performedAt: timestamp("performed_at", { withTimezone: true }).notNull(),
    title: text("title").notNull(),
    source: text("source").notNull().default("strong_csv"),
    contentHash: text("content_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({ uniqUserContent: unique().on(t.userId, t.contentHash) })
);

export const workoutSet = pgTable("workout_set", {
  id: uuid("id").defaultRandom().primaryKey(),
  workoutId: uuid("workout_id")
    .notNull()
    .references(() => workout.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  exerciseName: text("exercise_name").notNull(),
  equipment: text("equipment"),
  setNumber: integer("set_number").notNull(),
  // 0-based position of the set within its workout, in performed/import
  // order. setNumber stays per-exercise; seq is the new global sort key for
  // the training-week read. DEFAULT 0 keeps this addition safe on a
  // populated table; the two real writers always set an explicit value.
  seq: integer("seq").notNull().default(0),
  weight: numeric("weight").notNull(),
  reps: integer("reps").notNull(),
});

export const enduranceActivity = pgTable(
  "endurance_activity",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").notNull(),
    performedAt: timestamp("performed_at", { withTimezone: true }).notNull(),
    activityType: text("activity_type").notNull(), // 'run' | 'ride' | 'swim' | 'other'
    distance: numeric("distance"), // miles; nullable (e.g. unmeasured swim)
    durationSec: integer("duration_sec").notNull(), // seconds
    notes: text("notes").notNull().default(""),
    source: text("source").notNull().default("manual"), // forward-compat: 'strava'
    contentHash: text("content_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({ uniqUserContent: unique().on(t.userId, t.contentHash) })
);

export const plannedSession = pgTable(
  "planned_session",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").notNull(),
    dayOfWeek: integer("day_of_week").notNull(),
    title: text("title").notNull().default(""),
    notes: text("notes").notNull().default(""),
    modality: text("modality").notNull().default("strength"),
  },
  (t) => ({ uniqUserDay: unique().on(t.userId, t.dayOfWeek) })
);

export const plannedExercise = pgTable("planned_exercise", {
  id: uuid("id").defaultRandom().primaryKey(),
  plannedSessionId: uuid("planned_session_id")
    .notNull()
    .references(() => plannedSession.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  targetSets: integer("target_sets").notNull(),
  targetReps: integer("target_reps").notNull(),
  targetWeight: numeric("target_weight").notNull(),
  orderIndex: integer("order_index").notNull(),
});

export const planProfile = pgTable("plan_profile", {
  userId: text("user_id").primaryKey(),
  goal: text("goal").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const readinessAnalysis = pgTable("readiness_analysis", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull(),
  analysisDate: date("analysis_date").notNull(),
  planSnapshot: jsonb("plan_snapshot")
    .$type<Record<string, unknown>>()
    .notNull(),
  loadSnapshot: jsonb("load_snapshot")
    .$type<Record<string, unknown>>()
    .notNull(),
  verdict: text("verdict").notNull(),
  headline: text("headline").notNull(),
  rationale: text("rationale").notNull(),
  todayAdjustments: jsonb("today_adjustments")
    .$type<Array<{ exercise: string; change: string }>>()
    .notNull()
    .default([]),
  progressionSuggestions: jsonb("progression_suggestions")
    .$type<
      Array<{
        exercise: string;
        currentWeight: number;
        suggestedWeight: number;
        suggestedSets?: number;
        suggestedReps?: number;
        rationale: string;
        status: "pending" | "accepted" | "dismissed";
      }>
    >()
    .notNull()
    .default([]),
  model: text("model").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// ===== iOS companion =====

export const healthMetric = pgTable(
  "health_metric",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").notNull(),
    // user's date in APP_TZ ("America/New_York"), computed on iOS
    metricDate: date("metric_date").notNull(),
    // 'hrv' | 'rhr' | 'sleep_duration_seconds'
    type: text("type").notNull(),
    // ms for hrv, bpm for rhr, seconds for sleep_duration_seconds
    value: numeric("value").notNull(),
    // which step of the fallback ladder fired ('primary' | 'fallback_morning' | ...)
    source: text("source").notNull(),
    // 'fresh' | 'stale_24h' | 'stale_48h'
    freshness: text("freshness").notNull(),
    // original HealthKit sample timestamp
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    // upsert key; multi-device → last-write-wins
    uniqUserDateType: unique().on(t.userId, t.metricDate, t.type),
  })
);

export const deviceToken = pgTable("device_token", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull(),
  // sha256(plaintextToken). Plaintext only ever lives on iOS Keychain.
  tokenHash: text("token_hash").notNull().unique(),
  deviceName: text("device_name").notNull(),
  platform: text("platform").notNull().default("ios"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export const devicePairing = pgTable("device_pairing", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull(),
  // 6-digit numeric code, unique while live
  code: text("code").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export * from "./auth-schema";

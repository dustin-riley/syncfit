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
  weight: numeric("weight").notNull(),
  reps: integer("reps").notNull(),
});

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

export * from "./auth-schema";

import { pgTable, text, timestamp, integer, numeric, jsonb, uuid, unique, date } from "drizzle-orm/pg-core";

// Better Auth tables are added in Task 3 via `npx @better-auth/cli generate` — not in this task.

export const workout = pgTable("workout", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull(),
  performedAt: timestamp("performed_at", { withTimezone: true }).notNull(),
  title: text("title").notNull(),
  source: text("source").notNull().default("strong_csv"),
  contentHash: text("content_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ uniqUserContent: unique().on(t.userId, t.contentHash) }));

export const workoutSet = pgTable("workout_set", {
  id: uuid("id").defaultRandom().primaryKey(),
  workoutId: uuid("workout_id").notNull().references(() => workout.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  exerciseName: text("exercise_name").notNull(),
  equipment: text("equipment"),
  setNumber: integer("set_number").notNull(),
  weight: numeric("weight").notNull(),
  reps: integer("reps").notNull(),
});

export const plannedSession = pgTable("planned_session", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull(),
  dayOfWeek: integer("day_of_week").notNull(),
  title: text("title").notNull().default(""),
  description: text("description").notNull().default(""),
  modality: text("modality").notNull().default("strength"),
}, (t) => ({ uniqUserDay: unique().on(t.userId, t.dayOfWeek) }));

export const readinessAnalysis = pgTable("readiness_analysis", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull(),
  analysisDate: date("analysis_date").notNull(),
  planSnapshot: jsonb("plan_snapshot").$type<Record<string, unknown>>().notNull(),
  loadSnapshot: jsonb("load_snapshot").$type<Record<string, unknown>>().notNull(),
  verdict: text("verdict").notNull(),
  headline: text("headline").notNull(),
  rationale: text("rationale").notNull(),
  modifications: jsonb("modifications").$type<Array<{ exercise: string; change: string }>>().notNull().default([]),
  model: text("model").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

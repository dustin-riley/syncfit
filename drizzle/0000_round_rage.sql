CREATE TABLE "planned_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"day_of_week" integer NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"modality" text DEFAULT 'strength' NOT NULL,
	CONSTRAINT "planned_session_user_id_day_of_week_unique" UNIQUE("user_id","day_of_week")
);
--> statement-breakpoint
CREATE TABLE "readiness_analysis" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"analysis_date" date NOT NULL,
	"plan_snapshot" jsonb NOT NULL,
	"load_snapshot" jsonb NOT NULL,
	"verdict" text NOT NULL,
	"headline" text NOT NULL,
	"rationale" text NOT NULL,
	"modifications" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workout" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"performed_at" timestamp with time zone NOT NULL,
	"title" text NOT NULL,
	"source" text DEFAULT 'strong_csv' NOT NULL,
	"content_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workout_user_id_content_hash_unique" UNIQUE("user_id","content_hash")
);
--> statement-breakpoint
CREATE TABLE "workout_set" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workout_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"exercise_name" text NOT NULL,
	"equipment" text,
	"set_number" integer NOT NULL,
	"weight" numeric NOT NULL,
	"reps" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workout_set" ADD CONSTRAINT "workout_set_workout_id_workout_id_fk" FOREIGN KEY ("workout_id") REFERENCES "public"."workout"("id") ON DELETE cascade ON UPDATE no action;
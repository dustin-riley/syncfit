import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

await sql`ALTER TABLE planned_session RENAME COLUMN description TO notes`.catch(
  (e) => {
    if (!/column "description" does not exist|already exists/i.test(String(e)))
      throw e;
  }
);

await sql`
  CREATE TABLE IF NOT EXISTS planned_exercise (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    planned_session_id uuid NOT NULL REFERENCES planned_session(id) ON DELETE CASCADE,
    user_id text NOT NULL,
    name text NOT NULL,
    target_sets integer NOT NULL,
    target_reps integer NOT NULL,
    target_weight numeric NOT NULL,
    order_index integer NOT NULL
  )`;

await sql`ALTER TABLE readiness_analysis ADD COLUMN IF NOT EXISTS today_adjustments jsonb NOT NULL DEFAULT '[]'::jsonb`;
await sql`ALTER TABLE readiness_analysis ADD COLUMN IF NOT EXISTS progression_suggestions jsonb NOT NULL DEFAULT '[]'::jsonb`;
await sql`
  UPDATE readiness_analysis
  SET today_adjustments = modifications
  WHERE modifications IS NOT NULL
    AND modifications <> '[]'::jsonb
    AND today_adjustments = '[]'::jsonb`.catch((e) => {
  if (!/column "modifications" does not exist/i.test(String(e))) throw e;
});
await sql`ALTER TABLE readiness_analysis DROP COLUMN IF EXISTS modifications`;

console.log("migration: dashboard-redesign applied");

# Project: SyncFit (MVP)

## 1. Concept Overview

A centralized web dashboard and on-demand AI coaching assistant for hybrid athletes. It aggregates endurance (Strava) and strength (Strong App) data. It overlays a trailing-workload analysis onto the user's existing training schedule, providing immediate, on-demand recommendations to manage fatigue and auto-regulate daily training intensity.

## 2. Tech Stack

- **Frontend & Backend:** Next.js (with Tailwind CSS for rapid UI prototyping)
- **Hosting:** Vercel

## 3. Data Integrations (The Inputs)

- **Training Schedule:** A baseline input of the existing weekly training plan.
- **Cardio / Endurance (Strava):** Direct API integration via OAuth (Distance, pace, heart rate, perceived exertion).
- **Strength / Lifting (Strong App):** Manual CSV export from Strong.
- _MVP Ingestion:_ A backend script or basic CLI tool handles the parsing and database upload of the raw CSV file to minimize frontend development time.

## 4. The "Single Pane of Glass" (The Dashboard)

- **The Daily View:** Displays the planned workout for the day alongside a prominent **"Analyze Readiness"** button.
- **Unified Activity Feed:** A chronological timeline blending past runs and lifts.
- **Progress Tracking:** Visualizing working weight progression (e.g., tracking standard sets over time) and endurance metrics.

## 5. The AI Coaching Engine (The Output)

- **On-Demand Analysis:** Triggered by the user. Clicking the button bundles the planned workout and trailing 48-72 hour workout volume into a structured prompt sent directly to an LLM API.
- **Auto-Regulation Advice:** The AI acts as an intensity dial based on recent exertion, suggesting modifications to the existing plan (e.g., "Push heavier today," "Drop working weight by 10%," or "Skip the run, your legs need a rest day").

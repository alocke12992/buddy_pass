-- Backfill-safe NOT NULL add: default fills pre-existing rows, then the default
-- is dropped so the app must always supply a name (plans/API.md §1 schema delta).
ALTER TABLE "workouts" ADD COLUMN "name" text DEFAULT 'Workout' NOT NULL;--> statement-breakpoint
ALTER TABLE "workouts" ALTER COLUMN "name" DROP DEFAULT;
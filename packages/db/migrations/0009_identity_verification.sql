ALTER TABLE "caregiver_profiles" ADD COLUMN "identity_session_id" text;--> statement-breakpoint
ALTER TABLE "caregiver_profiles" ADD COLUMN "identity_status" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "caregiver_profiles" ADD COLUMN "identity_error_code" text;--> statement-breakpoint
ALTER TABLE "caregiver_profiles" ADD COLUMN "identity_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "caregiver_profiles" ADD CONSTRAINT "identity_status_values" CHECK ("caregiver_profiles"."identity_status" IN ('none','requires_input','processing','verified','canceled'));
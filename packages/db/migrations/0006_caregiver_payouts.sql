ALTER TABLE "caregiver_profiles" ADD COLUMN "stripe_account_id" text;--> statement-breakpoint
ALTER TABLE "caregiver_profiles" ADD COLUMN "payout_status" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "caregiver_profiles" ADD COLUMN "payout_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "caregiver_profiles" ADD CONSTRAINT "payout_status_values" CHECK ("caregiver_profiles"."payout_status" IN ('none','pending','restricted','active','unsupported'));
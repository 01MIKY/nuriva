ALTER TABLE "bookings" ADD COLUMN "payment_status" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "checkout_session_id" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "payment_intent_id" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "application_fee_cents" integer;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "paid_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "refunded_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "paid_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "payment_status_values" CHECK ("bookings"."payment_status" IN ('none','pending','paid','refunded','partially_refunded'));--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "refund_not_above_paid" CHECK ("bookings"."refunded_cents" <= "bookings"."paid_cents");
CREATE TYPE "public"."booking_status" AS ENUM('requested', 'accepted', 'declined', 'cancelled', 'in_progress', 'completed');--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"client_id" bigint NOT NULL,
	"caregiver_id" bigint NOT NULL,
	"division" "division" NOT NULL,
	"service" text NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"status" "booking_status" DEFAULT 'requested' NOT NULL,
	"address_enc" text NOT NULL,
	"notes_enc" text,
	"dependents_enc" text NOT NULL,
	"dependent_count" integer NOT NULL,
	"hourly_rate_cents" integer NOT NULL,
	"subtotal_cents" integer NOT NULL,
	"client_fee_cents" integer NOT NULL,
	"total_cents" integer NOT NULL,
	"responded_at" timestamp with time zone,
	"cancelled_by" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_time_order" CHECK ("bookings"."end_at" > "bookings"."start_at")
);
--> statement-breakpoint
CREATE TABLE "caregiver_availability" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"caregiver_id" bigint NOT NULL,
	"weekday" integer NOT NULL,
	"start_minute" integer NOT NULL,
	"end_minute" integer NOT NULL,
	CONSTRAINT "weekday_range" CHECK ("caregiver_availability"."weekday" BETWEEN 0 AND 6),
	CONSTRAINT "minute_range" CHECK ("caregiver_availability"."start_minute" >= 0 AND "caregiver_availability"."end_minute" <= 1440 AND "caregiver_availability"."end_minute" > "caregiver_availability"."start_minute")
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_client_id_users_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_caregiver_id_users_id_fk" FOREIGN KEY ("caregiver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caregiver_availability" ADD CONSTRAINT "caregiver_availability_caregiver_id_users_id_fk" FOREIGN KEY ("caregiver_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bookings_caregiver_time_idx" ON "bookings" USING btree ("caregiver_id","start_at");--> statement-breakpoint
CREATE INDEX "bookings_client_idx" ON "bookings" USING btree ("client_id","start_at");--> statement-breakpoint
CREATE INDEX "caregiver_availability_cg_idx" ON "caregiver_availability" USING btree ("caregiver_id");
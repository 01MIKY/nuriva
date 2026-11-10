CREATE TABLE "booking_series" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"client_id" bigint NOT NULL,
	"caregiver_id" bigint NOT NULL,
	"weeks" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "series_weeks_range" CHECK ("booking_series"."weeks" BETWEEN 2 AND 12)
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "series_id" bigint;--> statement-breakpoint
ALTER TABLE "booking_series" ADD CONSTRAINT "booking_series_client_id_users_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_series" ADD CONSTRAINT "booking_series_caregiver_id_users_id_fk" FOREIGN KEY ("caregiver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_series_id_booking_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."booking_series"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bookings_series_idx" ON "bookings" USING btree ("series_id","start_at");
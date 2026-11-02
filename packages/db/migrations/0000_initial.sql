CREATE TYPE "public"."account_role" AS ENUM('client', 'caregiver', 'admin');--> statement-breakpoint
CREATE TYPE "public"."account_status" AS ENUM('active', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."dependent_kind" AS ENUM('child', 'pet');--> statement-breakpoint
CREATE TYPE "public"."division" AS ENUM('kids', 'pets');--> statement-breakpoint
CREATE TYPE "public"."locale" AS ENUM('en', 'es');--> statement-breakpoint
CREATE TYPE "public"."staff_role" AS ENUM('superadmin', 'operations', 'trust_safety', 'finance', 'support');--> statement-breakpoint
CREATE TYPE "public"."step_status" AS ENUM('not_started', 'pending', 'passed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."vetting_step" AS ENUM('identity', 'background', 'interview', 'training', 'agreement', 'final_approval');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_id" bigint,
	"action" text NOT NULL,
	"target" text,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "caregiver_profiles" (
	"user_id" bigint PRIMARY KEY NOT NULL,
	"divisions" "division"[] NOT NULL,
	"headline" text DEFAULT '' NOT NULL,
	"bio" text DEFAULT '' NOT NULL,
	"hourly_rate_cents" integer NOT NULL,
	"years_experience" integer DEFAULT 0 NOT NULL,
	"languages" text[] DEFAULT ARRAY['en']::text[] NOT NULL,
	"services" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"zip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rate_range" CHECK ("caregiver_profiles"."hourly_rate_cents" BETWEEN 1500 AND 20000),
	CONSTRAINT "divisions_nonempty" CHECK (cardinality("caregiver_profiles"."divisions") > 0)
);
--> statement-breakpoint
CREATE TABLE "dependents" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"owner_id" bigint NOT NULL,
	"kind" "dependent_kind" NOT NULL,
	"display_name_enc" text NOT NULL,
	"details_enc" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_activations" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"division" "division" NOT NULL,
	"service" text NOT NULL,
	"active" boolean NOT NULL,
	"compliance_ref" text NOT NULL,
	"approved_by" bigint NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_role_assignments" (
	"user_id" bigint NOT NULL,
	"role" "staff_role" NOT NULL,
	"granted_by" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_role_assignments_user_id_role_pk" PRIMARY KEY("user_id","role")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "account_role" NOT NULL,
	"name" text NOT NULL,
	"phone_enc" text,
	"locale" "locale" DEFAULT 'en' NOT NULL,
	"status" "account_status" DEFAULT 'active' NOT NULL,
	"mfa_enabled" boolean DEFAULT false NOT NULL,
	"terms_accepted_at" timestamp with time zone NOT NULL,
	"terms_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vetting_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"caregiver_id" bigint NOT NULL,
	"step" "vetting_step" NOT NULL,
	"from_status" "step_status" NOT NULL,
	"to_status" "step_status" NOT NULL,
	"actor_id" bigint NOT NULL,
	"reference_enc" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vetting_records" (
	"caregiver_id" bigint NOT NULL,
	"step" "vetting_step" NOT NULL,
	"status" "step_status" DEFAULT 'not_started' NOT NULL,
	"updated_by" bigint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vetting_records_caregiver_id_step_pk" PRIMARY KEY("caregiver_id","step")
);
--> statement-breakpoint
ALTER TABLE "caregiver_profiles" ADD CONSTRAINT "caregiver_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dependents" ADD CONSTRAINT "dependents_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_activations" ADD CONSTRAINT "service_activations_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_role_assignments" ADD CONSTRAINT "staff_role_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_role_assignments" ADD CONSTRAINT "staff_role_assignments_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vetting_events" ADD CONSTRAINT "vetting_events_caregiver_id_users_id_fk" FOREIGN KEY ("caregiver_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vetting_events" ADD CONSTRAINT "vetting_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vetting_records" ADD CONSTRAINT "vetting_records_caregiver_id_users_id_fk" FOREIGN KEY ("caregiver_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vetting_records" ADD CONSTRAINT "vetting_records_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_target_idx" ON "audit_log" USING btree ("target");--> statement-breakpoint
CREATE INDEX "audit_log_actor_idx" ON "audit_log" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "dependents_owner_idx" ON "dependents" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "service_activations_lookup_idx" ON "service_activations" USING btree ("division","service","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_uq" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_uq" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "vetting_events_caregiver_idx" ON "vetting_events" USING btree ("caregiver_id");
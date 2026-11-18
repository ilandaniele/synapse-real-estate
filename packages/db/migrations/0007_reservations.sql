CREATE TYPE "public"."reservation_status" AS ENUM('PENDING', 'PAID', 'FAILED');--> statement-breakpoint
CREATE TABLE "reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"development_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"deposit_amount" numeric(14, 2) NOT NULL,
	"currency" text NOT NULL,
	"status" "reservation_status" DEFAULT 'PENDING' NOT NULL,
	"checkout_token_hash" text NOT NULL,
	"payment_provider" text NOT NULL,
	"payment_ref" text,
	"consent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_development_id_developments_id_fk" FOREIGN KEY ("development_id") REFERENCES "public"."developments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reservations_org_created_idx" ON "reservations" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "reservations_unit_idx" ON "reservations" USING btree ("unit_id");
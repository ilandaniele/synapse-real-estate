CREATE TYPE "public"."visit_kind" AS ENUM('UNIT', 'SCENE');--> statement-breakpoint
CREATE TABLE "visit_stats" (
	"organization_id" uuid NOT NULL,
	"development_id" uuid NOT NULL,
	"day" date NOT NULL,
	"kind" "visit_kind" NOT NULL,
	"target_id" uuid NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "visit_stats_target_day_uq" UNIQUE("development_id","day","kind","target_id")
);
--> statement-breakpoint
ALTER TABLE "visit_stats" ADD CONSTRAINT "visit_stats_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_stats" ADD CONSTRAINT "visit_stats_development_id_developments_id_fk" FOREIGN KEY ("development_id") REFERENCES "public"."developments"("id") ON DELETE cascade ON UPDATE no action;
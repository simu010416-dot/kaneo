ALTER TABLE "task" ADD COLUMN "auto_migrate_enabled" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "auto_migrate_status" text;
--> statement-breakpoint
CREATE INDEX "task_autoMigrate_idx" ON "task" USING btree ("status","auto_migrate_enabled");

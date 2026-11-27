CREATE TABLE "env_file_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"environmentId" text NOT NULL,
	"userId" text NOT NULL,
	"version" integer NOT NULL,
	"encryptedLayout" jsonb NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "env_file_versions" ADD CONSTRAINT "env_file_versions_environmentId_environments_id_fk" FOREIGN KEY ("environmentId") REFERENCES "public"."environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "env_file_versions" ADD CONSTRAINT "env_file_versions_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "env_file_versions_env_version_unique" ON "env_file_versions" USING btree ("environmentId","userId","version");
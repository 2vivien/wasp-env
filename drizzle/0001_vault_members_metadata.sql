CREATE TABLE "vault_key_envelopes" (
	"vaultId" text NOT NULL,
	"userId" text NOT NULL,
	"keyVersion" integer DEFAULT 1 NOT NULL,
	"sealedKey" jsonb NOT NULL,
	"senderPublicKey" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vault_members" (
	"vaultId" text NOT NULL,
	"userId" text NOT NULL,
	"role" text DEFAULT 'viewer' NOT NULL,
	"permissions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"addedBy" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vaults" ADD COLUMN "kind" text DEFAULT 'personal' NOT NULL;--> statement-breakpoint
ALTER TABLE "vaults" ADD COLUMN "encMeta" jsonb;--> statement-breakpoint
ALTER TABLE "vaults" ADD COLUMN "keyVersion" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "vaults" ADD COLUMN "archivedAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "vaults" ADD COLUMN "deletedAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "vault_key_envelopes" ADD CONSTRAINT "vault_key_envelopes_vaultId_vaults_id_fk" FOREIGN KEY ("vaultId") REFERENCES "public"."vaults"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_key_envelopes" ADD CONSTRAINT "vault_key_envelopes_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_members" ADD CONSTRAINT "vault_members_vaultId_vaults_id_fk" FOREIGN KEY ("vaultId") REFERENCES "public"."vaults"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_members" ADD CONSTRAINT "vault_members_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_members" ADD CONSTRAINT "vault_members_addedBy_user_id_fk" FOREIGN KEY ("addedBy") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "vault_key_envelopes_pk" ON "vault_key_envelopes" USING btree ("vaultId","userId","keyVersion");--> statement-breakpoint
CREATE UNIQUE INDEX "vault_members_vault_user_unique" ON "vault_members" USING btree ("vaultId","userId");--> statement-breakpoint
CREATE UNIQUE INDEX "vault_members_owner_unique" ON "vault_members" USING btree ("vaultId") WHERE "vault_members"."role" = 'owner';--> statement-breakpoint
CREATE INDEX "vault_members_user_idx" ON "vault_members" USING btree ("userId");--> statement-breakpoint
ALTER TABLE "vaults" ADD CONSTRAINT "vaults_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "vaults_personal_user_unique" ON "vaults" USING btree ("userId") WHERE "vaults"."kind" = 'personal';--> statement-breakpoint
CREATE INDEX "vaults_active_user_idx" ON "vaults" USING btree ("userId","updatedAt") WHERE "vaults"."deletedAt" IS NULL;--> statement-breakpoint
CREATE INDEX "vaults_audit_idx" ON "vaults" USING btree ("id","createdAt");
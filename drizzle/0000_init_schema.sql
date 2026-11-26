CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"accountId" text NOT NULL,
	"providerId" text NOT NULL,
	"userId" text NOT NULL,
	"accessToken" text,
	"refreshToken" text,
	"idToken" text,
	"accessTokenExpiresAt" timestamp with time zone,
	"refreshTokenExpiresAt" timestamp with time zone,
	"scope" text,
	"password" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"actorId" text,
	"vaultId" text,
	"event" text NOT NULL,
	"targetKind" text NOT NULL,
	"targetId" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ipHash" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "env_files" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"environmentId" text NOT NULL,
	"encryptedLayout" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "environments" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"vaultId" text NOT NULL,
	"projectId" text NOT NULL,
	"kind" text NOT NULL,
	"encryptedMetadata" jsonb NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"deletedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "key_rotation_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"vault_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text NOT NULL,
	"from_version" integer NOT NULL,
	"to_version" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"cursor" text,
	"completed_count" integer DEFAULT 0 NOT NULL,
	"total_count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "private_share_link_uses" (
	"id" text PRIMARY KEY NOT NULL,
	"link_id" text NOT NULL,
	"used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"client_fingerprint_hash" text
);
--> statement-breakpoint
CREATE TABLE "private_share_links" (
	"id" text PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"owner_id" text NOT NULL,
	"vault_id" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text NOT NULL,
	"encrypted_payload" jsonb NOT NULL,
	"permissions" jsonb NOT NULL,
	"access_code_hash" text,
	"max_uses" integer,
	"use_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "private_share_links_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"userId" text PRIMARY KEY NOT NULL,
	"handle" text,
	"handleNormalized" text,
	"displayName" text,
	"avatarUrl" text,
	"bio" text,
	"handleChangedAt" timestamp with time zone,
	"onboardingStep" text DEFAULT 'handle' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"vaultId" text NOT NULL,
	"encryptedMetadata" jsonb NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"archivedAt" timestamp with time zone,
	"deletedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scoped_key_envelopes" (
	"id" text PRIMARY KEY NOT NULL,
	"vault_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text NOT NULL,
	"key_version" integer DEFAULT 1 NOT NULL,
	"owner_envelope" jsonb NOT NULL,
	"migrated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scoped_shares" (
	"id" text PRIMARY KEY NOT NULL,
	"vault_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"recipient_id" text,
	"group_id" text,
	"resource_type" text NOT NULL,
	"resource_id" text NOT NULL,
	"encrypted_scope_key" jsonb NOT NULL,
	"key_version" integer DEFAULT 1 NOT NULL,
	"permissions" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"userId" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "session_metadata" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"sessionId" text NOT NULL,
	"deviceName" text,
	"lastUsedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"emailVerified" boolean DEFAULT false NOT NULL,
	"image" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "user_key_material" (
	"userId" text PRIMARY KEY NOT NULL,
	"publicKeyX25519" text NOT NULL,
	"publicKeyEd25519" text NOT NULL,
	"encryptedPrivateKeys" jsonb NOT NULL,
	"accountKeyPassphraseEnvelope" jsonb NOT NULL,
	"accountKeyRecoveryEnvelope" jsonb NOT NULL,
	"kdfParameters" jsonb NOT NULL,
	"formatVersion" integer DEFAULT 1 NOT NULL,
	"rotatedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vault_group_members" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vault_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vault_items" (
	"id" text PRIMARY KEY NOT NULL,
	"vaultId" text NOT NULL,
	"userId" text NOT NULL,
	"encryptedPayload" jsonb NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vault_shares" (
	"id" text PRIMARY KEY NOT NULL,
	"vaultId" text NOT NULL,
	"ownerId" text NOT NULL,
	"recipientId" text NOT NULL,
	"encryptedVaultKey" jsonb NOT NULL,
	"permission" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expiresAt" timestamp with time zone,
	"acceptedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vaults" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"keySalt" text NOT NULL,
	"wrappedKey" jsonb NOT NULL,
	"kdfParameters" jsonb NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_user_id_fk" FOREIGN KEY ("actorId") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "env_files" ADD CONSTRAINT "env_files_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "env_files" ADD CONSTRAINT "env_files_environmentId_environments_id_fk" FOREIGN KEY ("environmentId") REFERENCES "public"."environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "environments" ADD CONSTRAINT "environments_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "environments" ADD CONSTRAINT "environments_vaultId_vaults_id_fk" FOREIGN KEY ("vaultId") REFERENCES "public"."vaults"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "environments" ADD CONSTRAINT "environments_projectId_projects_id_fk" FOREIGN KEY ("projectId") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_vaultId_vaults_id_fk" FOREIGN KEY ("vaultId") REFERENCES "public"."vaults"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_metadata" ADD CONSTRAINT "session_metadata_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_metadata" ADD CONSTRAINT "session_metadata_sessionId_session_id_fk" FOREIGN KEY ("sessionId") REFERENCES "public"."session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_key_material" ADD CONSTRAINT "user_key_material_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_shares" ADD CONSTRAINT "vault_shares_vaultId_vaults_id_fk" FOREIGN KEY ("vaultId") REFERENCES "public"."vaults"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_shares" ADD CONSTRAINT "vault_shares_ownerId_user_id_fk" FOREIGN KEY ("ownerId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_shares" ADD CONSTRAINT "vault_shares_recipientId_user_id_fk" FOREIGN KEY ("recipientId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_actor_created_idx" ON "audit_logs" USING btree ("actorId","createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "env_files_user_environment_unique" ON "env_files" USING btree ("userId","environmentId");--> statement-breakpoint
CREATE INDEX "environments_user_project_idx" ON "environments" USING btree ("userId","projectId");--> statement-breakpoint
CREATE INDEX "key_rotation_jobs_owner_status_idx" ON "key_rotation_jobs" USING btree ("owner_id","status","updated_at");--> statement-breakpoint
CREATE INDEX "private_share_links_owner_idx" ON "private_share_links" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_handle_unique" ON "profiles" USING btree ("handleNormalized");--> statement-breakpoint
CREATE INDEX "projects_user_vault_idx" ON "projects" USING btree ("userId","vaultId");--> statement-breakpoint
CREATE UNIQUE INDEX "scoped_key_envelopes_resource_unique" ON "scoped_key_envelopes" USING btree ("owner_id","resource_type","resource_id","key_version");--> statement-breakpoint
CREATE INDEX "scoped_shares_recipient_idx" ON "scoped_shares" USING btree ("recipient_id","status","expires_at");--> statement-breakpoint
CREATE INDEX "scoped_shares_group_idx" ON "scoped_shares" USING btree ("group_id","status");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX "session_metadata_user_session_unique" ON "session_metadata" USING btree ("userId","sessionId");--> statement-breakpoint
CREATE INDEX "session_metadata_user_idx" ON "session_metadata" USING btree ("userId","lastUsedAt");--> statement-breakpoint
CREATE UNIQUE INDEX "vault_group_members_group_user_unique" ON "vault_group_members" USING btree ("group_id","user_id");--> statement-breakpoint
CREATE INDEX "vault_group_members_user_idx" ON "vault_group_members" USING btree ("user_id","group_id");--> statement-breakpoint
CREATE INDEX "vault_groups_owner_idx" ON "vault_groups" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE INDEX "vault_items_user_vault_idx" ON "vault_items" USING btree ("userId","vaultId");--> statement-breakpoint
CREATE UNIQUE INDEX "vault_shares_vault_recipient_unique" ON "vault_shares" USING btree ("vaultId","recipientId");--> statement-breakpoint
CREATE INDEX "vault_shares_recipient_status_idx" ON "vault_shares" USING btree ("recipientId","status");--> statement-breakpoint
CREATE INDEX "vault_shares_owner_created_idx" ON "vault_shares" USING btree ("ownerId","createdAt");--> statement-breakpoint
CREATE INDEX "vaults_user_id_idx" ON "vaults" USING btree ("userId");
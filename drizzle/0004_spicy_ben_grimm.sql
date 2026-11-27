CREATE TABLE "vault_item_versions" (
	"itemId" text NOT NULL,
	"vaultId" text NOT NULL,
	"userId" text NOT NULL,
	"version" integer NOT NULL,
	"metadata" jsonb NOT NULL,
	"value" jsonb NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vault_item_versions" ADD CONSTRAINT "vault_item_versions_itemId_vault_items_id_fk" FOREIGN KEY ("itemId") REFERENCES "public"."vault_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "vault_item_versions_item_version_unique" ON "vault_item_versions" USING btree ("itemId","version");--> statement-breakpoint
CREATE INDEX "vault_item_versions_item_desc_idx" ON "vault_item_versions" USING btree ("itemId","version");
--> statement-breakpoint
-- Rétroportage de l'historique existant (le payload restait la source de vérité).
INSERT INTO "vault_item_versions" ("itemId", "vaultId", "userId", "version", "metadata", "value", "createdAt")
SELECT i."id", i."vaultId", i."userId", (h->>'version')::integer, h->'metadata', h->'value', (h->>'createdAt')::timestamptz
FROM "vault_items" i, jsonb_array_elements(COALESCE(i."encryptedPayload"->'history', '[]'::jsonb)) AS h
ON CONFLICT DO NOTHING;
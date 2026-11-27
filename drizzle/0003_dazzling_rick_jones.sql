CREATE TABLE "reserved_handles" (
	"handleNormalized" text PRIMARY KEY NOT NULL,
	"userId" text,
	"reservedUntil" timestamp with time zone NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reserved_handles" ADD CONSTRAINT "reserved_handles_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reserved_handles_until_idx" ON "reserved_handles" USING btree ("reservedUntil");
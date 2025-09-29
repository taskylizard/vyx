-- CreateEnum
CREATE TYPE "public"."AutomodRuleType" AS ENUM ('WORD', 'REGEX');

-- CreateTable
CREATE TABLE "public"."automod_rules" (
    "id" SERIAL NOT NULL,
    "guild_id" BIGINT NOT NULL,
    "type" "public"."AutomodRuleType" NOT NULL,
    "pattern" TEXT NOT NULL,
    "created_by" BIGINT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automod_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "automod_rules_guild_id_idx" ON "public"."automod_rules"("guild_id");

-- CreateIndex
CREATE INDEX "automod_rules_guild_id_type_idx" ON "public"."automod_rules"("guild_id", "type");

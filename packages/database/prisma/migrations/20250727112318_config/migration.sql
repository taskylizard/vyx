-- AlterTable
ALTER TABLE "config" ADD COLUMN     "log_moderation_actions" BOOLEAN,
ADD COLUMN     "logs_channel" BIGINT,
ADD COLUMN     "logs_enabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "cases" (
    "case_id" INTEGER NOT NULL,
    "guild_id" BIGINT NOT NULL,
    "case_creator" BIGINT NOT NULL,
    "moderated_user" BIGINT NOT NULL,
    "type" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" BIGINT NOT NULL,

    CONSTRAINT "cases_pkey" PRIMARY KEY ("case_id","guild_id")
);

-- CreateIndex
CREATE INDEX "cases_moderated_user_idx" ON "cases"("moderated_user");

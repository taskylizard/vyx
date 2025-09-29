-- AlterEnum
ALTER TYPE "Module" ADD VALUE 'QUERY_ENGINE';

-- CreateTable
CREATE TABLE "query_engine_data" (
    "id" SERIAL NOT NULL,
    "guild_id" BIGINT NOT NULL,
    "owner" TEXT NOT NULL,
    "repo" TEXT NOT NULL,
    "path" TEXT,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "query_engine_data_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "query_engine_data_guild_id_owner_repo_path_key" ON "query_engine_data"("guild_id", "owner", "repo", "path");

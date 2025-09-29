/*
  Warnings:

  - You are about to drop the column `compiled_data` on the `query_engine_settings` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."query_engine_settings" DROP COLUMN "compiled_data",
ADD COLUMN     "compiled" BOOLEAN NOT NULL DEFAULT false;

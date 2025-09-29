/*
  Warnings:

  - You are about to drop the column `rag_system_prompt` on the `query_engine_settings` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."query_engine_settings" DROP COLUMN "rag_system_prompt",
ADD COLUMN     "system_prompt" TEXT DEFAULT 'You have access to a tool that allows you to view the service documentation. make sure to use it for every query.';

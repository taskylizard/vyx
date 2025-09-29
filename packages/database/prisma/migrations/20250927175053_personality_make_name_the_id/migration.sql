/*
  Warnings:

  - You are about to drop the column `personalityId` on the `personality_memories` table. All the data in the column will be lost.
  - Added the required column `personalityName` to the `personality_memories` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "public"."personality_memories" DROP CONSTRAINT "personality_memories_personalityId_fkey";

-- AlterTable
ALTER TABLE "public"."personality_memories" DROP COLUMN "personalityId",
ADD COLUMN     "personalityName" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "public"."personality_memories" ADD CONSTRAINT "personality_memories_personalityName_fkey" FOREIGN KEY ("personalityName") REFERENCES "public"."personalities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

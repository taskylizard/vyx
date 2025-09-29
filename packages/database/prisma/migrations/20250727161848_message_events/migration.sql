-- AlterEnum
ALTER TYPE "Module" ADD VALUE 'MODERATION';

-- AlterTable
ALTER TABLE "config" ADD COLUMN     "log_message_deletes" BOOLEAN,
ADD COLUMN     "log_message_edits" BOOLEAN;

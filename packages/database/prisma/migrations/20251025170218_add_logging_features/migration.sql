-- AlterTable
ALTER TABLE "public"."config" ADD COLUMN     "log_member_joins" BOOLEAN,
ADD COLUMN     "log_member_leaves" BOOLEAN,
ADD COLUMN     "member_join_channel" BIGINT,
ADD COLUMN     "member_leave_channel" BIGINT,
ADD COLUMN     "message_delete_channel" BIGINT,
ADD COLUMN     "message_edit_channel" BIGINT,
ADD COLUMN     "moderation_actions_channel" BIGINT,
ADD COLUMN     "new_account_threshold_days" INTEGER DEFAULT 7,
ADD COLUMN     "trap_action" TEXT DEFAULT 'SOFTBAN',
ADD COLUMN     "trap_channel" BIGINT,
ADD COLUMN     "trap_duration" TEXT;

-- CreateTable
CREATE TABLE "public"."ai_tasks" (
    "id" SERIAL NOT NULL,
    "user_id" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "interval_days" INTEGER NOT NULL,
    "time_of_day" TEXT NOT NULL,
    "timezone" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_tasks_user_id_idx" ON "public"."ai_tasks"("user_id");

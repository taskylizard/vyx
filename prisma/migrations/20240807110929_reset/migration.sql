-- CreateEnum
CREATE TYPE "Module" AS ENUM ('REPORT', 'MUSIC', 'ECONOMY');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateTable
CREATE TABLE "config" (
    "guild_id" BIGINT NOT NULL,
    "reports_channel" BIGINT,
    "currency" TEXT,
    "modules" "Module"[],

    CONSTRAINT "config_pkey" PRIMARY KEY ("guild_id")
);

-- CreateTable
CREATE TABLE "reports" (
    "report_id" TEXT NOT NULL,
    "guild_id" BIGINT NOT NULL,
    "created_member" BIGINT NOT NULL,
    "reported_member" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "reports_pkey" PRIMARY KEY ("report_id","guild_id")
);

-- CreateTable
CREATE TABLE "Reminder" (
    "id" SERIAL NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "time" TIMESTAMP(3) NOT NULL,
    "content" TEXT NOT NULL,
    "message_link" TEXT NOT NULL,
    "reminder_message_id" TEXT,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "economy" (
    "guild_id" BIGINT NOT NULL,
    "user_id" BIGINT NOT NULL,
    "wallet_bal" INTEGER NOT NULL,
    "bank_bal" INTEGER NOT NULL,

    CONSTRAINT "economy_pkey" PRIMARY KEY ("guild_id","user_id")
);

-- CreateTable
CREATE TABLE "shop_items" (
    "item_id" INTEGER NOT NULL,
    "guild_id" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "role" BIGINT,
    "price" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "shop_items_pkey" PRIMARY KEY ("item_id","guild_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Reminder_reminder_message_id_key" ON "Reminder"("reminder_message_id");

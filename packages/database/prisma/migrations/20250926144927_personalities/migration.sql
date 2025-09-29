-- CreateEnum
CREATE TYPE "public"."PersonalityStatus" AS ENUM ('PROCESSING', 'ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "public"."personalities" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "public"."PersonalityStatus" NOT NULL DEFAULT 'PROCESSING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "personalities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."personality_memories" (
    "id" TEXT NOT NULL,
    "personalityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "context" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "personality_memories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "personalities_name_key" ON "public"."personalities"("name");

-- AddForeignKey
ALTER TABLE "public"."personality_memories" ADD CONSTRAINT "personality_memories_personalityId_fkey" FOREIGN KEY ("personalityId") REFERENCES "public"."personalities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

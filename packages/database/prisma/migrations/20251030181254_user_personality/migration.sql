-- CreateTable
CREATE TABLE "user_ai_config" (
    "user_id" TEXT NOT NULL,
    "tone" TEXT NOT NULL DEFAULT 'balanced',
    "verbosity" TEXT NOT NULL DEFAULT 'normal',
    "personalityTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "customPrompt" TEXT,
    "languageStyle" TEXT NOT NULL DEFAULT 'standard',
    "excludedTopics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "responseFormat" TEXT NOT NULL DEFAULT 'mixed',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_ai_config_pkey" PRIMARY KEY ("user_id")
);

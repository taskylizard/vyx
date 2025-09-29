-- CreateTable
CREATE TABLE "query_engine_settings" (
    "guild_id" BIGINT NOT NULL,
    "personality" TEXT DEFAULT 'You are a helpful AI assistant.',
    "example_qna" TEXT,
    "rag_system_prompt" TEXT,
    "compiled_data" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "query_engine_settings_pkey" PRIMARY KEY ("guild_id")
);

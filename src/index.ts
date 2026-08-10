export { createKanikouApp, startKanikouBot, type KanikouApp } from './bot/app.ts'
export { startAxiomObservability, startKanikouObservability } from './observability/axiom.ts'
export type {
  AxiomObservabilityConfig,
  KanikouLogger,
  KanikouObservability,
  KanikouObservabilityConfig,
  LogFields,
  LogLevel
} from './observability/types.ts'
export {
  buildSlashCommandTree,
  createRosepack,
  ROSEPACK_TYPE_MESSAGES,
  lintSlashCommandTree,
  slashCommandToDiscord,
  CommandTreeValidationError,
  InteractionRegistry,
  SlashCommandContext,
  type CommandTreeValidationIssue,
  type RosepackTypeError,
  type SlashCommandDefinition,
  type SlashCommandOptionChoice,
  type SlashCommandOptionDefinition,
  type SlashCommandOptionKind,
  type SlashCommandOptionRecord,
  type SlashCommandOptionValue,
  type SlashCommandOptionValues,
  type SlashCommandTreeDefinition,
  type SlashCommandTreeNode,
  type SlashCommandMetadata,
  type SlashRootCommandDefinitionBase,
  type SlashCommandValueOptionDefinition,
  type SlashCommandValueOptionRecord,
  type SlashSubcommandCommandDefinition,
  type SlashSubcommandDefinition,
  type SlashSubcommandDefinitionBase,
  type SlashSubcommandGroupDefinition,
  type SlashSubcommandLeafRecord,
  type SlashSubcommandRecord,
  type ValidateSlashCommandDefinition
} from 'rosepack'
export { rosepack, button, component, guard, modal, slash, slashSub } from './bot/rosepack.ts'
export {
  OPERATIONS_CHANNEL_ID,
  OPERATIONS_GUILD_ID,
  OWNER_USER_ID,
  TASKYLAND_GUILD_ID
} from './discord/ids.ts'
export {
  KANIKOU_CLARIFICATION_POLICY,
  KANIKOU_SYSTEM_PROMPT_TEMPLATE,
  kanikouSystemPrompt,
  utcDateStamp
} from './config/system-prompt.ts'
export { KANIKOU_MODEL, KANIKOU_MODEL_SETTINGS } from './config/model.ts'
export { loadKanikouEnv, type KanikouEnv } from './config/env.ts'
export { default as askCommand } from './commands/ask.ts'
export { default as memoryCommand } from './commands/memory.ts'
export { default as jumbleCommand } from './commands/jumble.ts'
export { default as modulesCommand } from './commands/modules.ts'
export { default as jumbleProfileSubcommand } from './commands/jumble-profile.ts'
export { slashCommands } from './commands/index.ts'
export { GuildSettingsStore } from './database/guild-settings.ts'
export {
  createKanikouDatabase,
  DEFAULT_DATABASE_URL,
  type KanikouDatabase,
  type KanikouDatabaseOptions,
  type KanikouSchema
} from './database/database.ts'
export { modules } from './modules.ts'
export {
  answerMatches,
  answerMatchesAny,
  levenshteinDistance,
  normalizeAnswer,
  removeEditionSuffix,
  shuffleCharacters
} from './jumble/answer.ts'
export { DiscogsClient, type DiscogsClientOptions } from './jumble/discogs.ts'
export { DeezerClient, type DeezerClientOptions } from './jumble/deezer.ts'
export type { JumbleTimingEvent, JumbleTimingSink } from './jumble/timing.ts'
export {
  LastFmClient,
  LastFmError,
  MissingLastFmProvider,
  type JumbleMusicProvider,
  type LastFmClientOptions
} from './jumble/lastfm.ts'
export {
  JumbleMetadataCache,
  type JumbleMetadataCacheEntry,
  type JumbleMetadataCacheOptions
} from './jumble/metadata-cache.ts'
export { MusicBrainzClient, type MusicBrainzClientOptions } from './jumble/musicbrainz.ts'
export {
  JumbleImageError,
  JumbleImageRenderer,
  PIXELATION_LEVELS,
  pixelate,
  type JumbleImageRendererOptions
} from './jumble/renderer.ts'
export { JumbleRepository } from './jumble/repository.ts'
export { JUMBLE_TIMEOUT_MS, JumbleError, JumbleService } from './jumble/service.ts'
export type {
  JumbleAction,
  JumbleActionResult,
  JumbleServiceOptions,
  JumbleState,
  StartJumbleInput
} from './jumble/types.ts'
export {
  JUMBLE_ANSWER_SOURCES,
  JUMBLE_ERROR_CODES,
  JUMBLE_KINDS,
  JUMBLE_OUTCOMES,
  isJumbleKind,
  type JumbleAnswerSource,
  type JumbleAnswerVariant,
  type JumbleArtistMetadata,
  type JumbleCandidate,
  type JumbleContinuousSession,
  type JumbleErrorCode,
  type JumbleHint,
  type JumbleKind,
  type JumbleOutcome,
  type JumbleProfileSummary,
  type JumbleSession,
  type JumbleStats,
  type JumbleStatsByKind,
  type JumbleTrackedCounts
} from './jumble/types.ts'
export { formatCitations } from './llm/citations.ts'
export { errorMessage, logAgentTrace, type AgentTraceEvent } from './llm/agent-trace.ts'
export {
  isOperationsScope,
  MintlifyMcpToolProvider,
  OperationsToolProvider,
  type MintlifyMcpConfig,
  type OperationsToolProviderConfig,
  type ScopedToolProvider,
  type ScopedToolSet,
  type ToolScope
} from './llm/mintlify-mcp.ts'
export { MintlifyFileOAuthProvider } from './llm/mintlify-oauth.ts'
export { CompositeToolProvider } from './llm/scoped-tools.ts'
export {
  MarkdownMemoryStore,
  MemoryStoreError,
  MEMORY_ENTRY_LIMIT,
  MEMORY_ENTRY_MAX_LENGTH,
  MEMORY_PROMPT_SCOPE_MAX_LENGTH,
  type ForgetMemoryResult,
  type MarkdownMemoryStoreOptions,
  type MemoryEntry,
  type MemoryPromptContext,
  type MemoryScope,
  type MemoryStore
} from './memory/markdown-memory.ts'
export { previewMemory } from './memory/preview.ts'
export {
  createAiTools as createKanikouTools,
  createMemoryTools,
  createParallelExtractTool,
  createParallelSearchTool,
  createProjectSeleneTools,
  createSupadataTranscriptTool,
  executeSupadataTranscript,
  FORGET_TOOL_NAME,
  LIST_MEMORIES_TOOL_NAME,
  MEMORY_LIST_MAX_LENGTH,
  MEMORY_TOOL_PREVIEW_MAX_LENGTH,
  MEMORY_TOOLS_INSTRUCTIONS,
  MemoryToolProvider,
  PARALLEL_EXTRACT_TOOL_NAME,
  PARALLEL_SEARCH_TOOL_NAME,
  PROJECT_SELENE_LIST_FILES_TOOL_NAME,
  PROJECT_SELENE_READ_FILE_TOOL_NAME,
  PROJECT_SELENE_SEARCH_CODE_TOOL_NAME,
  PROJECT_SELENE_INSTRUCTIONS,
  ProjectSeleneRepository,
  REMEMBER_TOOL_NAME,
  SUPADATA_TRANSCRIPT_TOOL_NAME,
  isTransientToolError,
  type ToolsConfig as KanikouToolsConfig,
  type MemoryToolProviderConfig,
  type ParallelToolsConfig,
  type ProjectSeleneConfig,
  type SupadataTranscriptArgs,
  type SupadataTranscriptClient,
  type SupadataTranscriptConfig,
  type ToolRecoveryConfig,
  toolActivityLabel,
  withToolRecovery
} from './llm/tools/index.ts'

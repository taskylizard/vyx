export { createKanikouApp, startKanikouBot, type KanikouApp } from './bot/app.ts'
export {
  startAxiomObservability,
  type AxiomObservability,
  type AxiomObservabilityConfig
} from './observability/axiom.ts'
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
export { rosepack, button, component, modal, slash, slashSub } from './bot/rosepack.ts'
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
export { default as jumbleProfileSubcommand } from './commands/jumble-profile.ts'
export { default as jumbleStatsSubcommand } from './commands/jumble-stats.ts'
export { slashCommands } from './commands/index.ts'
export {
  createKanikouDatabase,
  DEFAULT_DATABASE_URL,
  type KanikouDatabase,
  type KanikouDatabaseOptions
} from './database/database.ts'
export {
  answerMatches,
  levenshteinDistance,
  normalizeAnswer,
  removeEditionSuffix,
  shuffleCharacters
} from './jumble/answer.ts'
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
export {
  JUMBLE_TIMEOUT_MS,
  JumbleError,
  JumbleService,
  type JumbleAction,
  type JumbleActionResult,
  type JumbleServiceOptions,
  type JumbleState,
  type StartJumbleInput
} from './jumble/service.ts'
export {
  JUMBLE_KINDS,
  isJumbleKind,
  type JumbleArtistMetadata,
  type JumbleCandidate,
  type JumbleHint,
  type JumbleKind,
  type JumbleOutcome,
  type JumbleSession,
  type JumbleStats
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
export {
  createKanikouTools,
  createParallelExtractTool,
  createParallelSearchTool,
  createProjectSeleneTools,
  createSearchTools,
  createSupadataTranscriptTool,
  executeSupadataTranscript,
  PARALLEL_EXTRACT_TOOL_NAME,
  PARALLEL_SEARCH_TOOL_NAME,
  PROJECT_SELENE_LIST_FILES_TOOL_NAME,
  PROJECT_SELENE_READ_FILE_TOOL_NAME,
  PROJECT_SELENE_SEARCH_CODE_TOOL_NAME,
  PROJECT_SELENE_INSTRUCTIONS,
  ProjectSeleneRepository,
  SUPADATA_TRANSCRIPT_TOOL_NAME,
  isTransientToolError,
  type KanikouToolsConfig,
  type ParallelToolsConfig,
  type ProjectSeleneConfig,
  type SearchToolsConfig,
  type SupadataTranscriptArgs,
  type SupadataTranscriptClient,
  type SupadataTranscriptConfig,
  type ToolRecoveryConfig,
  toolActivityLabel,
  withToolRecovery
} from './llm/tools/index.ts'

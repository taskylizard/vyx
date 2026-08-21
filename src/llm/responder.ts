import type { LanguageModel, ModelMessage, ToolSet } from 'ai'
import type { CommandInteraction, Message } from 'oceanic.js'
import { sendResponse, type ResponseTarget } from '../discord/response-target.ts'
import { sendReply } from '../discord/replies.ts'
import type { BotContext } from '../bot/context.ts'
import { errorMessage, logAgentTrace } from './agent-trace.ts'
import { generateKanikouResponse } from './generation.ts'
import { buildMessagePrompt, buildSlashPrompt } from './message-input.ts'
import type { ScopedToolProvider, ScopedToolSet, ToolScope } from './mintlify-mcp.ts'
import {
  formatCompletedResponse,
  formatThinkingProgress,
  THINKING_RESPONSE
} from './tool-progress.ts'
import { traceOperation } from '../observability/tracing.ts'

export class KanikouResponder {
  readonly #model: LanguageModel
  readonly #scopedToolProvider: ScopedToolProvider | undefined
  readonly #tools: ToolSet

  constructor(model: LanguageModel, tools: ToolSet, scopedToolProvider?: ScopedToolProvider) {
    this.#model = model
    this.#scopedToolProvider = scopedToolProvider
    this.#tools = tools
  }

  async replyToMessage(context: BotContext, message: Message): Promise<void> {
    const messages = await buildMessagePrompt(context, message)
    const placeholder = await sendReply(context.client, message, THINKING_RESPONSE)

    await this.#complete(
      context,
      messages,
      {
        kind: 'message',
        placeholder
      },
      {
        canManageServer: message.member?.permissions.has('MANAGE_GUILD') ?? false,
        channelID: message.channelID,
        guildID: message.guildID,
        sourceID: message.id,
        userID: message.author.id
      }
    )
  }

  async answerPrompt(
    context: BotContext,
    interaction: CommandInteraction,
    prompt: string
  ): Promise<void> {
    const target = {
      interaction,
      kind: 'interaction'
    } satisfies ResponseTarget
    await sendResponse(context, target, THINKING_RESPONSE)
    await this.#complete(context, await buildSlashPrompt(context, interaction, prompt), target, {
      canManageServer: interaction.memberPermissions?.has('MANAGE_GUILD') ?? false,
      channelID: interaction.channelID,
      guildID: interaction.guildID,
      sourceID: interaction.id,
      userID: interaction.user.id
    })
  }

  /**
   * Generates a plain reply with every tool disabled and no response UI, for
   * flows like chimes that produce a single casual message.
   */
  async generateWithoutTools(messages: ModelMessage[], instructions: string): Promise<string> {
    return generateKanikouResponse(this.#model, messages, {}, { instructions })
  }

  async #complete(
    context: BotContext,
    messages: ModelMessage[],
    target: ResponseTarget,
    scope: ToolScope
  ): Promise<void> {
    await traceOperation(
      'llm.response.generate',
      {
        attributes: {
          'discord.channel.id': scope.channelID,
          'discord.guild.id': scope.guildID ?? 'direct-message',
          'gen_ai.input.messages': messages.length,
          'kanikou.response.target': target.kind
        },
        parent: 'active'
      },
      async (span) => {
        const calledTools: string[] = []
        const generationStartedAt = performance.now()
        let progressUpdate = Promise.resolve()
        const traceId = span.spanContext().traceId
        logAgentTrace(context.logger, {
          event: 'generation.start',
          messageCount: messages.length,
          traceId
        })

        try {
          const scoped: ScopedToolSet = (await this.#scopedToolProvider?.resolve(scope)) ?? {
            tools: {}
          }
          const content = await generateKanikouResponse(
            this.#model,
            messages,
            { ...this.#tools, ...scoped.tools },
            {
              instructions: scoped.instructions,
              maxToolIterations: scoped.maxToolIterations,
              onStepEnd: (event) => {
                logAgentTrace(context.logger, { event: 'step.end', traceId, ...event })
              },
              onStepStart: (event) => {
                logAgentTrace(context.logger, { event: 'step.start', traceId, ...event })
              },
              onToolExecutionEnd: (event) => {
                logAgentTrace(context.logger, { event: 'tool.end', traceId, ...event })
              },
              onToolExecutionStart: (event) => {
                logAgentTrace(context.logger, { event: 'tool.start', traceId, ...event })
                calledTools.push(event.toolName)
                const progress = formatThinkingProgress(calledTools)
                progressUpdate = progressUpdate.then(async () =>
                  sendResponse(context, target, progress)
                )
                return progressUpdate
              }
            }
          )

          await progressUpdate
          await sendResponse(context, target, formatCompletedResponse(content, calledTools))
          logAgentTrace(context.logger, {
            durationMs: Math.round((performance.now() - generationStartedAt) * 10) / 10,
            event: 'generation.end',
            traceId
          })
        } catch (error) {
          logAgentTrace(context.logger, {
            durationMs: Math.round((performance.now() - generationStartedAt) * 10) / 10,
            error: errorMessage(error),
            event: 'generation.error',
            traceId
          })
          throw error
        }
      }
    )
  }
}

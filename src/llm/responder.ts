import { randomUUID } from 'node:crypto'
import type { LanguageModel, ModelMessage, ToolSet } from 'ai'
import type { CommandInteraction, Message } from 'oceanic.js'
import { sendResponse, type ResponseTarget } from '../discord/response-target.ts'
import { sendReply } from '../discord/replies.ts'
import type { BotContext } from '../bot/context.ts'
import { errorMessage, logAgentTrace } from './agent-trace.ts'
import { generateKanikouResponse } from './generation.ts'
import { buildMessagePrompt, buildSlashPrompt } from './message-input.ts'
import type { ScopedToolProvider, ToolScope } from './mintlify-mcp.ts'
import {
  formatCompletedResponse,
  formatThinkingProgress,
  THINKING_RESPONSE
} from './tool-progress.ts'

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
      { channelID: message.channelID, guildID: message.guildID }
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
      channelID: interaction.channelID,
      guildID: interaction.guildID
    })
  }

  async #complete(
    context: BotContext,
    messages: ModelMessage[],
    target: ResponseTarget,
    scope: ToolScope
  ): Promise<void> {
    const calledTools: string[] = []
    const generationStartedAt = Date.now()
    let progressUpdate = Promise.resolve()
    const traceId = randomUUID()
    logAgentTrace(context.logger, {
      event: 'generation.start',
      messageCount: messages.length,
      traceId
    })

    try {
      const scoped = (await this.#scopedToolProvider?.resolve(scope)) ?? { tools: {} }
      const content = await generateKanikouResponse(
        this.#model,
        messages,
        { ...this.#tools, ...scoped.tools },
        {
          instructions: scoped.instructions,
          maxToolIterations: Object.keys(scoped.tools).length === 0 ? undefined : null,
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
        durationMs: Date.now() - generationStartedAt,
        event: 'generation.end',
        traceId
      })
    } catch (error) {
      logAgentTrace(context.logger, {
        durationMs: Date.now() - generationStartedAt,
        error: errorMessage(error),
        event: 'generation.error',
        traceId
      })
      throw error
    }
  }
}

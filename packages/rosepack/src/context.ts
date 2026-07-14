import { CommandInteraction, MessageFlags } from 'oceanic.js'
import type { Client, EditInteractionContent, InteractionContent } from 'oceanic.js'
import { invocationTrail, invokeRegistryCommand } from './internal.ts'
import { normalizeResponseContent } from './responses.ts'
import type {
  SlashCommandDefinition,
  SlashCommandOptionValue,
  SlashCommandOptionValues,
  SlashCommandTreeDefinition,
  SlashCommandTreeNode,
  SlashCommandValueOptionRecord,
  SlashSubcommandDefinition
} from './commands.ts'
import type { SlashCommandRegistry } from './registry.ts'

/**
 * The current command invocation, including typed app services, resolved options,
 * response helpers, tree metadata, and safe command-to-command invocation.
 */
export class SlashCommandContext<TApp, TOptions extends SlashCommandValueOptionRecord = {}> {
  readonly app: TApp
  readonly command: SlashCommandTreeNode<TApp>
  readonly interaction: CommandInteraction
  readonly node: SlashCommandTreeNode<TApp>
  readonly options: SlashCommandOptionValues<TOptions>
  readonly path: readonly string[]
  readonly registry: SlashCommandRegistry<TApp>
  readonly [invocationTrail]: readonly SlashCommandTreeDefinition<TApp>[]

  constructor(config: {
    app: TApp
    command: SlashCommandTreeNode<TApp>
    interaction: CommandInteraction
    invocationTrail?: readonly SlashCommandTreeDefinition<TApp>[]
    node: SlashCommandTreeNode<TApp>
    options: SlashCommandOptionValues<TOptions>
    registry: SlashCommandRegistry<TApp>
  }) {
    this.app = config.app
    this.command = config.command
    this.interaction = config.interaction
    this.node = config.node
    this.options = config.options
    this.path = config.node.path
    this.registry = config.registry
    this[invocationTrail] = config.invocationTrail ?? []
  }

  get client(): Client {
    return this.interaction.client
  }

  get acknowledged(): boolean {
    return this.interaction.acknowledged
  }

  /** Acknowledges the interaction without sending content; repeated calls are harmless. */
  async defer(options: number | { ephemeral?: boolean } = {}): Promise<void> {
    if (this.interaction.acknowledged) {
      return
    }
    const flags =
      typeof options === 'number'
        ? options
        : options.ephemeral === true
          ? MessageFlags.EPHEMERAL
          : undefined
    await this.interaction.defer(flags)
  }

  /** Creates the initial response, or edits it when the interaction is already acknowledged. */
  async reply(content: EditInteractionContent | string): Promise<void> {
    await this.editResponse(content)
  }

  /** Creates or edits the interaction's original response according to acknowledgement state. */
  async editResponse(content: EditInteractionContent | string): Promise<void> {
    const payload = normalizeResponseContent(content)
    if (this.interaction.acknowledged) {
      await this.interaction.editOriginal(payload)
      return
    }
    await this.interaction.createMessage(payload as InteractionContent)
  }

  /** Sends an additional response after the original interaction response. */
  async followUp(content: InteractionContent | string): Promise<void> {
    await this.interaction.createFollowup(normalizeResponseContent(content))
  }

  /** Deletes the interaction's original response. */
  async deleteResponse(): Promise<void> {
    await this.interaction.deleteOriginal()
  }

  /**
   * Runs another executable node from this registry with validated option values.
   * Hooks are preserved, while direct or indirect recursive invocation is rejected.
   */
  async invoke<TTargetOptions extends SlashCommandValueOptionRecord>(
    target:
      | SlashCommandDefinition<TApp, TTargetOptions>
      | SlashSubcommandDefinition<TApp, TTargetOptions>,
    options: SlashCommandOptionValues<TTargetOptions>
  ): Promise<void>
  async invoke(
    target: SlashCommandTreeNode<TApp>,
    options: Readonly<Record<string, SlashCommandOptionValue | undefined>>
  ): Promise<void>
  async invoke(
    target:
      | SlashCommandDefinition<TApp, SlashCommandValueOptionRecord>
      | SlashCommandTreeNode<TApp>
      | SlashSubcommandDefinition<TApp, SlashCommandValueOptionRecord>,
    options: Readonly<Record<string, SlashCommandOptionValue | undefined>>
  ): Promise<void> {
    await this.registry[invokeRegistryCommand](this, target, options)
  }
}

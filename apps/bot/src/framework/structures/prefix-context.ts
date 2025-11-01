import type {
  AnyTextableGuildChannel,
  CreateMessageOptions,
  EmbedOptions,
  Guild,
  Member,
  Message,
  User
} from 'oceanic.js'
import { type Client, colors } from '..'
import * as common from '../utils/discord'
import type { ArgumentsSchema, ParsedArguments } from './prefix-parser'
import { ArgumentParser } from './prefix-parser'
import type { PrefixCommand } from './prefixcommand'

export class PrefixContext<T extends ArgumentsSchema = ArgumentsSchema> {
  private data: Map<string, unknown> = new Map<string, unknown>()
  public colors: typeof colors = colors
  public args: ParsedArguments<T>
  public rawArgs: string

  public constructor(
    public readonly client: Client,
    public readonly message: Message<AnyTextableGuildChannel>,
    public readonly command: PrefixCommand<T>,
    rawArgs: string
  ) {
    this.rawArgs = rawArgs

    if (command.args) {
      const parser = new ArgumentParser(rawArgs)
      this.args = parser.parse(command.args)
    } else {
      this.args = {} as ParsedArguments<T>
    }
  }

  /** Common utility functions */
  public get common(): typeof common {
    return common
  }

  /** An user who invoked the command */
  public get user(): User {
    return this.message.author
  }

  /** A member who invoked the command */
  public get member(): Member | null {
    return this.message.member ?? null
  }

  /** A guild where command had been invoked */
  public get guild(): Guild | null {
    return this.message.channel.guild ?? null
  }

  /** The channel where the command was invoked */
  public get channel(): AnyTextableGuildChannel {
    return this.message.channel
  }

  /** The command name used */
  public get commandName(): string {
    return this.command.name
  }

  /**
   * Reply to the message.
   * @param content Message content
   */
  public async reply(content: string): Promise<Message<AnyTextableGuildChannel>>
  /**
   * Reply to the message with embeds.
   * @param content Array of EmbedOptions
   */
  public async reply(
    content: EmbedOptions[]
  ): Promise<Message<AnyTextableGuildChannel>>
  /**
   * Reply to the message with full options.
   * @param content Message options
   */
  public async reply(
    content: CreateMessageOptions
  ): Promise<Message<AnyTextableGuildChannel>>
  public async reply(
    content: EmbedOptions[] | string | CreateMessageOptions
  ): Promise<Message<AnyTextableGuildChannel>> {
    const response: CreateMessageOptions = Array.isArray(content)
      ? { embeds: content }
      : typeof content === 'string'
      ? { content }
      : content

    return await this.message.channel.createMessage(response)
  }

  /**
   * Send a message to the channel.
   * @param content Message content
   */
  public async send(content: string): Promise<Message<AnyTextableGuildChannel>>
  /**
   * Send a message with embeds to the channel.
   * @param content Array of EmbedOptions
   */
  public async send(
    content: EmbedOptions[]
  ): Promise<Message<AnyTextableGuildChannel>>
  /**
   * Send a message with full options to the channel.
   * @param content Message options
   */
  public async send(
    content: CreateMessageOptions
  ): Promise<Message<AnyTextableGuildChannel>>
  public async send(
    content: EmbedOptions[] | string | CreateMessageOptions
  ): Promise<Message<AnyTextableGuildChannel>> {
    const response: CreateMessageOptions = Array.isArray(content)
      ? { embeds: content }
      : typeof content === 'string'
      ? { content }
      : content

    return await this.message.channel.createMessage(response)
  }

  /**
   * React to the message.
   * @param emoji Emoji to react with
   */
  public async react(emoji: string): Promise<void> {
    await this.message.createReaction(emoji)
  }

  /**
   * Delete the invoking message.
   */
  public async deleteMessage(): Promise<void> {
    await this.message.delete()
  }

  /**
   * Set additional data in context.
   * @param key Key
   * @param data Value
   */
  public set<V>(key: string, data: V): void {
    this.data.set(key, data)
  }

  /**
   * Get additional data from context.
   * @param key Key
   * @returns Value
   */
  public get<V>(key: string): V {
    return this.data.get(key) as V
  }

  /**
   * Check if a specific argument was provided.
   * @param name Argument name
   * @returns Whether the argument exists
   */
  public hasArg(name: string): boolean {
    return this.args[name as keyof typeof this.args] !== undefined
  }
}

import type {
  AnyInteractionChannel,
  AnyInteractionGateway,
  CommandInteraction,
  ComponentInteraction,
  EmbedOptions,
  Guild,
  InteractionContent,
  InteractionOptionsWrapper,
  Member,
  Message,
  User
} from 'oceanic.js';
import type { RainlinkWebsocket } from 'rainlink';
import { type Client, Colors, type SlashCommand } from '..';

type Filter = (interaction: ComponentInteraction) => boolean;
interface CollectButtonOptions {
  filter: Filter;
  messageID: string;
  timeout?: number;
}

export class Context {
  private data: Map<string, unknown> = new Map<string, unknown>();
  public acknowledged: boolean;
  public colors: typeof Colors = Colors;

  private deferTimeout: NodeJS.Timeout | null;
  private deferPromise: Promise<void> | null;

  public constructor(
    public readonly client: Client,
    public readonly interaction: CommandInteraction,
    public readonly command: SlashCommand
  ) {
    this.acknowledged = false;
    this.deferPromise = null;
    this.deferTimeout = setTimeout(
      () => {
        this.deferTimeout = null;
        this.acknowledged = true;
        this.deferPromise = interaction.defer();
      },
      Math.max(0, 2000 - (Date.now() - interaction.createdAt.getTime()))
    ).unref();
  }

  /** An user who invoked the command */
  public get user(): User {
    return this.interaction.member?.user || this.interaction.user!;
  }

  /** A member who invoked the command */
  public get member(): Member | null {
    return this.interaction.member;
  }

  /** A guild where command had been invoked */
  public get guild(): Guild | undefined {
    return this.client.guilds.get(this.interaction.guildID!);
  }

  public get channel(): AnyInteractionChannel | undefined {
    return this.interaction.channel;
  }

  public get commandName(): string {
    return this.interaction.data.name;
  }

  public get options(): InteractionOptionsWrapper {
    return this.interaction.data.options;
  }

  public wsl(guildID: string): RainlinkWebsocket | undefined {
    return this.client.rainlink.nodes.get(guildID)?.connect();
  }

  private removeTimeout() {
    if (this.deferTimeout !== null) {
      clearTimeout(this.deferTimeout);
      this.deferTimeout = null;
    }
  }

  /**
   * Reply to interaction with a content string and optional ephemeral flag.
   * @param content Interaction content
   * @param ephemeral Optional boolean to specify if the reply should be ephemeral. Defaults to false.
   */
  public async reply(content: string, ephemeral?: boolean): Promise<void>;
  /**
   * Reply to interaction with an array of EmbedOptions and optional ephemeral flag.
   * @param content Array of EmbedOptions
   * @param ephemeral Optional boolean to specify if the reply should be ephemeral. Defaults to false.
   */
  public async reply(
    content: EmbedOptions[],
    ephemeral?: boolean
  ): Promise<void>;
  /**
   * Reply to interaction with an InteractionContent object.
   * @param content Interaction content
   */
  public async reply(content: InteractionContent): Promise<void>;
  public async reply(
    content: EmbedOptions[] | string | InteractionContent,
    ephemeral = false
  ): Promise<void> {
    const response: InteractionContent = Array.isArray(content)
      ? { embeds: content, ...(ephemeral ? { flags: 64 } : undefined) }
      : typeof content === 'string'
        ? { content, ...(ephemeral ? { flags: 64 } : undefined) }
        : content;

    if (!this.acknowledged) {
      if (this.deferPromise !== null) {
        await this.deferPromise;

        await this.interaction.editOriginal(response);
      } else {
        this.removeTimeout();
        await this.interaction.reply(response);
        this.acknowledged = true;
      }
    }
  }

  /**
   * Defers the response.
   * @param flags Message flags. Use 64 if you want an ephemeral response.
   */
  public async defer(flags?: number): Promise<void> {
    await this.interaction.defer(flags);
    this.acknowledged = true;
  }

  /**
   * Edits the interaction response.
   * @param options
   * @returns A interaction message object
   */
  public async editReply(options: InteractionContent): Promise<Message> {
    return await this.interaction.editOriginal(options);
  }

  /**
   * Sends the followup message.
   * @param options Message content
   * @returns A followup message object
   */
  public async followUp(options: InteractionContent) {
    return await this.interaction.createFollowup(options);
  }

  /**
   * Deletes the interaction response.
   */
  public async deleteReply(): Promise<void> {
    return await this.interaction.deleteOriginal();
  }

  /**
   * Set the additional data
   * @param key Key
   * @param data Value
   */
  public set<T>(key: string, data: T): void {
    this.data.set(key, data);
  }

  /**
   *
   * @param key
   * @returns
   */
  public get<T>(key: string): T {
    return this.data.get(key) as T;
  }

  public async collectButton({
    filter,
    messageID,
    timeout
  }: CollectButtonOptions): Promise<ComponentInteraction | void> {
    return new Promise<ComponentInteraction | undefined>((resolve, _reject) => {
      const listener = async (interaction: AnyInteractionGateway) => {
        if (
          interaction.type !== 3 ||
          interaction.message.id !== messageID ||
          !filter(interaction)
        )
          return;

        const timer = setTimeout(() => {
          this.client.off('interactionCreate', listener);
          resolve(undefined);
        }, timeout);

        this.client.off('interactionCreate', listener);
        clearTimeout(timer);
        resolve(interaction);
      };

      this.client.on('interactionCreate', listener);
    });
  }
}

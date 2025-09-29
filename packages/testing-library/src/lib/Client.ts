import {
  type AnyTextableChannel,
  ApplicationCommand,
  ApplicationIntegrationTypes,
  ChannelTypes,
  Client as OceanicClient,
  ClientApplication,
  CommandInteraction,
  type CreateApplicationCommandOptions,
  type CreateChatInputApplicationCommandOptions,
  type CreateMessageOptions,
  DefaultMessageNotificationLevels,
  ExplicitContentFilterLevels,
  ExtendedUser,
  Guild,
  GuildNSFWLevels,
  type InteractionOptions,
  InteractionTypes,
  type Message,
  MFALevels,
  PremiumTiers,
  type RawApplicationCommand,
  type RawApplicationCommandInteraction,
  type RawClan,
  type RawGuild,
  type RawMember,
  type RawOAuthUser,
  type RawTextChannel,
  type RawUser,
  Shard,
  ShardManager,
  type User,
  VerificationLevels
} from 'oceanic.js'

import { TextChannel } from './structures/TextChannel'

/**
 * An augmented version of the {@link https://docs.oceanic.ws/v1.7.1 Oceanic.JS} client
 */
export class Client extends OceanicClient {
  /**
   * Mocking utilities
   */
  __testing__ = {
    client: this as OceanicClient,
    application: new ClientApplication({
      id: 'application',
      flags: 0
    }, this as OceanicClient),
    shard: new Shard(0, new ShardManager(this)),
    selfUserRaw: {
      avatar: null,
      discriminator: '0',
      id: Date.now().toString(),
      username: 'testself',
      flags: 0,
      public_flags: 0,
      email: null,
      mfa_enabled: false,
      verified: false,
      accent_color: null,
      banner: null,
      locale: 'en-us',
      global_name: 'Test User',
      clan: {
        badge: 'Clan',
        identity_enabled: true,
        identity_guild_id: '123456789012345678',
        tag: 'Tag'
      } satisfies RawClan
    } satisfies RawOAuthUser,

    guilds: new Map<string, Guild>(),
    textChannels: new Map<string, TextChannel>(),
    users: new Map<string, User>(),
    commands: [] as ApplicationCommand[],

    /**
     * "Connect" to the Discord API
     */
    async connect(): Promise<void> {
      this.client.shards.set(this.shard.id, this.shard)
      this.client.users.add(this.client.user)

      this.shard.emit('ready')
      this.client.emit('ready')
    },

    /**
     * Create a guild
     * @param   input The guild data
     * @returns       The resulting guild obj
     * @todo          Create the default role
     */
    createGuild(input?: Partial<RawGuild>): Guild {
      const id = input?.id ?? Date.now().toString()

      const selfMember: RawMember = {
        user: this.selfUserRaw,
        deaf: false,
        joined_at: Date.now().toString(),
        mute: false,
        roles: [id] // Default role
      }

      const defaultChannelRaw: RawTextChannel = {
        guild_id: id,
        id,
        name: 'default-channel-name',
        parent_id: null,
        type: ChannelTypes.GUILD_TEXT,
        default_auto_archive_duration: 60,
        last_message_id: null,
        last_pin_timestamp: null,
        nsfw: false,
        permission_overwrites: [],
        position: 0,
        rate_limit_per_user: 0,
        topic: 'topic'
      }

      const data: RawGuild = {
        afk_channel_id: null,
        afk_timeout: 1000,
        application_id: this.application.id,
        banner: null,
        channels: [],
        default_message_notifications:
          DefaultMessageNotificationLevels.NO_MESSAGES,
        description: 'default guild description',
        discovery_splash: null,
        emojis: [],
        explicit_content_filter: ExplicitContentFilterLevels.DISABLED,
        features: [],
        guild_scheduled_events: [],
        icon: null,
        id,
        joined_at: Date.now().toString(),
        large: false,
        member_count: 1,
        members: [selfMember],
        mfa_level: MFALevels.NONE,
        name: 'default guild name',
        nsfw_level: GuildNSFWLevels.DEFAULT,
        owner_id: this.client.user.id,
        preferred_locale: 'en-us',
        premium_progress_bar_enabled: false,
        premium_tier: PremiumTiers.NONE,
        presences: [],
        public_updates_channel_id: null,
        roles: [],
        rules_channel_id: null,
        safety_alerts_channel_id: null,
        splash: null,
        stage_instances: [],
        system_channel_flags: 0,
        system_channel_id: null,
        threads: [],
        vanity_url_code: null,
        verification_level: VerificationLevels.NONE,
        voice_states: [],
        incident_actions: null,
        inventory_settings: null,
        ...input
      }

      const guild = new Guild(data, this.client)
      const defaultChannel = new TextChannel(defaultChannelRaw, this.client)

      guild.channels.add(defaultChannel)
      this.client.channelGuildMap[defaultChannel.id] = guild.id

      this.guilds.set(guild.id, guild)
      this.client.guilds.add(guild)

      return guild
    },

    /**
     * Create a guild text channel
     * @param   input The channel data
     * @returns       The resulting channel obj
     */
    createGuildTextChannel(input?: Partial<RawTextChannel>): TextChannel {
      const guildId = input?.guild_id ?? Date.now().toString()
      const id = input?.id ?? (Date.now() + 1).toString() // Ensure IDs don't match

      if (!this.client.channelGuildMap[guildId]) {
        console.warn(
          '[TESTING-LIBRARY]',
          'Created a guild text channel without a guild. Creating a default guild...'
        )

        this.createGuild({ id: guildId })
      }

      const data: RawTextChannel = {
        type: ChannelTypes.GUILD_TEXT,
        id,
        guild_id: guildId,
        default_auto_archive_duration: 60,
        last_message_id: null,
        last_pin_timestamp: null,
        name: 'default-channel-name',
        nsfw: false,
        parent_id: null,
        permission_overwrites: [],
        position: 0,
        rate_limit_per_user: 0,
        topic: null,
        ...input
      }

      const channel = new TextChannel(data, this.client)

      this.textChannels.set(channel.id, channel)
      this.client.channelGuildMap[channel.id] = channel.guildID

      return channel
    },

    /**
     * @todo
     */
    createUser() {
    },

    /**
     * Send a message as a user
     * @param   channel The channel to send the message in
     * @param   options The message options
     * @returns         The resulting message obj
     * @todo            Allow choosing the author
     */
    async sendMessage(
      channel: AnyTextableChannel,
      options: CreateMessageOptions
    ): Promise<Message> {
      const message = await channel.createMessage(options)

      this.client.emit('messageCreate', message)

      return message
    },

    /**
     * Register a command to be called
     * @param   input The options
     * @returns       The resulting command obj
     */
    registerCommand(
      input: CreateApplicationCommandOptions
    ): ApplicationCommand {
      const id = Date.now().toString()

      const data: RawApplicationCommand = {
        integration_types: [ApplicationIntegrationTypes.GUILD_INSTALL],
        application_id: this.application.id,
        default_member_permissions: null,
        version: '1',
        id,
        contexts: [],
        ...input as CreateChatInputApplicationCommandOptions
      }

      const command = new ApplicationCommand(data, this.client)

      this.commands.push(command)

      return command
    },

    /**
     * Run a command
     * @param   channel The channel to run the command in
     * @param   user    The user who ran the command
     * @param   name    The name of the command (errors if not registered prior)
     * @param   options The options supplied to the command
     * @returns         The resulting command obj
     */
    callCommand(
      channel: TextChannel,
      user: User,
      name: string,
      options?: InteractionOptions[]
    ): CommandInteraction {
      const command = this.commands.find((c) => c.name === name)

      if (!command) throw Error('Tried to call a non-existent command')

      const id = Date.now().toString()

      const data: RawApplicationCommandInteraction = {
        application_id: this.application.id,
        channel_id: channel.id,
        data: {
          id: command.id,
          name,
          type: command.type,
          guild_id: channel.guildID,
          options
        },
        user: {
          global_name: 'Test User',
          public_flags: 0,
          ...user,
          clan: user.clan
            ? {
              badge: user.clan.badge,
              tag: user.clan.tag,
              identity_enabled: true,
              identity_guild_id: '123456789012345678'
            }
            : null
        } as RawUser,
        id,
        token: 'FAKE TOKEN',
        type: InteractionTypes.APPLICATION_COMMAND,
        version: 1,
        app_permissions: '0',
        attachment_size_limit: 25 * 1024 * 1024,
        authorizing_integration_owners: {}
      }

      const interaction = new CommandInteraction(data, this.client)

      this.client.emit('interactionCreate', interaction)

      return interaction
    }
  }

  private readonly _self = new ExtendedUser(this.__testing__.selfUserRaw, this)

  override get application(): ClientApplication {
    return this.__testing__.application
  }

  override get user(): ExtendedUser {
    return this._self
  }
}

import { prisma, type PrismaClient } from '@packages/database'
import env from '@packages/env'
import { Redis } from 'ioredis'
import {
  ActivityTypes,
  type AnyInteractionGateway,
  Client as BaseClient,
  type ClientOptions,
  type ComponentInteraction,
  ComponentTypes,
  type Member,
  type Message,
  type ModalSubmitInteraction,
  type PermissionName,
  type RESTApplication,
  type User
} from 'oceanic.js'
import { type $Fetch, createFetch } from 'ofetch'
import {
  InteractionsManager,
  type Managers,
  PluginsManager,
  PrefixCommandsManager
} from './managers'
import {
  AnalyticsModule,
  EconomyModule,
  type Modules,
  PersonalityEngineModule,
  QueryEngineModule,
  SchedulerModule,
  ShopModule
} from './modules'
import { Context } from './structures/context'
import type { SlashCommand, SubCommand } from './structures/slashcommand'
import { consola, logger } from './utils/logger'
import { WebhookReporter } from './webhook'

// Simple replacement for removed telemetry functionality
const withInteractionTracing = async (
  interaction: any,
  name: string,
  fn: (span: any) => Promise<any>
) => {
  return await fn({
    setAttributes: () => {},
    recordException: () => {},
    setStatus: () => {},
    end: () => {}
  })
}

export class Client extends BaseClient {
  public managers: Managers
  public owners: string[]
  public logger = logger.withTag('Client')
  public env: typeof env
  private oceanicLogger = logger.withTag('oceanic')

  public prisma: PrismaClient
  public redis: Redis
  public modules: Modules

  public fetcher: $Fetch

  public constructor(
    options: ClientOptions = {
      gateway: {
        getAllUsers: true,
        intents: [
          'GUILDS',
          'GUILD_MEMBERS',
          'GUILD_MESSAGES',
          'MESSAGE_CONTENT',
          'ALL'
        ]
      },
      allowedMentions: { everyone: false, repliedUser: true, roles: false },
      auth: `Bot ${env.DISCORD_TOKEN}`
    }
  ) {
    super(options)

    this.env = env
    this.fetcher = createFetch({
      defaults: {
        headers: {
          'User-Agent': 'vyx (https://github.com/taskylizard/vyx)'
        }
      }
    })

    this.logger.debug('Initialized loggers.')

    this.logger.info(`Running in ${env.NODE_ENV} mode`)

    this.prisma = prisma
    this.redis = new Redis({
      host: env.REDIS_HOST,
      port: Number(env.REDIS_PORT)
    })

    this.modules = {
      economy: new EconomyModule(this.prisma),
      shop: new ShopModule(this.prisma),
      scheduler: new SchedulerModule(
        this
      ),
      analytics: new AnalyticsModule(this),
      queryEngine: new QueryEngineModule(this.prisma),
      personalityEngine: new PersonalityEngineModule(this.prisma)
    }

    // Initialize personality engine immediately (fire-and-forget)
    // this.initializePersonalityEngine().catch(error => {
    //   this.logger.error('Personality engine initialization failed:', error)
    // })

    this.managers = {
      interactions: new InteractionsManager(this),
      plugins: new PluginsManager(this),
      prefixCommands: new PrefixCommandsManager(this, '!')
    }

    this.owners = []

    this.once('ready', async () => {
      this.logger.info(`Logged in as ${this.user?.username}.`)
      try {
        if (!this.owners.length) this.owners = await this.fetchBotOwners()
      } catch (error) {
        this.logger.error('Failed to fetch bot owners:', error)
      }
      this.user.client.editStatus('online', [
        {
          name: `${this.application.client.guilds.size} servers`,
          type: ActivityTypes.WATCHING
        }
      ])
      const updateResult = await this.managers.interactions.updateCommands()
      if (!updateResult.ok) {
        this.logger.error('Failed to update commands:', updateResult.error)
      } else {
        this.logger.info(updateResult.value)
      }

      // Load and schedule all active AI tasks on startup
      try {
        const activeTasks = await this.prisma.aITask.findMany({
          where: { isActive: true }
        })

        if (activeTasks.length > 0) {
          this.logger.info(`Loading ${activeTasks.length} active AI tasks...`)

          for (const task of activeTasks) {
            await this.modules.scheduler.scheduleAITask(task.id)
          }

          this.logger.info('Successfully scheduled all active AI tasks')
        } else {
          this.logger.info('No active AI tasks to schedule')
        }
      } catch (error) {
        this.logger.error(
          'Failed to load and schedule AI tasks on startup:',
          error
        )
      }
    })

    this.on('commandError', (ctx, error) =>
      this.logger.error(
        `An error occurred while running command ${ctx.commandName}:`,
        error
      ))
      .on('warn', (msg) => this.oceanicLogger.warn(msg))
      .on(
        'error',
        (err, id) => this.oceanicLogger.error(`Error on shard ${id}:`, err)
      )
      .on('interactionCreate', this.onInteraction)
      .on('messageCreate', this.onMessage)

    this.logger.info('Initialized Client.')
  }

  private async onMessage(_message: Message): Promise<void> {
    // await this.managers.prefixCommands.handleMessage(message)
  }

  private async onInteraction(
    interaction: AnyInteractionGateway
  ): Promise<void> {
    return await withInteractionTracing(
      interaction,
      `discord.interaction.${
        interaction.isModalSubmitInteraction()
          ? 'modal_submit'
          : interaction.isComponentInteraction()
          ? 'component'
          : interaction.isCommandInteraction()
          ? 'command'
          : 'unknown'
      }`,
      async (span) => {
        if (interaction.isModalSubmitInteraction()) {
          span.setAttributes({
            'interaction.modal.custom_id': interaction.data.customID
          })
          return this.runModalSubmitInteraction(interaction)
        }

        if (interaction.isComponentInteraction()) {
          span.setAttributes({
            'interaction.component.custom_id': interaction.data.customID,
            'interaction.component.type': interaction.data.componentType
              .toString()
          })
          return this.runComponentInteraction(interaction)
        }

        if (!interaction.isCommandInteraction()) return

        if (interaction.isUserCommand()) {
          span.setAttributes({
            'interaction.user_command.name': interaction.data.name,
            'interaction.user_command.target_id': interaction.data.targetID
          })

          this.logger.debug(
            `Received user-command interaction /${interaction.data.name} from ${interaction.user.tag} (${interaction.user.id})`
          )

          const cmd = this.managers.interactions.handlers.userCommands.get(
            interaction.data.name
          )

          if (!cmd) {
            this.logger.trace(
              `User-command ${interaction.data.name} not found`
            )
            return
          }
          this.logger.trace(`Found user-command ${cmd.name}`)

          await cmd.run(interaction)
          return
        }

        if (interaction.isMessageCommand()) {
          span.setAttributes({
            'interaction.message_command.name': interaction.data.name,
            'interaction.message_command.target_id': interaction.data.targetID
          })

          this.logger.debug(
            `Received message-command interaction /${interaction.data.name} from ${interaction.user.tag} (${interaction.user.id})`
          )

          const cmd = this.managers.interactions.handlers.messageCommands.get(
            interaction.data.name
          )

          if (!cmd) {
            this.logger.trace(
              `Message-command ${interaction.data.name} not found`
            )
            return
          }
          this.logger.trace(`Found message-command ${cmd.name}`)

          await cmd.run(interaction)
          return
        }

        this.logger.debug(
          `Received command interaction /${interaction.data.name} from ${interaction.user.tag} (${interaction.user.id}) in ${
            interaction.inPrivateChannel()
              ? interaction.guild
                ? interaction.guild.name
                : 'bot DM'
              : undefined
          }`
        )

        let cmd = this.managers.interactions.handlers.commands.get(
          interaction.data.name
        )

        if (!cmd) {
          this.logger.trace(`Command ${interaction.data.name} not found`)
          return
        }

        const subcommand = interaction.data.options.getSubCommand(false)

        if (subcommand) {
          const resolvedCommand = this.resolveSubcommand(cmd, subcommand)
          if (!resolvedCommand) {
            this.logger.trace(
              `SubCommand path ${subcommand.join(' → ')} not found`
            )
            return
          }
          cmd = resolvedCommand
        }

        this.logger.trace(`Found command ${cmd.name}`)

        const ctx = new Context(this, interaction, cmd)
        this.logger.trace(`Created Context for interaction /${cmd.name}`)

        try {
          await this.handleMiddlewares(ctx)
        } finally {
          // Clean up context resources
          ctx.dispose()
        }
      }
    )
  }

  private resolveSubcommand(
    command: SlashCommand,
    subcommandPath: string[]
  ): SlashCommand | SubCommand | null {
    let current: SlashCommand | SubCommand = command

    for (const subcommandName of subcommandPath) {
      const subcommand: SubCommand | undefined = current.subcommands?.find(
        (subcmd: SubCommand) => subcmd.name === subcommandName
      )
      if (!subcommand) {
        return null
      }
      current = subcommand
    }

    return current
  }

  private async handleMiddlewares(ctx: Context): Promise<void> {
    let _prevIndex = -1
    const stack = [
      ...this.managers.plugins.middlewares,
      this.runSlashCommand.bind(this)
    ]

    async function runner(index: number) {
      _prevIndex = index

      const middleware = stack[index]

      if (middleware) {
        await middleware(ctx, () => runner(index + 1))
      }
    }

    await runner(0)
  }

  private async runSlashCommand(
    ctx: Context,
    _next: () => Promise<void> | void
  ): Promise<void> {
    return await withInteractionTracing(
      ctx.interaction,
      `discord.command.${ctx.command.name}`,
      async (span) => {
        // Add command-specific attributes
        span.setAttributes({
          'command.name': ctx.command.name,
          'command.cooldown': ctx.command.cooldown || 0,
          'command.owner_only': ctx.command.ownerOnly || false,
          'command.guild_only': ctx.command.guildOnly || false,
          'user.tag': ctx.user.tag,
          'user.id': ctx.user.id
        })

        if (ctx.guild) {
          span.setAttributes({
            'guild.name': ctx.guild.name,
            'guild.id': ctx.guild.id
          })
        }

        if (ctx.command.ownerOnly && !this.isOwner(ctx.member || ctx.user)) {
          span.setAttributes({
            'command.execution.result': 'owner_only_denied'
          })
          this.logger.debug(
            `Command ${ctx.command.name} didn't run because ${ctx.user.tag} isn't a bot owner.`
          )
          this.emit('ownerOnlyCommand', ctx)
          return
        }

        if (ctx.command.guildOnly && !ctx.guild) {
          span.setAttributes({
            'command.execution.result': 'guild_only_denied'
          })
          this.logger.debug(
            `Command ${ctx.command.name} didn't run due to being ran in DMs.`
          )
          this.emit('guildOnlyCommand', ctx)
          return
        }

        if (ctx.command.cooldown) {
          if (!this.managers.interactions.cooldowns.has(ctx.command.name)) {
            this.managers.interactions.cooldowns.set(
              ctx.command.name,
              new Map<string, number>()
            )
          }

          const cmdCooldowns = this.managers.interactions.cooldowns.get(
            ctx.command.name
          )
          const now = Date.now()
          if (cmdCooldowns?.has((ctx.member || ctx.user).id)) {
            const expiration =
              (cmdCooldowns.get((ctx.member || ctx.user).id) as number) +
              ctx.command.cooldown * 1000
            if (now < expiration) {
              const secsLeft = Math.floor((expiration - now) / 1000)
              span.setAttributes({
                'command.execution.result': 'cooldown_active',
                'command.cooldown.seconds_left': secsLeft
              })
              this.logger.debug(
                `Command ${ctx.command.name} didn't run due to being on cooldown. Seconds left: ${secsLeft}`
              )
              this.emit('commandCooldown', ctx, secsLeft)
              return
            }
          }
        }

        try {
          if (
            ctx.command.guildOnly &&
            ctx.command.requiredPermissions &&
            !this.validatePermissions(
              ctx.member!,
              ctx.command.requiredPermissions
            )
          ) {
            span.setAttributes({
              'command.execution.result': 'permissions_denied',
              'command.required_permissions': ctx.command.requiredPermissions
                .join(',')
            })
            this.logger.debug(
              `Command ${ctx.command.name} didn't run because ${ctx.user.tag} doesn't have ${ctx.command.requiredPermissions.join()} permissions.`
            )
            this.emit('noPermissions', ctx, ctx.command.requiredPermissions)
            return
          }

          if (ctx.command.check && !ctx.command.check(ctx)) {
            span.setAttributes({
              'command.execution.result': 'check_failed'
            })
            this.emit('commandCheckFail', ctx)
            return
          }

          const startTime = Date.now()

          if (typeof ctx.command.run === 'string') {
            await ctx.reply(ctx.command.run)
          } else {
            await (ctx.command.run
              ? ctx.command.run(ctx)
              : ctx.reply(
                "I could not process that command as it didn't have any handlers.",
                true
              ))
          }

          const executionTime = Date.now() - startTime
          span.setAttributes({
            'command.execution.result': 'success',
            'command.execution.duration_ms': executionTime
          })

          this.emit('commandSuccess', ctx)
          if (this.modules.analytics) {
            await this.modules.analytics.writeInteraction(ctx.interaction)
          }

          if (ctx.command.cooldown) {
            const cmdCooldowns = this.managers.interactions.cooldowns.get(
              ctx.command.name
            )
            cmdCooldowns?.set(ctx.user.id, Date.now())
            // Set cleanup timer instead of relying on setTimeout which can accumulate
            setTimeout(
              () => {
                const currentCooldowns = this.managers.interactions.cooldowns
                  .get(ctx.command.name)
                currentCooldowns?.delete(ctx.user.id)
                // If no more cooldowns for this command, remove the entire map
                if (currentCooldowns?.size === 0) {
                  this.managers.interactions.cooldowns.delete(ctx.command.name)
                }
              },
              ctx.command.cooldown * 1000
            ).unref()
          }
        } catch (error) {
          span.setAttributes({
            'command.execution.result': 'error',
            'error.message': (error as Error).message,
            'error.name': (error as Error).name
          })
          this.emit('commandError', ctx, error as Error)
          throw error
        }
      }
    )
  }

  private async runComponentInteraction(interaction: ComponentInteraction) {
    if (!interaction.isComponentInteraction()) return

    return await withInteractionTracing(
      interaction,
      `discord.component.${interaction.data.customID.split('-')[0]}`,
      async (span) => {
        // action will be included in the custom id
        const action = interaction.data.customID.split('-')[0] ?? ''

        span.setAttributes({
          'component.action': action,
          'component.full_custom_id': interaction.data.customID
        })

        let handler = this.managers.interactions.handlers.components.get(action)

        // give higher priority to option value in select menus
        if (interaction.data.componentType === ComponentTypes.STRING_SELECT) {
          const value = interaction.data.values.getStrings()[0]?.split('-')[0]

          if (value) {
            span.setAttributes({
              'component.select.value': value
            })

            if (this.managers.interactions.handlers.components.has(value)) {
              handler = this.managers.interactions.handlers.components.get(
                value
              )
            }
          }
        }

        if (!handler) {
          span.setAttributes({
            'component.execution.result': 'handler_not_found'
          })
          this.logger.warn(`No handler found for component action: ${action}`)
          return
        }

        span.setAttributes({
          'component.handler.id': handler.id
        })

        try {
          await handler.run(interaction, this)
          span.setAttributes({
            'component.execution.result': 'success'
          })
        } catch (error) {
          span.setAttributes({
            'component.execution.result': 'error',
            'error.message': (error as Error).message,
            'error.name': (error as Error).name
          })
          this.logger.error(`Component handler ${handler.id} failed:`, error)

          // Try to send error response to user if interaction hasn't been responded to
          try {
            if (!interaction.acknowledged) {
              await interaction.reply({
                content: 'An error occurred while processing your request.',
                flags: 64 // ephemeral
              })
            }
          } catch (replyError) {
            this.logger.error('Failed to send error response:', replyError)
          }

          throw error
        }
      }
    )
  }

  private async runModalSubmitInteraction(interaction: ModalSubmitInteraction) {
    return await withInteractionTracing(
      interaction,
      `discord.modal.${interaction.data.customID.split('-')[0]}`,
      async (span) => {
        const action = interaction.data.customID.split('-')[0] ?? ''

        span.setAttributes({
          'modal.action': action,
          'modal.full_custom_id': interaction.data.customID
        })

        const handler = this.managers.interactions.handlers.components.get(
          action
        )

        if (!handler) {
          span.setAttributes({
            'modal.execution.result': 'handler_not_found'
          })
          this.logger.warn(`No handler found for modal action: ${action}`)
          return
        }

        span.setAttributes({
          'modal.handler.id': handler.id
        })

        try {
          await handler.run(interaction as any, this)
          span.setAttributes({
            'modal.execution.result': 'success'
          })
        } catch (error) {
          span.setAttributes({
            'modal.execution.result': 'error',
            'error.message': (error as Error).message,
            'error.name': (error as Error).name
          })
          this.logger.error(`Modal handler ${handler.id} failed:`, error)

          // Try to send error response to user if interaction hasn't been responded to
          try {
            if (!interaction.acknowledged) {
              await interaction.reply({
                content: 'An error occurred while processing your request.',
                flags: 64 // ephemeral
              })
            }
          } catch (replyError) {
            this.logger.error('Failed to send error response:', replyError)
          }

          throw error
        }
      }
    )
  }

  /**
   * Initialize personality engine asynchronously
   */
  private async initializePersonalityEngine(): Promise<void> {
    if (this.modules.personalityEngine) {
      try {
        this.logger.info('Initializing personality engine...')
        await this.modules.personalityEngine.initialize()
        this.logger.info('Personality engine initialized successfully')
      } catch (error) {
        this.logger.error('Failed to initialize personality engine:', error)
      }
    } else {
      this.logger.warn('Personality engine module is undefined')
    }
  }

  /**
   * Fetches the bot owners.
   * @returns Array of bot owner IDs
   */
  public async fetchBotOwners(): Promise<string[]> {
    const app: RESTApplication = await this.rest.request({
      method: 'GET',
      auth: true,
      path: '/oauth2/applications/@me'
    })

    let owners: string[]
    if (app.team) {
      owners = app.team.members.map((member) => member.user.id)
    } else if (app.owner) {
      owners = [app.owner.id]
    } else {
      this.logger.warn('No bot owner found in application data')
      owners = []
    }
    this.logger.debug(`Successfully fetched bot owners: ${owners.join(', ')}`)
    return owners
  }

  /**
   * Validates the specified member's permissions.
   * @param member Member
   * @param perms Array of permission names
   * @returns Whether the member has the specified permissions or not
   */
  public validatePermissions(member: Member, perms: PermissionName[]): boolean {
    for (const perm of perms) {
      if (!member.permissions.has(perm)) return false
    }

    return true
  }

  /**
   * Connect to Discord.
   */
  public async start(): Promise<void> {
    await this.managers.plugins.load()
    this.managers.interactions.load()

    await this.prisma.$connect()
    this.logger.info('Connected to prisma.')

    this.logger.info('Logging in...')
    await super.connect()

    // Connect to other services if tokens are provided
    // if (this.config.revolt.token) {
    //   await this.revolt.loginBot(this.config.revolt.token)
    // }
    // if (this.config.divolt.token) {
    //   await this.divolt.loginBot(this.config.divolt.token)
    // }

    process.on('unhandledRejection', (error: Error) => this.logger.error(error))
    process.on('unCaughtException', (error: Error) => this.logger.error(error))

    process.on('error', (error) => this.logger.error(error))
    process.on('exit', async () => {
      await this.prisma.$disconnect()
      if (this.modules.analytics) {
        await this.modules.analytics.close()
      }
      if (this.modules.personalityEngine) {
        await this.modules.personalityEngine.shutdown()
      }
      this.disconnect()
    })
  }

  /**
   * Checks whether the user is the bot owner or not.
   * @param user A member or user object
   * @returns boolean
   */
  public isOwner(user: Member | User): boolean {
    return this.owners.includes(user.id)
  }

  public async getUsersCount(): Promise<number> {
    // Try to get cached count first
    try {
      const cached = await this.redis.get('user_count')
      if (cached) {
        return Number(cached)
      }
    } catch (error) {
      this.logger.warn('Failed to get cached user count:', error)
    }

    // Calculate count efficiently using guild member counts
    let count = 0
    for (const guild of this.guilds.values()) {
      // Use guild.memberCount for performance instead of fetching all members
      count += guild.memberCount || 0
    }

    // Cache the result for 5 minutes
    try {
      await this.redis.setex('user_count', 300, count.toString())
    } catch (error) {
      this.logger.warn('Failed to cache user count:', error)
    }

    return count
  }

  public redactSecrets(text: string) {
    const NL = '!!NL!!'
    const NL_PATTERN = new RegExp(NL, 'g')
    const secrets = Object.keys(this.env).filter(Boolean)

    return text
      .replaceAll(NL_PATTERN, '\n')
      .replaceAll(new RegExp(secrets.join('|'), 'gi'), '[redacted]')
  }

  /**
   * Sets up webhook logging using consola reporter
   * @param webhookId Discord webhook ID
   * @param webhookToken Discord webhook token
   */
  public setupWebhookLogging(webhookId: string, webhookToken: string) {
    const webhookReporter = new WebhookReporter({
      id: webhookId,
      token: webhookToken,
      client: this
    })

    // Add the webhook reporter to the global consola instance
    consola.addReporter(webhookReporter)
    this.logger.debug('Webhook logging enabled')
  }
}

import {
  ConsoleTransport,
  LogLevel,
  Logger,
  type LoggerOptions,
  PrettyFormatter
} from '@control.systems/logger';
import { PrismaClient } from '@prisma/client';
import { createEnv } from 'neon-env';
import {
  type AnyInteractionGateway,
  Client as BaseClient,
  ChannelTypes,
  type ClientOptions,
  type ComponentInteraction,
  ComponentTypes,
  Member,
  type ModalSubmitInteraction,
  type PermissionName,
  type RESTApplication,
  Role,
  type User
} from 'oceanic.js';
import { join } from 'pathe';
import { Library, Rainlink } from 'rainlink';
import { InteractionsManager, type Managers, PluginsManager } from './managers';
import {
  Analytics,
  CasesModule,
  EconomyModule,
  type Modules,
  SchedulerModule,
  ShopModule
} from './modules';
import { RevoltClient } from './revolt/client';
import { Context } from './structures/context';
import { getDirname } from './utils/common';
import { DiscordFormatter, DiscordTransport } from './webhook';

export const env = createEnv({
  DISCORD_TOKEN: { type: 'string' },
  REVOLT_TOKEN: { type: 'string' },
  DIVOLT_TOKEN: { type: 'string' },
  DATABASE_URL: { type: 'string' },
  NODE_ENV: {
    type: 'string',
    choices: ['development', 'production'],
    default: 'development'
  },
  REDIS_HOST: { type: 'string' },
  LAVALINK_HOST: { type: 'string' },
  INFLUXDB_URL: { type: 'string' },
  ERRORS_WEBHOOK_ID: { type: 'string' },
  ERRORS_WEBHOOK_TOKEN: { type: 'string' },
  INFLUXDB_ADMIN_TOKEN: { type: 'string' }
});

type CompareResult = 'higher' | 'lower' | 'same' | 'invalid' | 'unknown';
const __dirname = getDirname(import.meta.url);

export class Client extends BaseClient {
  public managers: Managers;
  public owners: string[];
  public logger: Logger;
  public env: typeof env;
  private oceanicLogger: Logger;
  private rainlinkLogger: Logger;
  private loggerConfig: LoggerOptions;

  public prisma: PrismaClient;
  public modules: Modules;
  public rainlink: Rainlink;

  public revolt: RevoltClient;
  public divolt: RevoltClient;

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
        ],
        compress: true
      },
      allowedMentions: { everyone: false, repliedUser: true, roles: false },
      auth: `Bot ${env.DISCORD_TOKEN}`
    }
  ) {
    super(options);

    this.env = env;
    this.loggerConfig = {
      levels:
        env.NODE_ENV === 'production'
          ? [LogLevel.INFO]
          : [LogLevel.INFO, LogLevel.TRACE, LogLevel.ERROR, LogLevel.DEBUG],
      transports: [
        new ConsoleTransport({ formatter: new PrettyFormatter() }),
        new DiscordTransport({
          // @ts-expect-error
          formatter: new DiscordFormatter(),
          id: env.ERRORS_WEBHOOK_ID,
          token: env.ERRORS_WEBHOOK_TOKEN,
          client: this
        })
      ]
    };

    this.logger = new Logger(this.constructor.name, this.loggerConfig);
    this.oceanicLogger = new Logger('Oceanic', this.loggerConfig);
    this.rainlinkLogger = new Logger('rainlink', this.loggerConfig);
    this.logger.debug('Initialized loggers.');

    this.prisma = new PrismaClient();
    this.rainlink = new Rainlink({
      library: new Library.OceanicJS(this),
      nodes: [
        {
          name: 'lavalink',
          host: env.LAVALINK_HOST,
          port: 2333,
          auth: 'youshallnotpass',
          secure: false
        }
      ]
    });
    this.modules = {
      economy: new EconomyModule(this.prisma),
      shop: new ShopModule(this.prisma),
      cases: new CasesModule(this),
      scheduler: new SchedulerModule(
        { port: 6379, host: env.REDIS_HOST },
        this
      ),
      analytics: new Analytics(this)
    };

    this.managers = {
      interactions: new InteractionsManager(this, join(__dirname, '..')),
      plugins: new PluginsManager(this, join(__dirname, '..'))
    };

    this.revolt = new RevoltClient({}, 'Revolt');
    this.divolt = new RevoltClient(
      { baseURL: 'https://divolt.xyz/api' },
      'Divolt'
    );

    this.owners = [];

    this.once('ready', async () => {
      this.logger.info(`Logged in as ${this.user?.username}.`);
      try {
        if (!this.owners.length) this.owners = await this.fetchBotOwners();
      } catch (error) {
        this.logger.error('Failed to fetch bot owners:', error);
      }
      await this.managers.interactions.updateCommands();
      await this.managers.interactions.syncModules();
    });

    this.on('commandError', (ctx, error) =>
      this.logger.error(
        `An error occurred while running command ${ctx.commandName}:`,
        error
      )
    )
      .on('warn', (msg) => this.oceanicLogger.warn(msg))
      .on('error', (err, id) =>
        this.oceanicLogger.error(`Error on shard ${id}:`, err)
      )
      .on('interactionCreate', this.onInteraction);

    this.rainlink
      .on('nodeConnect', (node) =>
        this.rainlinkLogger.info(`Lavalink ${node.options.name}: Ready!`)
      )
      .on('nodeError', (node, error) =>
        this.rainlinkLogger.error(
          `Lavalink ${node.options.name}: Error caught:\n`,
          error
        )
      )
      .on('nodeClosed', (node) =>
        this.rainlinkLogger.warn(`Lavalink ${node.options.name}: Closed`)
      )
      .on('nodeDisconnect', (node, code, reason) =>
        this.rainlinkLogger.warn(
          `Lavalink ${node.options.name}: Disconnected, Code ${code}, Reason ${reason || 'No reason'}`
        )
      )
      .on('trackStart', async (player, track) => {
        const channel =
          this.getChannel(player.textId) ??
          (await this.rest.channels.get(player.textId));

        if (channel.type !== ChannelTypes.GUILD_TEXT) return;
        await channel.createMessage({
          content: `Now playing **${track.title}** by **${track.author}**`
        });
      });

    this.logger.info('Initialized Client.');
  }

  private async onInteraction(
    interaction: AnyInteractionGateway
  ): Promise<void> {
    if (interaction.isModalSubmitInteraction()) {
      return this.runModalSubmitInteraction(interaction);
    }
    if (interaction.isComponentInteraction()) {
      return this.runComponentInteraction(interaction);
    }
    if (!interaction.isCommandInteraction()) return;

    if (interaction.isUserCommand()) {
      this.logger.debug(
        `Received user-command interaction /${interaction.data.name} from ${interaction.user.tag} (${interaction.user.id})`
      );

      const cmd = this.managers.interactions.handlers.userCommands.get(
        interaction.data.name
      );

      if (!cmd) {
        this.logger.trace(`User-command ${interaction.data.name} not found`);
        return;
      }
      this.logger.trace(`Found user-command ${cmd.name}`);

      await cmd.run(interaction);
      return;
    }

    this.logger.debug(
      `Received command interaction /${interaction.data.name} from ${
        interaction.user.tag
      } (${interaction.user.id}) in ${
        interaction.inPrivateChannel()
          ? interaction.guild
            ? interaction.guild.name
            : 'bot DM'
          : undefined
      }`
    );

    let cmd = this.managers.interactions.handlers.commands.get(
      interaction.data.name
    );

    if (!cmd) {
      this.logger.trace(`Command ${interaction.data.name} not found`);
      return;
    }

    const subcommand = interaction.data.options.getSubCommand(false);

    if (subcommand) {
      let result = cmd?.subcommands?.find(
        (subcmd) => subcmd.name === subcommand[0]
      );
      if (!result) {
        this.logger.trace(`SubCommand ${subcommand[0]} not found`);
        return;
      }

      // HACK: fix this garbage and handle nested levels
      if (
        result &&
        !result.run &&
        result.subcommands &&
        result.subcommands.length > 0
      ) {
        result = result?.subcommands?.find(
          (subcmd) => subcmd.name === subcommand[1]
        );
        if (!result) {
          this.logger.trace(`SubCommand ${subcommand[1]} not found`);
          return;
        }
      }
      cmd = result;
    }

    this.logger.trace(`Found command ${cmd.name}`);

    const ctx = new Context(this, interaction, cmd);
    this.logger.trace(`Created Context for interaction /${cmd.name}`);

    await this.handleMiddlewares(ctx);
  }

  private async handleMiddlewares(ctx: Context): Promise<void> {
    let _prevIndex = -1;
    const stack = [
      ...this.managers.plugins.middlewares,
      this.runSlashCommand.bind(this)
    ];

    async function runner(index: number) {
      _prevIndex = index;

      const middleware = stack[index];

      if (middleware) {
        await middleware(ctx, () => runner(index + 1));
      }
    }

    await runner(0);
  }

  private async runSlashCommand(
    ctx: Context,
    _next: () => Promise<void> | void
  ): Promise<void> {
    if (ctx.command.ownerOnly && !this.isOwner(ctx.member || ctx.user)) {
      this.logger.debug(
        `Command ${ctx.command.name} didn't run because ${ctx.user.tag} isn't a bot owner.`
      );
      this.emit('ownerOnlyCommand', ctx);
      return;
    }

    if (ctx.command.guildOnly && !ctx.guild) {
      this.logger.debug(
        `Command ${ctx.command.name} didn't run due to being ran in DMs.`
      );
      this.emit('guildOnlyCommand', ctx);
      return;
    }

    if (ctx.command.cooldown) {
      if (!this.managers.interactions.cooldowns.has(ctx.command.name)) {
        this.managers.interactions.cooldowns.set(
          ctx.command.name,
          new Map<string, number>()
        );
      }

      const cmdCooldowns = this.managers.interactions.cooldowns.get(
        ctx.command.name
      );
      const now = Date.now();
      if (cmdCooldowns?.has((ctx.member || ctx.user).id)) {
        const expiration =
          (cmdCooldowns.get((ctx.member || ctx.user).id) as number) +
          ctx.command.cooldown * 1000;
        if (now < expiration) {
          const secsLeft = Math.floor((expiration - now) / 1000);
          this.logger.debug(
            `Command ${ctx.command.name} didn't run due to being on cooldown. Seconds left: ${secsLeft}`
          );
          this.emit('commandCooldown', ctx, secsLeft);
          return;
        }
      }
    }

    try {
      if (
        ctx.command.guildOnly &&
        ctx.command.requiredPermissions &&
        !this.validatePermissions(ctx.member!, ctx.command.requiredPermissions)
      ) {
        this.logger.debug(
          `Command ${ctx.command.name} didn't run because ${
            ctx.user.tag
          } doesn't have ${ctx.command.requiredPermissions.join()} permissions.`
        );
        this.emit('noPermissions', ctx, ctx.command.requiredPermissions);
        return;
      }

      if (ctx.command.check && !ctx.command.check(ctx)) {
        this.emit('commandCheckFail', ctx);
        return;
      }

      if (typeof ctx.command.run === 'string') {
        await ctx.reply(ctx.command.run);
      } else {
        await (ctx.command.run
          ? ctx.command.run(ctx)
          : ctx.reply(
              "I could not process that command as it didn't have any handlers.",
              true
            ));
      }

      this.emit('commandSuccess', ctx);
      this.modules.analytics.writeInteraction(ctx.interaction);
      if (ctx.command.cooldown) {
        const cmdCooldowns = this.managers.interactions.cooldowns.get(
          ctx.command.name
        );
        cmdCooldowns?.set(ctx.user.id, Date.now());
        setTimeout(
          () => cmdCooldowns?.delete(ctx.user.id),
          ctx.command.cooldown * 1000
        );
      }
    } catch (error) {
      this.emit('commandError', ctx, error as Error);
    }
  }

  private async runComponentInteraction(interaction: ComponentInteraction) {
    if (!interaction.isComponentInteraction()) return;

    // action will be included in the custom id
    const action = interaction.data.customID.split('-')[0];

    let handler = this.managers.interactions.handlers.components.get(action);

    // give higher priority to option value in select menus
    if (interaction.data.componentType === ComponentTypes.STRING_SELECT) {
      const value = interaction.data.values.getStrings()[0].split('-')[0];

      if (value && this.managers.interactions.handlers.components.has(value)) {
        handler = this.managers.interactions.handlers.components.get(value);
      }
    }

    if (!handler) return;

    // @ts-expect-error
    await handler.run(interaction!, this);
  }

  private async runModalSubmitInteraction(interaction: ModalSubmitInteraction) {
    const action = interaction.data.customID.split('-')[0];
    const handler = this.managers.interactions.handlers.components.get(action);

    if (!handler) return;

    // @ts-expect-error
    await handler.run(interaction!, this);
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
    });

    let owners: string[];
    if (app.team) {
      owners = app.team.members.map((member) => member.user.id);
    } else {
      // @ts-expect-error
      owners = [app.owner?.id];
    }
    this.logger.debug(`Successfully fetched bot owners: ${owners.join(', ')}`);
    return owners;
  }

  /**
   * Validates the specified member's permissions.
   * @param member Member
   * @param perms Array of permission names
   * @returns Whether the member has the specified permissions or not
   */
  public validatePermissions(member: Member, perms: PermissionName[]): boolean {
    for (const perm of perms) {
      if (!member.permissions.has(perm)) return false;
    }

    return true;
  }

  public getTopRole(member: Member) {
    return (
      member.roles
        .map((role) => member.guild.roles.get(role)!)
        .sort((a, b) => b.position - a.position)[0] ?? null
    );
  }

  /** higher = from is higher than to */
  public compareMemberToMember(
    from: Member,
    to: Member | string
  ): CompareResult {
    if (!(to instanceof Member)) {
      // biome-ignore lint/style/noParameterAssign: lol
      to = from.guild.members.get(to)!;
    }
    if (!to) {
      return 'invalid';
    }
    if (from.guild.ownerID === from.id) {
      return 'higher';
    }
    if (to.guild.ownerID === to.id) {
      return 'lower';
    }
    const a = this.getTopRole(from)?.position ?? -1;
    const b = this.getTopRole(to)?.position ?? -1;
    if (a > b) {
      return 'higher';
    }
    if (a < b) {
      return 'lower';
    }
    if (a === b) {
      return 'same';
    }
    return 'unknown';
  }

  /** higher = current member's top role is higher than compared role */
  public compareMemberToRole(from: Member, to: Role | string): CompareResult {
    if (!(to instanceof Role)) {
      // biome-ignore lint/style/noParameterAssign: lol
      to = from.guild.roles.get(to)!;
    }
    if (!to) {
      return 'invalid';
    }
    if (from.guild.ownerID === to.id) {
      return 'lower';
    }
    const a = this.getTopRole(from).position ?? -1;
    if (a > to.position) {
      return 'higher';
    }
    if (a < to.position) {
      return 'lower';
    }
    if (a === to.position) {
      return 'same';
    }
    return 'unknown';
  }

  /** higher = current role is higher than compared member's top role */
  public compareRoleToMember(from: Role, to: Member | string): CompareResult {
    if (!(to instanceof Member)) {
      // biome-ignore lint/style/noParameterAssign: lol
      to = from.guild.members.get(to)!;
    }
    if (!to) {
      return 'invalid';
    }
    if (from.guild.ownerID === to.id) {
      return 'lower';
    }
    const pos = this.getTopRole(to)?.position ?? -1;
    if (from.position > pos) {
      return 'higher';
    }
    if (from.position < pos) {
      return 'lower';
    }
    if (from.position === pos) {
      return 'same';
    }
    return 'unknown';
  }

  /** higher = current role is higher than compared role */
  public compareRoleToRole(from: Role, to: Role | string): CompareResult {
    if (!(to instanceof Role)) {
      // biome-ignore lint/style/noParameterAssign: lol
      to = from.guild.roles.get(to)!;
    }
    if (!to) {
      return 'invalid';
    }
    if (from.position > to.position) {
      return 'higher';
    }
    if (from.position < to.position) {
      return 'lower';
    }
    if (from.position === to.position) {
      return 'same';
    }
    return 'unknown';
  }

  /**
   * Connect to Discord.
   */
  public async start(): Promise<void> {
    await this.managers.plugins.load();
    await this.managers.interactions.load();

    await this.prisma.$connect();
    this.logger.info('Connected to prisma.');

    this.logger.info('Logging in...');
    await super.connect();
    await this.revolt.loginBot(env.REVOLT_TOKEN);
    await this.divolt.loginBot(env.DIVOLT_TOKEN);

    process.on('unhandledRejection', (error: Error) =>
      this.logger.error(error)
    );

    process.on('error', (error) => this.logger.error(error));
    process.on('exit', async () => {
      await this.prisma.$disconnect();
      await this.modules.analytics.writeApi.close();
      this.disconnect();
    });
  }

  /**
   * Checks whether the user is the bot owner or not.
   * @param user A member or user object
   * @returns boolean
   */
  public isOwner(user: Member | User): boolean {
    return this.owners.includes(user.id);
  }

  public async getUsersCount() {
    let count = 0;
    for (const guild of this.guilds.values()) {
      const members = (await guild.fetchMembers()).length;
      count += members;
    }
    return count;
  }
}

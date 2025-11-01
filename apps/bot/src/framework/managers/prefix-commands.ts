import type { Message } from 'oceanic.js'
import type { Client } from '../client'
import { PrefixContext } from '../structures/prefix-context'
import type { ArgumentsSchema } from '../structures/prefix-parser'
import type { PrefixCommand } from '../structures/prefixcommand'

export class PrefixCommandsManager {
  public commands: Map<string, PrefixCommand<ArgumentsSchema>>
  public aliases: Map<string, string>
  private prefix: string

  constructor(
    private client: Client,
    prefix = '!'
  ) {
    this.commands = new Map()
    this.aliases = new Map()
    this.prefix = prefix
  }

  public register<T extends ArgumentsSchema>(command: PrefixCommand<T>): void {
    this.commands.set(command.name, command as PrefixCommand<ArgumentsSchema>)

    if (command.aliases) {
      for (const alias of command.aliases) {
        this.aliases.set(alias, command.name)
      }
    }

    this.client.logger.debug(`Registered prefix command: ${command.name}`)
  }

  public registerMany(commands: PrefixCommand<ArgumentsSchema>[]): void {
    for (const command of commands) {
      this.register(command)
    }
  }

  private formatUsage(command: PrefixCommand<ArgumentsSchema>): string {
    if (command.usage) {
      return `${this.prefix}${command.name} ${command.usage}`
    }

    if (!command.args) {
      return `${this.prefix}${command.name}`
    }

    const argParts = Object.entries(command.args).map(([name, def]) => {
      const argName = def.type === 'rest' ? `${name}...` : name
      return def.required ? `<${argName}>` : `[${argName}]`
    })

    return `${this.prefix}${command.name} ${argParts.join(' ')}`
  }

  public async handleMessage(message: Message): Promise<void> {
    if (message.author.bot) return
    if (!message.content.startsWith(this.prefix)) return

    const args = message.content.slice(this.prefix.length).trim()
    const commandName = args.split(/\s+/)[0]?.toLowerCase()
    if (!commandName) return

    const rawArgs = args.slice(commandName.length).trim()

    let command = this.commands.get(commandName)
    if (!command) {
      const aliasTarget = this.aliases.get(commandName)
      if (aliasTarget) {
        command = this.commands.get(aliasTarget)
      }
    }

    if (!command) return

    if (command.disabled) {
      this.client.logger.debug(`Command ${command.name} is disabled`)
      return
    }

    if (command.ownerOnly && !this.client.isOwner(message.author)) {
      this.client.logger.debug(`Command ${command.name} is owner-only`)
      return
    }

    if (command.guildOnly && !message.guildID) {
      this.client.logger.debug(`Command ${command.name} is guild-only`)
      return
    }

    if (
      command.guilds && message.guildID &&
      !command.guilds.includes(message.guildID)
    ) {
      return
    }

    if (command.requiredPermissions && message.member) {
      if (
        !this.client.validatePermissions(
          message.member,
          command.requiredPermissions
        )
      ) {
        this.client.logger.debug(`User lacks permissions for ${command.name}`)
        return
      }
    }

    const ctx = new PrefixContext(
      this.client,
      message as any,
      command,
      rawArgs
    )

    try {
      if (command.check && !(await command.check(ctx))) {
        this.client.logger.debug(`Check failed for ${command.name}`)
        return
      }

      await command.run(ctx)
      this.client.logger.debug(`Executed prefix command: ${command.name}`)
    } catch (error) {
      this.client.logger.error(
        `Error executing prefix command ${command.name}:`,
        error
      )

      if (
        error instanceof Error &&
        error.message.startsWith('missing required argument:')
      ) {
        const usage = this.formatUsage(command)
        try {
          await ctx.reply(`${error.message}\n\nUsage: \`${usage}\``)
        } catch {
          // ignore reply errors
        }
      } else if (
        error instanceof Error &&
        error.message.startsWith('invalid number for argument:')
      ) {
        const usage = this.formatUsage(command)
        try {
          await ctx.reply(`${error.message}\n\nUsage: \`${usage}\``)
        } catch {
          // ignore reply errors
        }
      } else {
        try {
          await ctx.reply('An error occurred while executing that command.')
        } catch {
          // ignore reply errors
        }
      }
    }
  }

  public setPrefix(prefix: string): void {
    this.prefix = prefix
  }

  public getPrefix(): string {
    return this.prefix
  }
}

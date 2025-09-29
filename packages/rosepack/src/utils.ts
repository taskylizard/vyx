import { ApplicationCommandBuilder } from '@oceanicjs/builders'
import {
  ApplicationCommandOptionTypes,
  ApplicationCommandTypes,
  type CommandInteraction
} from 'oceanic.js'
import type {
  OptionsDef,
  OptionType,
  ParsedOptionType,
  RosepackCommand,
  RosepackContextMenu
} from './types'

const commandToJSON = (cmd: RosepackCommand) => {
  const builder = new ApplicationCommandBuilder(
    ApplicationCommandTypes.CHAT_INPUT,
    cmd.config.name!
  )
    .setDescription(cmd.config.description ?? 'No description provided')
    .setDMPermission(cmd.config.dm ?? false)

  if (cmd.config.options) {
    for (const name in cmd.config.options) {
      const arg = cmd.config.options[name]
      if (!arg) continue

      switch (arg.type) {
        case 'String':
          builder.addOption(
            name,
            ApplicationCommandOptionTypes.STRING,
            (option) => {
              option.setDescription(
                arg.description ?? 'No description provided'
              )
              option.setRequired(arg.required ?? true)
            }
          )
          break

        case 'Integer':
          builder.addOption(
            name,
            ApplicationCommandOptionTypes.INTEGER,
            (option) => {
              option.setDescription(
                arg.description ?? 'No description provided'
              )
              option.setRequired(arg.required ?? true)
            }
          )
          break

        case 'Boolean':
          builder.addOption(
            name,
            ApplicationCommandOptionTypes.BOOLEAN,
            (option) => {
              option.setDescription(
                arg.description ?? 'No description provided'
              )
              option.setRequired(arg.required ?? true)
            }
          )
          break

        case 'User':
          builder.addOption(
            name,
            ApplicationCommandOptionTypes.USER,
            (option) => {
              option.setDescription(
                arg.description ?? 'No description provided'
              )
              option.setRequired(arg.required ?? true)
            }
          )
          break

        case 'Channel':
          builder.addOption(
            name,
            ApplicationCommandOptionTypes.CHANNEL,
            (option) => {
              option.setDescription(
                arg.description ?? 'No description provided'
              )
              option.setRequired(arg.required ?? true)
            }
          )
          break

        case 'Role':
          builder.addOption(
            name,
            ApplicationCommandOptionTypes.ROLE,
            (option) => {
              option.setDescription(
                arg.description ?? 'No description provided'
              )
              option.setRequired(arg.required ?? true)
            }
          )
          break

        case 'Number':
          builder.addOption(
            name,
            ApplicationCommandOptionTypes.NUMBER,
            (option) => {
              option.setDescription(
                arg.description ?? 'No description provided'
              )
              option.setRequired(arg.required ?? true)
            }
          )
          break

        case 'Mentionable':
          builder.addOption(
            name,
            ApplicationCommandOptionTypes.MENTIONABLE,
            (option) => {
              option.setDescription(
                arg.description ?? 'No description provided'
              )
              option.setRequired(arg.required ?? true)
            }
          )
          break

        case 'Attachment':
          builder.addOption(
            name,
            ApplicationCommandOptionTypes.ATTACHMENT,
            (option) => {
              option.setDescription(
                arg.description ?? 'No description provided'
              )
              option.setRequired(arg.required ?? true)
            }
          )
          break

        case 'Message':
        case 'Emoji':
        case 'Date':
        case 'Url':
          builder.addOption(
            name,
            ApplicationCommandOptionTypes.STRING,
            (option) => {
              option.setDescription(
                arg.description ?? 'No description provided'
              )
              option.setRequired(arg.required ?? true)
            }
          )
          break
      }
    }
  }

  return builder.toJSON()
}

const contextMenuToJSON = (ctm: RosepackContextMenu) => {
  const type = ctm.config.type === 'Message'
    ? ApplicationCommandTypes.MESSAGE
    : ApplicationCommandTypes.USER

  const builder = new ApplicationCommandBuilder(type, ctm.config.name!)
    .setDMPermission(ctm.config.dm ?? false)

  return builder.toJSON()
}

const isRosepackCommand = (
  command: RosepackCommand<OptionsDef> | RosepackContextMenu
): command is RosepackCommand<OptionsDef> => {
  return 'execute' in command && 'config' in command
}

export const toJSON = (
  cmd: RosepackCommand<OptionsDef> | RosepackContextMenu
) => {
  return isRosepackCommand(cmd) ? commandToJSON(cmd) : contextMenuToJSON(cmd)
}

const resolveDate = (resolvable: string) => {
  const date = new Date(resolvable)
  if (isNaN(date.getTime())) return null
  return date
}

const resolveUrl = (resolvable: string) => {
  try {
    const url = new URL(resolvable)
    return url
  } catch {
    return null
  }
}

export const resolveOption = async (
  interaction: CommandInteraction,
  type: OptionType,
  name: string
): Promise<ParsedOptionType> => {
  if (!interaction.data.options) return null

  switch (type) {
    case 'String':
    case 'Message':
    case 'Emoji':
      return interaction.data.options.getString(name, false) || null
    case 'Integer':
      return interaction.data.options.getInteger(name, false) ?? null
    case 'Boolean':
      return interaction.data.options.getBoolean(name, false) ?? null
    case 'User':
      return interaction.data.options.getUser(name, false) || null
    case 'Channel':
      return interaction.data.options.getChannel(name, false) || null
    case 'Role':
      return interaction.data.options.getRole(name, false) || null
    case 'Number':
      return interaction.data.options.getNumber(name, false) ?? null
    case 'Mentionable':
      return interaction.data.options.getMember(name, false) ||
        interaction.data.options.getUser(name, false) || null
    case 'Attachment':
      return interaction.data.options.getAttachment(name, false) || null
    case 'SubCommand': {
      const subCommand = interaction.data.options.getSubCommand(false)
      if (!subCommand) return false
      return subCommand.includes(name)
    }
    case 'Date': {
      const string = interaction.data.options.getString(name, false)
      if (!string) return null
      return resolveDate(string)
    }
    case 'Url': {
      const string = interaction.data.options.getString(name, false)
      if (!string) return null
      return resolveUrl(string)
    }
    default:
      return null
  }
}

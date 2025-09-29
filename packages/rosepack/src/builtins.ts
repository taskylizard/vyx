import { defineCommand } from './define'
import { useRosepack } from './rosepack'
import type { CommandConfig } from './types'
import { useEmbed } from './uses'

// Simple replacement for Discord.js chatInputApplicationCommandMention
const formatCommandMention = (name: string, id: string) => `</${name}:${id}>`

const groupCommandsByCategory = (commands: CommandConfig[]) => {
  return commands.reduce((acc: Record<string, CommandConfig[]>, command) => {
    const category = command.category ?? 'uncategorized'
    if (!acc[category]) {
      acc[category] = []
    }
    acc[category].push(command)
    acc[category].sort((a, b) => a.name!.localeCompare(b.name!))
    return acc
  }, {})
}

const capitalize = (str: string) => {
  return `${str.charAt(0).toUpperCase()}${str.slice(1)}`
}

export const helpCommand = defineCommand(
  {
    name: 'help',
    description: 'Shows a list of available commands.',
    category: 'utils',
    options: {
      command: {
        type: 'String',
        description: 'The command to get help for.',
        autocomplete: true,
        required: false
      }
    },
    autocomplete(interaction) {
      const { commands } = useRosepack()
      const options = commands.map((cmd) => ({
        name: cmd.config.name!,
        value: cmd.config.name!
      }))

      interaction.result(options)
    }
  },
  async (interaction, ctx) => {
    const { command } = ctx.options
    const { client, commands } = useRosepack()

    if (!command) {
      const groupedCommands = groupCommandsByCategory(
        commands.map((cmd) => cmd.config)
      )
      const description = Object.entries(groupedCommands)
        .map(
          ([category, cmds]) =>
            `**${capitalize(category)}**\n${
              cmds.map((cmd) =>
                `> ${
                  formatCommandMention(cmd.name!, cmd.id!)
                } **-** ${cmd.description}`
              ).join('\n')
            }`
        )
        .join('\n\n')
      const embed = useEmbed({
        author: { name: 'Help', iconURL: client.user?.avatarURL() },
        color: 'Random',
        title: 'Available Commands',
        description
      })

      return interaction.reply({ embeds: [embed.toJSON()] })
    } else {
      const cmd = commands.get(command)

      if (!cmd) {
        return interaction.reply({ content: `Command ${command} not found.` })
      }

      const cmdOptions = cmd.config.options
        ? Object.entries(cmd.config.options)
        : null
      const embed = useEmbed({
        color: 'Random',
        author: {
          name: `Help for ${cmd.config.name}`,
          iconURL: client.user?.avatarURL()
        },
        description: cmd.config.description,
        fields: [
          {
            name: 'Category',
            value: capitalize(cmd.config.category ?? 'None'),
            inline: true
          },
          {
            name: 'Preconditions',
            value: cmd.config.preconditions
              ?.map((prc) => `\`${prc}\``)
              ?.join(', ') ?? 'None',
            inline: true
          },
          {
            name: 'Options',
            value: cmdOptions
              ?.map(
                ([name, option]) =>
                  `\`${name}\`${
                    option.required ? '*' : ''
                  } - ${option.description}`
              )
              .join('\n') ?? 'None'
          }
        ]
      })

      return interaction.reply({ embeds: [embed.toJSON()] })
    }
  }
)

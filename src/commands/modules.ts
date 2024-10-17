import type { Module } from '@prisma/client'
import {
  ApplicationCommandOptionTypes,
  type ApplicationCommandOptionsChoice
} from 'oceanic.js'
import { defineSlashCommand } from '#framework'

const modules: ApplicationCommandOptionsChoice<ApplicationCommandOptionTypes.STRING>[] =
  [
    { name: '📮 Report', value: 'REPORT' },
    { name: '🍣 Economy', value: 'ECONOMY' },
    { name: '🎶 Music', value: 'MUSIC' }
  ]

export default defineSlashCommand({
  name: 'modules',
  description: 'Toggle server modules.',
  guildOnly: true,
  requiredPermissions: ['MANAGE_GUILD'],
  subcommands: [
    {
      name: 'enable',
      description: 'Enable a module.',
      options: [
        {
          name: 'module',
          description: 'The module to enable.',
          type: ApplicationCommandOptionTypes.STRING,
          required: true,
          choices: modules
        }
      ],

      async run(ctx) {
        const mod = ctx.options.getString('module', true)

        const command = [
          ...ctx.client.managers.interactions.handlers.commands.values()
        ].find((command) => command.moduleId === mod)

        if (!command) return await ctx.reply('Could not find that module.')

        let config = await ctx.client.prisma.config.findUnique({
          where: { guildId: BigInt(ctx.interaction.guildID!) }
        })

        // Just creating config for servers without it
        if (!config || config === null)
          config = await ctx.client.prisma.config.create({
            data: {
              guildId: BigInt(ctx.interaction.guildID!),
              currency: '🍣',
              reportsChannel: null
            }
          })

        if (config.modules.includes(mod)) {
          // HACK: Sometimes Discord will just shit itself and will not sync modules commands
          // HACK: This is a fix for this until I figure out

          const commands = await ctx.client.application.getGuildCommands(
            ctx.guild!.id
          )
          const resolvedCommand = commands.find(
            (cmd) => cmd.name === command.name
          )

          if (!resolvedCommand) {
            // That means they don't exist in the guild, so we add them back.
            await ctx.client.application.createGuildCommand(
              ctx.interaction.guildID!,
              ctx.client.managers.interactions.toSlashJson(command)
            )

            return await ctx.reply(
              'The module is enabled but its commands did not exist here, I have added them back.'
            )
          }
          return await ctx.reply('That seems to be already enabled.')
        }

        await ctx.client.prisma.config.update({
          where: { guildId: BigInt(ctx.guild!.id) },
          data: { modules: [...config.modules, mod as Module] }
        })

        await ctx.client.application.createGuildCommand(
          ctx.interaction.guildID!,
          ctx.client.managers.interactions.toSlashJson(command)
        )

        return await ctx.reply(
          `Enabled ${modules.find((_mod) => _mod.value === mod)?.name}.`
        )
      }
    },
    {
      name: 'disable',
      description: 'Disable a module.',
      options: [
        {
          name: 'module',
          description: 'The module to disable.',
          type: ApplicationCommandOptionTypes.STRING,
          required: true,
          choices: modules
        }
      ],
      async run(ctx) {
        const mod = ctx.options.getString('module', true)

        const command = [
          ...ctx.client.managers.interactions.handlers.commands.values()
        ].find((command) => command.moduleId === mod)

        if (!command) return await ctx.reply('Could not find that module.')

        const guildCommands = await ctx.client.application.getGuildCommands(
          ctx.interaction.guildID!
        )

        const find = guildCommands.find(
          (cmd) =>
            cmd.name === command.name && cmd.description === command.description
        )

        if (!find)
          return await ctx.reply(
            'Could not find the commands here, is this module enabled?'
          )

        const config = await ctx.client.prisma.config.findUnique({
          where: { guildId: BigInt(ctx.guild!.id) }
        })

        if (!config) {
          return await ctx.reply(
            'Could not find a config for this server, create one with `/modules enable`.'
          )
        }

        const updatedModules = config.modules.filter((module) => module !== mod)

        await ctx.client.prisma.config.update({
          where: { guildId: BigInt(ctx.guild!.id) },
          data: { modules: updatedModules }
        })

        await ctx.client.application.deleteGuildCommand(
          ctx.interaction.guildID!,
          find.id
        )

        return await ctx.reply(
          `Disabled ${modules.find((_mod) => _mod.value === mod)?.name}.`
        )
      }
    }
  ]
})

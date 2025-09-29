import { defineSlashCommand } from '#framework'
import type { Module } from '@packages/database'
import { ApplicationCommandOptionTypes } from 'oceanic.js'

const modules: { name: string; value: Module }[] = [
  { name: '📮 Report', value: 'REPORT' },
  { name: '🍣 Economy', value: 'ECONOMY' },
  { name: '🔨 Moderation', value: 'MODERATION' },
  { name: '🤖 Query Engine', value: 'QUERY_ENGINE' }
] as const

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

        const msg = await ctx.followUp({
          content: 'Enabling module...'
        })

        const message = await msg.getMessage()

        const r = await ctx.client.managers.interactions.toggleModule(
          ctx.interaction.guildID!,
          mod,
          'enable'
        )

        if (!r.ok) {
          return await ctx.interaction.editFollowup(message.id, {
            content: r.error
          })
        }

        return await ctx.interaction.editFollowup(message.id, {
          content: r.value
        })
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

        const msg = await ctx.followUp({
          content: 'Disabling module...'
        })

        const message = await msg.getMessage()

        const r = await ctx.client.managers.interactions.toggleModule(
          ctx.interaction.guildID!,
          mod,
          'disable'
        )

        if (!r.ok) {
          return await ctx.interaction.editFollowup(message.id, {
            content: r.error
          })
        }

        return await ctx.interaction.editFollowup(message.id, {
          content: r.value
        })
      }
    },
    {
      name: 'list',
      description: 'List all enabled modules.',
      async run(ctx) {
        const msg = await ctx.followUp({
          content: 'Listing modules...'
        })

        const message = await msg.getMessage()

        const r = await ctx.client.managers.interactions.listModules(
          ctx.interaction.guildID!
        )

        if (!r.ok) {
          return await ctx.interaction.editFollowup(message.id, {
            content: r.error
          })
        }

        return await ctx.interaction.editFollowup(message.id, {
          content: r.value
        })
      }
    }
  ]
})

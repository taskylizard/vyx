import { moduleChoices } from 'rosepack'
import { match } from 'ts-pattern'
import { slash, slashSub } from '../bot/rosepack.ts'
import { modules } from '../modules.ts'
import { denyUnlessBotOwner } from './guards.ts'

const moduleOption = {
  choices: moduleChoices(modules),
  description: 'The module to change',
  kind: 'string',
  required: true
} as const

export default slash({
  name: 'modules',
  description: 'Manage Kanikou features for this server (bot owner only)',
  contexts: ['guild'],
  installations: ['guild'],
  async onError(context, error) {
    context.app.logger.warn('module management command failed', error)
    await match(context.acknowledged)
      .with(true, async () => undefined)
      .otherwise(async () => context.defer({ ephemeral: true }))
    await context.editResponse('The module change could not be completed. Please try again.')
  },
  subcommands: {
    list: slashSub({
      description: 'List the features enabled in this server',
      async execute(context) {
        if (await denyUnlessBotOwner(context)) return
        await context.defer({ ephemeral: true })
        await match(context.interaction.guildID)
          .with(null, async () => {
            await context.editResponse('Modules can only be managed inside a Discord server.')
          })
          .otherwise(async () => {
            const enabled = new Set((await context.modules.list()).map((module) => module.id))
            const lines = Object.values(modules).map(
              (module) =>
                `${match(enabled.has(module.id))
                  .with(true, () => '✅')
                  .otherwise(() => '⬜')} ${module.label}`
            )
            await context.editResponse(['**Server modules**', ...lines].join('\n'))
          })
      }
    }),
    enable: slashSub({
      description: 'Enable a feature in this server',
      options: { module: moduleOption },
      async execute(context) {
        if (await denyUnlessBotOwner(context)) return
        await context.defer({ ephemeral: true })
        await match(context.interaction.guildID)
          .with(null, async () => {
            await context.editResponse('Modules can only be managed inside a Discord server.')
          })
          .otherwise(async () => {
            const result = await context.modules.enable(context.options.module)
            await match(result.changed)
              .with(true, async () => {
                await context.editResponse(`Enabled ${result.module.label} for this server.`)
              })
              .otherwise(async () => {
                await context.editResponse(
                  `${result.module.label} is already enabled in this server.`
                )
              })
          })
      }
    }),
    disable: slashSub({
      description: 'Disable a feature in this server',
      options: { module: moduleOption },
      async execute(context) {
        if (await denyUnlessBotOwner(context)) return
        await context.defer({ ephemeral: true })
        await match(context.interaction.guildID)
          .with(null, async () => {
            await context.editResponse('Modules can only be managed inside a Discord server.')
          })
          .otherwise(async () => {
            const result = await context.modules.disable(context.options.module)
            await match(result.changed)
              .with(true, async () => {
                await context.editResponse(`Disabled ${result.module.label} for this server.`)
              })
              .otherwise(async () => {
                await context.editResponse(
                  `${result.module.label} is already disabled in this server.`
                )
              })
          })
      }
    })
  }
})

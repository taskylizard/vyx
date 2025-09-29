import { defineCommand } from 'citty'
import consola from 'consola'
import { colors } from 'consola/utils'
import { ofetch } from 'ofetch'
import open from 'open'
import 'dotenv/config'

const Permissions = {
  Administrator: 8,
  Moderation: 3317593800758,
  None: 0
} as const

export default defineCommand({
  meta: {
    name: 'invite',
    description: 'Generate a Discord invite link to add the bot to a server'
  },
  args: {
    id: {
      type: 'string',
      description: 'Bot id'
    },
    open: {
      type: 'boolean',
      alias: 'o',
      description: 'Open the invite link in the default browser'
    }
  },
  async run(ctx) {
    let id: string | null = null

    if (ctx.args.id) {
      id = ctx.args.id
    } else if (!process.env.DISCORD_CLIENT_TOKEN) {
      id = await consola.prompt('Enter your bot id.', { type: 'text' })
    } else {
      const { bot } = await ofetch(
        'https://discord.com/api/oauth2/applications/@me',
        {
          headers: {
            Accept: 'application/json',
            Authorization: `Bot ${process.env.DISCORD_CLIENT_TOKEN}`
          }
        }
      )

      id = bot.id
    }
    const permission = await consola.prompt('Choose bot permissions.', {
      type: 'select',
      options: Object.keys(Permissions) as (keyof typeof Permissions)[]
    })
    const inviteLink =
      `https://discord.com/oauth2/authorize?client_id=${id}&permissions=${
        Permissions[permission]
      }&scope=bot`

    consola.success('Invite link generated')
    if (ctx.args.open) {
      consola.info('Opening invite link...')
      try {
        await open(inviteLink)
      } catch (error) {
        consola.error('Failed to open invite link', error)
      }
    } else {
      consola.info(colors.bold(inviteLink))
    }
  }
})

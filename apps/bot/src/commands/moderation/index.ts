import { defineSlashCommand } from '#framework'
import automod from './automod'
import ban from './ban'
import kick from './kick'
import logging from './logging'
import report from './report'
import timeout from './timeout'
import unban from './unban'

export default defineSlashCommand({
  moduleId: 'MODERATION',
  name: 'moderation',
  description: 'Moderation tools and configuration.',
  guildOnly: true,
  subcommands: [kick, ban, unban, timeout, logging, report, automod]
})

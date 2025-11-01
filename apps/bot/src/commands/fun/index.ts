import { defineSlashCommand } from '#framework'
import {
  ApplicationIntegrationTypes,
  InteractionContextTypes
} from 'oceanic.js'
import github from '../utilities/github'
import npm from '../utilities/npm'
import eightBall from './8ball'
import anilist from './anilist'
import sayhi from './sayhi'
import tictactoe from './tictactoe'

export default defineSlashCommand({
  name: 'fun',
  description: 'Fun commands for entertainment.',
  contexts: [
    InteractionContextTypes.BOT_DM,
    InteractionContextTypes.GUILD,
    InteractionContextTypes.PRIVATE_CHANNEL
  ],
  integrationTypes: [
    ApplicationIntegrationTypes.USER_INSTALL,
    ApplicationIntegrationTypes.GUILD_INSTALL
  ],
  subcommands: [
    eightBall,
    anilist,
    sayhi,
    tictactoe,
    github,
    npm
  ]
})

import {
  ApplicationIntegrationTypes,
  InteractionContextTypes
} from 'oceanic.js'
import { Embed, defineSlashCommand } from '#framework'

export default defineSlashCommand({
  name: 'npm',
  description: 'Searches by provided package name in NPM registry.',
  options: [
    {
      type: 3,
      name: 'package',
      description: 'Package name.',
      required: true
    }
  ],
  contexts: [
    InteractionContextTypes.BOT_DM,
    InteractionContextTypes.GUILD,
    InteractionContextTypes.PRIVATE_CHANNEL
  ],
  integrationTypes: [
    ApplicationIntegrationTypes.USER_INSTALL,
    ApplicationIntegrationTypes.GUILD_INSTALL
  ],
  async run(ctx) {
    const query = ctx.options.getString('package', true)

    let response: any
    try {
      response = await (
        await fetch(`https://registry.npmjs.org/${encodeURIComponent(query)}`)
      ).json()
      const pkg = response.versions[response['dist-tags'].latest]

      const embed = new Embed()
        .setTitle(pkg.name)
        .setDescription(pkg.description)
        .setURL(`https://www.npmjs.org/package/${pkg.name}`)
        .setColor(ctx.colors.DARK_RED)
        .addField('Version', pkg.version)
        .setFooter({ text: 'Last updated at' })
        .setTimestamp(new Date(response.time.modified).toISOString())

      if (pkg.license) {
        embed.addField('License', pkg.license)
      }

      if (pkg.keywords?.length) {
        embed.addField(
          'Keywords',
          pkg.keywords.map((keyword: string) => `\`${keyword}\``).join(', ')
        )
      }

      return await ctx.reply({ embeds: [embed] })
    } catch {
      return await ctx.reply(
        "There were no results for your query - did you type the package's name correctly?"
      )
    }
  }
})

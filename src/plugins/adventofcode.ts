import { Client as AOCClient } from 'aocjs'
import { codeblock } from 'discord-md-tags'
import type { CreateMessageOptions, Message, TextChannel } from 'oceanic.js'
import { type Client, definePlugin } from '#framework'

const LEADERBOARD_URL =
  'https://adventofcode.com/2024/leaderboard/private/view/1776951'
const CHANNEL_IDS = ['1313106215110311936', '1313106634322739290']

const ZWSP = '\u200B'
function formatTable(rows: string[][]) {
  const highestLengths = Array.from({ length: rows[0].length }, (_, a) =>
    Math.max(...rows.map((row) => row[a].length))
  )

  return (
    ZWSP +
    rows
      .map((row) =>
        row.map((a, b) => a.padStart(highestLengths[b], ' ')).join('    ')
      )
      .join('\n')
  )
}

export default definePlugin({
  name: 'adventofcode',
  onLoad(client) {
    const aoc = new AOCClient({
      session: client.env.AOC_SESSION
    })
    const lastMessages = new Map<string, Message>()

    async function postMessage(client: Client, channels: string[]) {
      const leaderboard = await aoc.getLeaderboard(2024, 1776951, true)

      const [lastStarTs, lastStarUser] = leaderboard.reduce<[number, string]>(
        ([lastTs, lastUser], user) => [
          Math.max(lastTs, user.last_star_ts),
          user.last_star_ts > lastTs ? user.name : lastUser
        ],
        [0, 'Noone']
      )

      const digits = Math.floor(Math.log10(leaderboard[0].stars) + 1)

      const rows = leaderboard
        .filter((user) => user.local_score > 0)
        .map((user, idx) => [
          `${idx + 1})`,
          `${user.stars.toString().padStart(digits, ' ')}⭐`,
          user.name || 'Anon',
          `(${user.local_score}P)`
        ])

      const content = `Last Submission: <t:${lastStarTs}> by ${lastStarUser}\nLast Updated: <t:${Math.floor(Date.now() / 1000)}>\n${codeblock`${formatTable(rows)}`}`

      const options = {
        embeds: [
          {
            author: {
              name: 'Advent of Code Leaderboard',
              iconURL: 'https://adventofcode.com/favicon.png',
              url: LEADERBOARD_URL
            },
            description: content
          }
        ]
      } satisfies CreateMessageOptions

      for (const channelId of channels) {
        try {
          const channel = client.getChannel(channelId) as TextChannel
          const lastMessage = lastMessages.get(channelId)

          if (lastMessage) {
            if (lastMessage.embeds[0].description !== content)
              lastMessages.set(channelId, await lastMessage.edit(options))
          } else {
            const messages = await channel.getMessages({ limit: 1 })
            const initialMessage = messages[0]
            lastMessages.set(
              channelId,
              initialMessage || (await channel.createMessage(options))
            )
          }
        } catch (error) {
          client.logger.error(
            `Error posting message to channel ${channelId}:`,
            error
          )
        }
      }
    }
    client.once('ready', async () => {
      await postMessage(client, CHANNEL_IDS)
      setInterval(() => postMessage(client, CHANNEL_IDS), 1000 * 60 * 15)
    })
  }
})

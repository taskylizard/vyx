import { Lyricist } from '@execaman/lyricist'
import { ApplicationCommandOptionTypes } from 'oceanic.js'
import type { RainlinkPlayer } from 'rainlink'
import {
  Embed,
  type EmbedField,
  defineSlashCommand,
  formatDuration,
  truncateString
} from '#framework'

const DefaultPlaylist =
  'https://music.youtube.com/playlist?list=PLmZmfPnaEiQnqcrsC8prQuGP1ik_G8qtV'

export default defineSlashCommand({
  name: 'music',
  moduleId: 'MUSIC',
  description: 'Relax with soothing sounds!',
  guildOnly: true,
  subcommands: [
    {
      name: 'play',
      description: 'Play a song.',
      options: [
        {
          name: 'query',
          description: 'The song link or track.',
          type: ApplicationCommandOptionTypes.STRING
        }
      ],
      async run(ctx) {
        let query = ctx.options.getString('query')
        if (!query) query = DefaultPlaylist

        const channel = ctx.member!.voiceState?.channel
        if (!channel)
          return await ctx.reply(
            'You need to be in a voice channel to use this command!'
          )

        const player = await ctx.client.rainlink.create({
          guildId: ctx.interaction.guildID!,
          textId: ctx.interaction.channelID,
          voiceId: channel.id,
          shardId: 0,
          volume: 100
        })

        const result = await ctx.client.rainlink.search(query, {
          requester: ctx.interaction.member
        })

        if (!result.tracks.length) return await ctx.reply('No results found!')

        if (result.type === 'PLAYLIST')
          for (const track of result.tracks) player.queue.add(track)
        else player.queue.add(result.tracks[0])

        if (!player.playing || !player.paused) await player.play()

        const embed = new Embed()
          .setTitle(':radio: Queued')
          .setFooter({
            text: `Added by ${ctx.user.username}`,
            iconURL: ctx.user.avatarURL()
          })
          .setTimestamp()

        const noQueryMessage =
          query === DefaultPlaylist
            ? " as you didn't input anything."
            : undefined

        result.type !== 'PLAYLIST'
          ? embed
              .addField(
                'Duration',
                formatDuration(result.tracks[0].duration),
                true
              )
              .setDescription(`Queued: ${result.tracks[0].title}`)
              .setThumbnail(
                result.tracks[0].artworkUrl ??
                  `https://img.youtube.com/vi/${result.tracks[0]!.identifier}/maxresdefault.jpg`
              )
          : embed.setDescription(
              `Queued: ${result.tracks.length} tracks from ${result.playlistName}${noQueryMessage}`
            )

        await ctx.interaction.editOriginal({
          embeds: [embed]
        })
      }
    },
    {
      name: 'pause',
      description: 'Pause the music.',
      async run(ctx) {
        const player = ctx.client.rainlink.players.get(ctx.interaction.guildID!)

        if (!player)
          return await ctx.reply('Nothing is currently being played.')

        await player.pause()

        return await ctx.reply('Paused the player.')
      }
    },
    {
      name: 'resume',
      description: 'Resume the music.',
      async run(ctx) {
        const player = ctx.client.rainlink.players.get(ctx.interaction.guildID!)

        if (!player)
          return await ctx.reply('Nothing is currently being played.')

        await player.resume()

        return await ctx.reply('Resumed the player.')
      }
    },
    {
      name: 'replay',
      description: 'Replay the current song.',
      async run(ctx) {
        const player = ctx.client.rainlink.players.get(ctx.interaction.guildID!)

        if (!player)
          return await ctx.reply('Nothing is currently being played.')

        await player.seek(0)

        return await ctx.reply('Replaying!')
      }
    },
    {
      name: 'seek',
      description: 'Seek into position of current track.',
      options: [
        {
          name: 'time',
          description:
            'Set the position of the playing track. Example: 0:10 or 120:10.',
          type: ApplicationCommandOptionTypes.STRING,
          required: true
        }
      ],
      async run(ctx) {
        const time = ctx.options.getString('time', true)

        if (!/(^[0-9][\d]{0,3}):(0[0-9]{1}$|[1-5]{1}[0-9])/.test(time))
          return await ctx.reply('That seek format is invalid!', true)

        const [minute, second] = time.split(/:/)
        const min = Number(minute) * 60
        const sec = Number(second)
        const value = min + sec

        const player = ctx.client.rainlink.players.get(
          ctx.guild!.id
        ) as RainlinkPlayer

        if (value * 1000 >= player.queue.current!.duration! || value < 0)
          return await ctx.reply('That is way beyond the current track!', true)

        await player.seek(value * 1000)

        const songPosition = player.position

        let _duration

        if (songPosition < value * 1000) _duration = songPosition + value * 1000
        else _duration = value * 1000

        const duration = formatDuration(_duration)

        return await ctx.reply(`Now at ${duration}`)
      }
    },
    {
      name: 'volume',
      description: 'Adjusts the volume.',
      options: [
        {
          name: 'amount',
          description: 'The amount of volume to set the bot to.',
          type: ApplicationCommandOptionTypes.NUMBER,
          required: true
        }
      ],
      async run(ctx) {
        const value = ctx.options.getNumber('amount', true)
        if (value && isNaN(+value))
          return await ctx.reply('That number looks to be invalid.', true)
        const player = ctx.client.rainlink.players.get(
          ctx.interaction.guild!.id
        ) as RainlinkPlayer

        if (Number(value) <= 0 || Number(value) > 100)
          return await ctx.reply('The volume can only be from 0 to 100.')

        await player.setVolume(Number(value))

        ctx.wsl(ctx.guild!.id)?.send(
          JSON.stringify({
            op: 'playerVolume',
            guild: ctx.guild!.id,
            volume: player.volume
          })
        )

        return ctx.reply(`Set volume to ${value}%.`)
      }
    },
    {
      name: 'skip',
      description: 'Skips the current song.',
      async run(ctx) {
        const player = ctx.client.rainlink.players.get(
          ctx.guild!.id
        ) as RainlinkPlayer

        if (player.queue.size === 0 && player.data.get('autoplay') !== true) {
          return await ctx.reply("There's nothing to skip, its all crickets.")
        }

        await player.skip()

        return await ctx.reply('Skipped this track!')
      }
    },
    {
      name: 'nowplaying',
      description: 'Display the song currently playing.',
      async run(ctx) {
        const player = ctx.client.rainlink.players.get(ctx.interaction.guildID!)

        if (!player) return await ctx.reply('Nothing is currently playing.')

        const song = player.queue.current
        const position = player.position
        const currentDuration = formatDuration(position)
        const totalDuration = formatDuration(song!.duration)
        const thumbnail =
          song?.artworkUrl ??
          `https://img.youtube.com/vi/${song!.identifier}/maxresdefault.jpg`
        const part = Math.floor((position / song!.duration!) * 30)

        const fieldDataGlobal: EmbedField[] = [
          {
            name: 'Author',
            value: song!.author,
            inline: true
          },
          {
            name: 'Duration',
            value: formatDuration(song!.duration),
            inline: true
          },
          {
            name: 'Volume',
            value: `${player.volume}%`,
            inline: true
          },
          {
            name: `Current duration: ${currentDuration} / ${totalDuration}`,
            value: `\`\`\`🔴 | ${`${'─'.repeat(part)}🎶${'─'.repeat(30 - part)}`}\`\`\``,
            inline: false
          }
        ]

        const embedded = new Embed()
          .setTitle(':headphones: Now playing')
          .setDescription(`**[${song?.title}](${song?.uri})**`)
          .setThumbnail(thumbnail)
          .addFields(fieldDataGlobal)
          .setTimestamp()

        return await ctx.reply([embedded])
      }
    },
    {
      name: 'lyrics',
      description: 'Display the lyrics of the current song or search.',
      options: [
        {
          name: 'search',
          description: 'The song to search for.',
          type: ApplicationCommandOptionTypes.STRING
        }
      ],
      async run(ctx) {
        const lyrics = new Lyricist({
          plugins: [],
          saveLastResult: false
        })

        let result = null
        let search = ctx.options.getString('search')
        const player = ctx.client.rainlink.players.get(String(ctx.guild?.id))

        const current = player?.queue.current

        if (
          !search &&
          typeof current === 'undefined' &&
          typeof current !== 'object'
        ) {
          return await ctx.reply(
            "You're neither in a voice channel which is playing a song, nor you passed the `query` option.",
            true
          )
        }

        search = search ?? current!.title

        try {
          result = await lyrics.fetch(search, 5)
          if (!result)
            return await ctx.reply('Could not find lyrics for that song!')
        } catch (error) {
          ctx.client.logger.error(
            `/music lyrics errored with search: "${search}:\n"`,
            error
          )
          return await ctx.reply('Oopsies! There was an error!')
        }

        const embed = new Embed()
          .setTitle(`📃 ${result.song?.title ?? search}`)
          .setDescription(
            result.lyrics.length > 4096
              ? truncateString(result.lyrics, 4095)
              : result.lyrics
          )
          .setTimestamp()

        return await ctx.reply([embed])
      }
    }
  ]
})

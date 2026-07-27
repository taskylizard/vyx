import type { Client, Message } from 'oceanic.js'
import { match } from 'ts-pattern'
import { expect, test, vi } from 'vite-plus/test'
import { jumbleReplayButton } from '../../src/jumble/components.ts'
import { handleJumbleMessage } from '../../src/jumble/discord.ts'
import type { JumbleImageRenderer } from '../../src/jumble/renderer.ts'
import type { JumbleService } from '../../src/jumble/service.ts'
import type { JumbleCandidate, JumbleKind, JumbleState } from '../../src/jumble/types.ts'

test('play again creates and attaches a new game message without editing the completed one', async () => {
  const state = jumbleState('track', false)
  const createMessage = vi.fn(async () => ({ id: 'new-message' }))
  const sendTyping = vi.fn(async () => undefined)
  const attachMessage = vi.fn(async () => state)
  const update = vi.fn(async () => undefined)
  const context = {
    app: {
      jumble: {
        attachMessage,
        getProfile: vi.fn(async () => 'tasky'),
        start: vi.fn(async () => ({ action: 'started', state }))
      },
      jumbleRenderer: {},
      logger: { warn: vi.fn() }
    },
    client: { rest: { channels: { createMessage, sendTyping } } },
    deferUpdate: vi.fn(async () => undefined),
    interaction: {
      appPermissions: { has: vi.fn(() => true) },
      channelID: 'channel-1',
      guildID: 'guild-1',
      message: { id: 'completed-message' },
      user: { id: 'user-1' }
    },
    params: { kind: 'track' },
    update
  }

  await jumbleReplayButton.execute(context as never)

  expect(context.deferUpdate).toHaveBeenCalledOnce()
  expect(sendTyping).toHaveBeenCalledWith('channel-1')
  expect(createMessage).toHaveBeenCalledWith(
    'channel-1',
    expect.objectContaining({ content: expect.stringContaining('**Track Jumble**') })
  )
  expect(attachMessage).toHaveBeenCalledWith('session-track', 'new-message')
  expect(update).not.toHaveBeenCalled()
})

test.each([
  ['artist', 'Björk', null, '<@winner> got it! It was **Björk**'],
  ['album', 'Homogenic', 'Björk', '<@winner> got it! It was **Homogenic** by Björk'],
  ['track', 'Jóga', 'Björk', '<@winner> got it! It was **Jóga** by Björk']
] satisfies ReadonlyArray<readonly [JumbleKind, string, string | null, string]>)(
  'replies to a winning %s guess with the revealed answer',
  async (kind, answer, artistName, expectedContent) => {
    const state = jumbleState(kind, true, answer, artistName)
    const createMessage = vi.fn(async () => ({}))
    const editMessage = vi.fn(async () => ({}))
    const createReaction = vi.fn(async () => undefined)
    const client = { rest: { channels: { createMessage, editMessage } } } as unknown as Client
    const message = {
      author: { bot: false, id: 'winner' },
      channelID: 'channel-1',
      content: answer,
      createReaction,
      guildID: 'guild-1',
      id: 'guess-message'
    } as unknown as Message
    const service = {
      activeForChannel: vi.fn(async () => state),
      submitGuess: vi.fn(async () => ({ action: 'won', state }))
    } as unknown as JumbleService

    const handled = await handleJumbleMessage(client, message, {
      service,
      renderer: {} as JumbleImageRenderer,
      idsFor: () => ({ giveUp: '', hint: '', replay: () => '', reshuffle: '', unblur: '' })
    })

    expect(handled).toBe(true)
    expect(editMessage).toHaveBeenCalledWith(
      'channel-1',
      'game-message',
      expect.objectContaining({ content: expect.stringContaining(`Answer: **${answer}**`) })
    )
    expect(createMessage).toHaveBeenCalledWith('channel-1', {
      allowedMentions: {
        everyone: false,
        repliedUser: false,
        roles: false,
        users: ['winner']
      },
      content: expectedContent,
      messageReference: {
        channelID: 'channel-1',
        failIfNotExists: false,
        guildID: 'guild-1',
        messageID: 'guess-message'
      }
    })
    expect(createReaction).toHaveBeenCalledWith('✅')
  }
)

test('does not send a winner reply for an incorrect guess', async () => {
  const state = jumbleState('track', false)
  const createMessage = vi.fn(async () => ({}))
  const createReaction = vi.fn(async () => undefined)
  const client = {
    rest: { channels: { createMessage, editMessage: vi.fn(async () => ({})) } }
  } as unknown as Client
  const message = {
    author: { bot: false, id: 'user-2' },
    channelID: 'channel-1',
    content: 'wrong',
    createReaction,
    guildID: 'guild-1',
    id: 'guess-message'
  } as unknown as Message
  const service = {
    activeForChannel: vi.fn(async () => state),
    submitGuess: vi.fn(async () => ({ action: 'incorrect', state }))
  } as unknown as JumbleService

  await handleJumbleMessage(client, message, {
    service,
    renderer: {} as JumbleImageRenderer,
    idsFor: () => ({
      giveUp: '',
      hint: '',
      replay: () => '',
      reshuffle: '',
      unblur: ''
    })
  })

  expect(createMessage).not.toHaveBeenCalled()
  expect(createReaction).toHaveBeenCalledWith('❌')
})

function jumbleState(
  kind: JumbleKind,
  ended: boolean,
  answer = match(kind)
    .with('artist', () => 'Björk')
    .with('album', () => 'Homogenic')
    .with('track', () => 'Jóga')
    .exhaustive(),
  artistName = match(kind)
    .with('artist', () => null)
    .with('album', 'track', () => 'Björk')
    .exhaustive()
): JumbleState {
  const candidate = match(kind)
    .returnType<JumbleCandidate>()
    .with('artist', () => ({ answer, kind: 'artist' }))
    .with('album', () => ({ answer, artistName: artistName ?? undefined, kind: 'album' }))
    .with('track', () => ({ answer, artistName: artistName ?? undefined, kind: 'track' }))
    .exhaustive()

  return {
    hints: [],
    session: {
      albumName: match(kind)
        .with('album', () => answer)
        .with('artist', 'track', () => null)
        .exhaustive(),
      answer,
      artistName,
      blurStage: 0,
      channelId: 'channel-1',
      endedAt: ended ? 2_000 : null,
      guildId: 'guild-1',
      id: `session-${kind}`,
      imageUrl: null,
      messageId: 'game-message',
      metadata: { candidate, hints: [], shuffledAnswer: 'SHUFFLED' },
      outcome: ended ? 'won' : null,
      reshuffleCount: 0,
      sourceUsername: 'tasky',
      startedAt: 1_000,
      starterUserId: 'user-1',
      kind
    }
  }
}

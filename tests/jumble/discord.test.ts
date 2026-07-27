import { ComponentTypes, type Client, type Message } from 'oceanic.js'
import { match } from 'ts-pattern'
import { expect, test, vi } from 'vite-plus/test'
import { jumbleReplayButton } from '../../src/jumble/components.ts'
import {
  createJumbleMessage,
  editJumbleMessage,
  handleJumbleMessage
} from '../../src/jumble/discord.ts'
import { buildJumbleReplayComponents } from '../../src/jumble/presentation.ts'
import type { JumbleImageRenderer } from '../../src/jumble/renderer.ts'
import type { JumbleService } from '../../src/jumble/service.ts'
import type { JumbleCandidate, JumbleKind, JumbleState } from '../../src/jumble/types.ts'

test('play again disables the completed button and uses the cached channel for the new game', async () => {
  const state = jumbleState('track', false)
  const cachedCreateMessage = vi.fn(async () => ({ id: 'new-message' }))
  const cachedSendTyping = vi.fn(async () => undefined)
  const restCreateMessage = vi.fn(async () => ({ id: 'rest-message' }))
  const restSendTyping = vi.fn(async () => undefined)
  const attachMessage = vi.fn(async () => state)
  const update = vi.fn(async (_payload: unknown) => undefined)
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
    client: {
      getChannel: vi.fn(() => ({
        createMessage: cachedCreateMessage,
        sendTyping: cachedSendTyping
      })),
      rest: {
        channels: { createMessage: restCreateMessage, sendTyping: restSendTyping }
      }
    },
    interaction: {
      appPermissions: { has: vi.fn(() => true) },
      channelID: 'channel-1',
      guildID: 'guild-1',
      member: { displayName: 'Tasky' },
      message: { id: 'completed-message' },
      user: { globalName: 'tasky', id: 'user-1', username: 'tasky' }
    },
    params: { kind: 'track' },
    update
  }

  await jumbleReplayButton.execute(context as never)

  expect(update).toHaveBeenCalledWith({
    components: [
      expect.objectContaining({
        components: [expect.objectContaining({ disabled: true, label: 'Tasky is playing!' })]
      })
    ]
  })
  expect(cachedSendTyping).toHaveBeenCalledOnce()
  expect(restSendTyping).not.toHaveBeenCalled()
  expect(cachedCreateMessage).toHaveBeenCalledWith(
    expect.objectContaining({ content: expect.stringContaining('**Track Jumble**') })
  )
  expect(restCreateMessage).not.toHaveBeenCalled()
  expect(attachMessage).toHaveBeenCalledWith('session-track', 'new-message')
  expect(update).toHaveBeenCalledOnce()
})

test('channel message creation falls back to REST when the channel is not cached', async () => {
  const createMessage = vi.fn(async () => ({ id: 'rest-message' }))
  const result = await createJumbleMessage(
    {
      getChannel: vi.fn(() => undefined),
      rest: { channels: { createMessage } }
    } as never,
    'channel-1',
    { content: 'hello' }
  )

  expect(createMessage).toHaveBeenCalledWith('channel-1', { content: 'hello' })
  expect(result.id).toBe('rest-message')
})

test('channel message creation falls back to REST after a cached send fails', async () => {
  const cachedCreateMessage = vi.fn(async () => Promise.reject(new Error('cache send failed')))
  const restCreateMessage = vi.fn(async () => ({ id: 'rest-message' }))
  const result = await createJumbleMessage(
    {
      getChannel: vi.fn(() => ({ createMessage: cachedCreateMessage })),
      rest: { channels: { createMessage: restCreateMessage } }
    } as never,
    'channel-1',
    { content: 'hello' }
  )

  expect(cachedCreateMessage).toHaveBeenCalledWith({ content: 'hello' })
  expect(restCreateMessage).toHaveBeenCalledWith('channel-1', { content: 'hello' })
  expect(result.id).toBe('rest-message')
})

test('channel message editing falls back to REST after a cached edit fails', async () => {
  const cachedEditMessage = vi.fn(() => Promise.reject(new Error('stale channel')))
  const restEditMessage = vi.fn(async () => ({}))

  await editJumbleMessage(
    {
      getChannel: vi.fn(() => ({ editMessage: cachedEditMessage })),
      rest: { channels: { editMessage: restEditMessage } }
    } as never,
    'channel-1',
    'message-1',
    { payload: { content: 'finished' } }
  )

  expect(cachedEditMessage).toHaveBeenCalledWith('message-1', { content: 'finished' })
  expect(restEditMessage).toHaveBeenCalledWith('channel-1', 'message-1', {
    content: 'finished'
  })
})

test('playing replay labels stay within Discord limits without splitting emoji', () => {
  const components = buildJumbleReplayComponents('jumble/replay/track', {
    status: 'playing',
    userDisplayName: '😀'.repeat(100)
  })
  const replay = components[0]?.components[0]

  expect(replay?.type).toBe(ComponentTypes.BUTTON)
  if (replay === undefined || !('label' in replay) || replay.label === undefined) {
    throw new Error('Expected a labeled replay button.')
  }
  expect(replay.label.length).toBeLessThanOrEqual(80)
  expect(replay.label).toMatch(/ is playing!$/u)
  expect(replay.label).not.toContain('\uFFFD')
})

test('a failed replay restores the button and expires the hidden game', async () => {
  const state = jumbleState('album', false)
  const createFailure = new Error('Discord unavailable')
  const expire = vi.fn(async () => ({ action: 'expired', state }))
  const update = vi.fn(async (_payload: unknown) => undefined)
  const context = {
    app: {
      jumble: {
        attachMessage: vi.fn(async () => state),
        expire,
        getProfile: vi.fn(async () => 'tasky'),
        start: vi.fn(async () => ({ action: 'started', state }))
      },
      jumbleRenderer: {},
      logger: { warn: vi.fn() }
    },
    client: {
      getChannel: vi.fn(() => ({
        createMessage: vi.fn(() => Promise.reject(createFailure)),
        sendTyping: vi.fn(async () => undefined)
      })),
      rest: {
        channels: {
          createMessage: vi.fn(() => Promise.reject(createFailure)),
          sendTyping: vi.fn(async () => undefined)
        }
      }
    },
    interaction: {
      appPermissions: { has: vi.fn(() => true) },
      channelID: 'channel-1',
      guildID: 'guild-1',
      member: null,
      message: { id: 'completed-message' },
      user: { globalName: 'Tasky', id: 'user-1', username: 'tasky' }
    },
    params: { kind: 'album' },
    update
  }

  await expect(jumbleReplayButton.execute(context as never)).rejects.toBe(createFailure)

  expect(expire).toHaveBeenCalledWith('session-album')
  expect(update).toHaveBeenCalledTimes(2)
  expect(update.mock.calls[1]?.[0]).toEqual({
    components: [
      expect.objectContaining({
        components: [expect.objectContaining({ label: 'Play again' })]
      })
    ]
  })
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
    const restCreateMessage = vi.fn(async () => ({}))
    const restEditMessage = vi.fn(async () => ({}))
    const createReaction = vi.fn(async () => undefined)
    const client = {
      getChannel: vi.fn(() => ({ createMessage, editMessage })),
      rest: {
        channels: { createMessage: restCreateMessage, editMessage: restEditMessage }
      }
    } as unknown as Client
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
      'game-message',
      expect.objectContaining({ content: expect.stringContaining(`Answer: **${answer}**`) })
    )
    expect(createMessage).toHaveBeenCalledWith({
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
    expect(restEditMessage).not.toHaveBeenCalled()
    expect(restCreateMessage).not.toHaveBeenCalled()
    expect(createReaction).toHaveBeenCalledWith('✅')
  }
)

test('does not send a winner reply for an incorrect guess', async () => {
  const state = jumbleState('track', false)
  const createMessage = vi.fn(async () => ({}))
  const createReaction = vi.fn(async () => undefined)
  const client = {
    getChannel: vi.fn(() => undefined),
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

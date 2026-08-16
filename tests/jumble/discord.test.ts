import { ComponentTypes, type Client, type Message } from 'oceanic.js'
import { match } from 'ts-pattern'
import { expect, test, vi } from 'vite-plus/test'
import {
  componentIds,
  jumbleReplayButton,
  jumbleStartSessionButton
} from '../../src/jumble/components.ts'
import { handleJumbleMessage } from '../../src/jumble/discord.ts'
import { buildJumblePayload, buildJumbleReplayComponents } from '../../src/jumble/presentation.ts'
import type { JumbleImageRenderer } from '../../src/jumble/renderer.ts'
import type { JumbleService } from '../../src/jumble/service.ts'
import type { JumbleCandidate, JumbleKind, JumbleState } from '../../src/jumble/types.ts'
import { partialFixture } from '../fixtures/partial.ts'

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
      message: { components: [], id: 'completed-message' },
      user: { globalName: 'tasky', id: 'user-1', username: 'tasky' }
    },
    params: { kind: 'track' },
    update
  }

  await jumbleReplayButton.execute(partialFixture(context))

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

test('solved standalone games offer a continuous session with the required subtext', () => {
  const state = jumbleState('track', true)
  const payload = buildJumblePayload(state, { componentIds: componentIds(state.session.id) })

  expect(payload.components).toEqual([
    expect.objectContaining({
      components: [
        expect.objectContaining({ label: 'Play again' }),
        expect.objectContaining({ label: 'Start session' })
      ]
    })
  ])
  expect(payload.content).toMatch(
    /-# Start a session to keep new Jumbles coming until inactivity or someone says "cancel"\.$/u
  )
})

test('start session disables the completed controls and sends the first continuous game', async () => {
  const completed = jumbleState('track', true)
  const next = continuousJumbleState('track', false)
  const createMessage = vi.fn(async () => ({ id: 'continuous-message' }))
  const sendTyping = vi.fn(async () => undefined)
  const attachMessage = vi.fn(async () => next)
  const startContinuousSession = vi.fn(async () => ({ action: 'started' as const, state: next }))
  const update = vi.fn(async (_payload: unknown) => undefined)
  const context = {
    app: {
      jumble: {
        attachMessage,
        expire: vi.fn(async () => ({ action: 'expired', state: next })),
        getState: vi.fn(async () => completed),
        startContinuousSession
      },
      jumbleRenderer: {},
      logger: { warn: vi.fn() }
    },
    client: {
      getChannel: vi.fn(() => ({ createMessage, sendTyping })),
      rest: {
        channels: {
          createMessage: vi.fn(async () => ({ id: 'rest-message' })),
          sendTyping: vi.fn(async () => undefined)
        }
      }
    },
    interaction: {
      appPermissions: { has: vi.fn(() => true) },
      channelID: 'channel-1',
      guildID: 'guild-1',
      member: { displayName: 'Tasky' },
      message: {
        components: buildJumbleReplayComponents(
          'jumble/replay/track',
          'jumble/session/session-track',
          { status: 'ready' }
        ),
        id: 'game-message'
      },
      user: { globalName: 'Tasky', id: 'button-user', username: 'tasky' }
    },
    params: { sessionId: 'session-track' },
    update
  }

  await jumbleStartSessionButton.execute(partialFixture(context))

  expect(startContinuousSession).toHaveBeenCalledWith('session-track')
  expect(update).toHaveBeenCalledWith({
    components: [
      expect.objectContaining({
        components: [expect.objectContaining({ disabled: true, label: 'Tasky started a session!' })]
      })
    ]
  })
  expect(createMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      components: [
        expect.objectContaining({
          components: expect.not.arrayContaining([expect.objectContaining({ label: 'Give up' })])
        })
      ],
      content: expect.stringMatching(/^-# Session mode keeps new Jumbles coming/mu)
    })
  )
  expect(attachMessage).toHaveBeenCalledWith('session-track', 'continuous-message')
})

test('playing replay labels stay within Discord limits without splitting emoji', () => {
  const components = buildJumbleReplayComponents('jumble/replay/track', undefined, {
    status: 'playing',
    userDisplayName: '😀'.repeat(100)
  })
  const replay = components[0].components[0]

  expect(replay.type).toBe(ComponentTypes.BUTTON)
  if (!('label' in replay) || replay.label === undefined) {
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
      member: { displayName: 'Tasky' },
      message: {
        components: buildJumbleReplayComponents(
          'jumble/replay/album',
          'jumble/session/session-album',
          { status: 'ready' }
        ),
        id: 'completed-message'
      },
      user: { globalName: 'Tasky', id: 'user-1', username: 'tasky' }
    },
    params: { kind: 'album' },
    update
  }

  await expect(jumbleReplayButton.execute(partialFixture(context))).rejects.toBe(createFailure)

  expect(expire).toHaveBeenCalledWith('session-album')
  expect(update).toHaveBeenCalledTimes(2)
  expect(update.mock.calls[1]?.[0]).toEqual({
    components: [
      expect.objectContaining({
        components: [
          expect.objectContaining({ label: 'Play again' }),
          expect.objectContaining({ label: 'Start session' })
        ]
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
    const client = partialFixture<Client>({
      getChannel: vi.fn(() => ({ createMessage, editMessage })),
      rest: {
        channels: { createMessage: restCreateMessage, editMessage: restEditMessage }
      }
    })
    const message = partialFixture<Message>({
      author: { bot: false, id: 'winner' },
      channelID: 'channel-1',
      content: answer,
      createReaction,
      guildID: 'guild-1',
      id: 'guess-message'
    })
    const service = partialFixture<JumbleService>({
      activeForChannel: vi.fn(async () => state),
      submitGuess: vi.fn(async () => ({ action: 'won', state }))
    })

    const handled = await handleJumbleMessage(client, message, {
      service,
      renderer: partialFixture<JumbleImageRenderer>({}),
      idsFor: () => ({
        giveUp: '',
        hint: '',
        replay: () => '',
        reshuffle: '',
        startSession: '',
        unblur: ''
      })
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

test('winning a continuous game automatically sends the next game', async () => {
  const active = continuousJumbleState('track', false)
  const completed = {
    ...continuousJumbleState('track', true),
    session: { ...continuousJumbleState('track', true).session, messageId: 'game-message' }
  }
  const next = {
    ...continuousJumbleState('track', false),
    session: { ...continuousJumbleState('track', false).session, id: 'next-session' }
  }
  const createMessage = vi
    .fn()
    .mockResolvedValueOnce({ id: 'winner-announcement' })
    .mockResolvedValueOnce({ id: 'next-message' })
  const editMessage = vi.fn(async () => ({}))
  const sendTyping = vi.fn(async () => undefined)
  const createReaction = vi.fn(async () => undefined)
  const attachMessage = vi.fn(async () => next)
  const continueContinuousSession = vi.fn(async () => ({ action: 'started' as const, state: next }))
  const client = partialFixture<Client>({
    getChannel: vi.fn(() => ({ createMessage, editMessage, sendTyping })),
    rest: {
      channels: {
        createMessage: vi.fn(async () => ({ id: 'rest-message' })),
        editMessage: vi.fn(async () => ({})),
        sendTyping: vi.fn(async () => undefined)
      }
    }
  })
  const message = partialFixture<Message>({
    author: { bot: false, id: 'winner' },
    channelID: 'channel-1',
    content: 'Jóga',
    createReaction,
    guildID: 'guild-1',
    id: 'guess-message'
  })
  const service = partialFixture<JumbleService>({
    activeForChannel: vi.fn(async () => active),
    attachMessage,
    continueContinuousSession,
    submitGuess: vi.fn(async () => ({ action: 'won' as const, state: completed }))
  })

  await handleJumbleMessage(client, message, {
    service,
    renderer: partialFixture<JumbleImageRenderer>({}),
    idsFor: (state) => componentIds(state.session.id)
  })

  expect(continueContinuousSession).toHaveBeenCalledWith('session-track')
  expect(createMessage).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({
      content: expect.stringMatching(/-# Session mode keeps new Jumbles coming/u)
    })
  )
  expect(attachMessage).toHaveBeenCalledWith('next-session', 'next-message')
  expect(sendTyping).toHaveBeenCalledOnce()
})

test('saying cancel stops a continuous game without recording a guess', async () => {
  const active = continuousJumbleState('album', false)
  const cancelled = {
    ...active,
    session: { ...active.session, endedAt: 2_000, outcome: 'cancelled' as const }
  }
  const editMessage = vi.fn(async () => ({}))
  const createReaction = vi.fn(async () => undefined)
  const submitGuess = vi.fn()
  const cancelContinuousSession = vi.fn(async () => ({
    action: 'cancelled' as const,
    state: cancelled
  }))
  const client = partialFixture<Client>({
    getChannel: vi.fn(() => ({ editMessage })),
    rest: {
      channels: {
        createMessage: vi.fn(async () => ({})),
        editMessage: vi.fn(async () => ({}))
      }
    }
  })
  const message = partialFixture<Message>({
    author: { bot: false, id: 'user-2' },
    channelID: 'channel-1',
    content: '  CANCEL  ',
    createReaction,
    guildID: 'guild-1',
    id: 'cancel-message'
  })
  const service = partialFixture<JumbleService>({
    activeForChannel: vi.fn(async () => active),
    cancelContinuousSession,
    submitGuess
  })

  await handleJumbleMessage(client, message, {
    service,
    renderer: partialFixture<JumbleImageRenderer>({}),
    idsFor: (state) => componentIds(state.session.id)
  })

  expect(cancelContinuousSession).toHaveBeenCalledWith('session-album')
  expect(submitGuess).not.toHaveBeenCalled()
  expect(editMessage).toHaveBeenCalledWith(
    'game-message',
    expect.objectContaining({
      content: expect.stringMatching(/-# The session ended because someone said "cancel"\.$/u)
    })
  )
  expect(createReaction).toHaveBeenCalledWith('🛑')
})

test('an expired continuous game says the session ended from inactivity', () => {
  const active = continuousJumbleState('artist', false)
  const expired = {
    ...active,
    session: { ...active.session, endedAt: 26_000, outcome: 'expired' as const }
  }
  const payload = buildJumblePayload(expired, { componentIds: componentIds(expired.session.id) })

  expect(payload.content).toMatch(/-# The session ended after inactivity\.$/u)
})

test('does not reply or react to an incorrect guess', async () => {
  const state = jumbleState('track', false)
  const createMessage = vi.fn(async () => ({}))
  const createReaction = vi.fn(async () => undefined)
  const client = partialFixture<Client>({
    getChannel: vi.fn(() => undefined),
    rest: { channels: { createMessage, editMessage: vi.fn(async () => ({})) } }
  })
  const message = partialFixture<Message>({
    author: { bot: false, id: 'user-2' },
    channelID: 'channel-1',
    content: 'wrong',
    createReaction,
    guildID: 'guild-1',
    id: 'guess-message'
  })
  const service = partialFixture<JumbleService>({
    activeForChannel: vi.fn(async () => state),
    submitGuess: vi.fn(async () => ({ action: 'incorrect', state }))
  })

  await handleJumbleMessage(client, message, {
    service,
    renderer: partialFixture<JumbleImageRenderer>({}),
    idsFor: () => ({
      giveUp: '',
      hint: '',
      replay: () => '',
      reshuffle: '',
      startSession: '',
      unblur: ''
    })
  })

  expect(createMessage).not.toHaveBeenCalled()
  expect(createReaction).not.toHaveBeenCalled()
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

function continuousJumbleState(kind: JumbleKind, ended: boolean): JumbleState {
  const state = jumbleState(kind, ended)
  return {
    ...state,
    session: {
      ...state.session,
      metadata: {
        ...state.session.metadata,
        continuousSession: { id: '12345678-1234-4234-8234-123456789abc' }
      }
    }
  }
}

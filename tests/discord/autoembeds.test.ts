import { Buffer } from 'node:buffer'
import { ButtonStyles, ComponentTypes, MessageFlags, type CreateMessageOptions } from 'oceanic.js'
import { afterEach, expect, test, vi } from 'vite-plus/test'
import {
  findAutoembedLinks,
  handleAutoembeds,
  instagramComponents,
  isAutoembedMessage,
  twitterComponents
} from '../../src/discord/autoembeds.ts'
import { resetInstagramResolutionStateForTests } from '../../src/discord/autoembeds/instagram.ts'

afterEach(() => {
  resetInstagramResolutionStateForTests()
  vi.unstubAllGlobals()
})

test('finds, rewrites, cleans, and deduplicates supported links', () => {
  expect(
    findAutoembedLinks(
      [
        'https://x.com/alyxia/status/123?ref=one',
        'https://www.instagram.com/p/example/.',
        'https://old.reddit.com/r/typescript/comments/example)',
        'https://x.com/alyxia/status/123?ref=one',
        'https://x.com/not-a-status',
        'https://reddit.com',
        'https://vxinstagram.com/reel/alternate/'
      ].join(' ')
    )
  ).toEqual([
    {
      rewritten: 'https://fixupx.com/alyxia/status/123?ref=one',
      service: { statusID: '123', type: 'twitter' },
      url: 'https://x.com/alyxia/status/123?ref=one'
    },
    {
      rewritten: 'https://vxinstagram.com/p/example/',
      service: { type: 'instagram' },
      url: 'https://www.instagram.com/p/example/'
    },
    {
      rewritten: 'https://rxddit.com/r/typescript/comments/example',
      service: { type: 'reddit' },
      url: 'https://old.reddit.com/r/typescript/comments/example'
    },
    {
      rewritten: 'https://rxddit.com',
      service: { type: 'reddit' },
      url: 'https://reddit.com'
    },
    {
      rewritten: 'https://vxinstagram.com/reel/alternate/',
      service: { type: 'instagram' },
      url: 'https://vxinstagram.com/reel/alternate/'
    }
  ])
})

test('identifies messages handled by autoembeds', () => {
  expect(isAutoembedMessage('https://x.com/alyxia/status/123')).toBe(true)
  expect(isAutoembedMessage('https://reddit.com/r/typescript -IGNORE')).toBe(false)
  expect(isAutoembedMessage('https://example.com/post')).toBe(false)
})

test('builds a Twitter Components V2 card using Discord attachments', () => {
  expect(
    twitterComponents(
      'https://x.com/alyxia/status/123',
      {
        account: {
          acct: 'alyxia@private.example',
          display_name: 'Alyxia_Test',
          fields: [{ name: 'PCF Label', value: 'automated' }],
          username: 'alyxia'
        },
        content: '<p>Hello &amp; welcome ||spoiler||</p>',
        created_at: '2026-07-12T12:00:00Z'
      },
      {
        avatarReference: 'attachment://twitter-avatar.png',
        mediaItems: [
          {
            description: 'image',
            media: { url: 'attachment://twitter-media-1.png' }
          }
        ]
      }
    )
  ).toEqual([
    {
      accentColor: 0x1da1f2,
      components: [
        {
          accessory: {
            media: { url: 'attachment://twitter-avatar.png' },
            type: ComponentTypes.THUMBNAIL
          },
          components: [
            {
              content:
                '## Alyxia\\_Test\n-# [@alyxia](https://x.com/alyxia) - automated account\nHello & welcome | |spoiler| |',
              type: ComponentTypes.TEXT_DISPLAY
            }
          ],
          type: ComponentTypes.SECTION
        },
        {
          items: [
            {
              description: 'image',
              media: { url: 'attachment://twitter-media-1.png' }
            }
          ],
          type: ComponentTypes.MEDIA_GALLERY
        },
        {
          accessory: {
            label: 'View Post',
            style: ButtonStyles.LINK,
            type: ComponentTypes.BUTTON,
            url: 'https://x.com/alyxia/status/123'
          },
          components: [
            {
              content: '-# Twitter - <t:1783857600:F>',
              type: ComponentTypes.TEXT_DISPLAY
            }
          ],
          type: ComponentTypes.SECTION
        }
      ],
      type: ComponentTypes.CONTAINER
    }
  ])
})

test('downloads private Twitter media and uploads it to Discord', async () => {
  const createMessage = vi.fn(async (_channelID: string, _options: CreateMessageOptions) => ({}))
  const editMessage = vi.fn(async () => ({}))
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    switch (url) {
      case 'https://private.example/api/v1/statuses/123':
        return Response.json({
          account: {
            avatar: 'https://media.example/avatar.png',
            display_name: 'Alyxia',
            url: 'https://private.example/@alyxia',
            username: 'alyxia'
          },
          content: 'hello',
          media_attachments: [
            {
              description: 'post image',
              url: 'https://media.example/post.webp'
            }
          ]
        })
      case 'https://media.example/avatar.png':
        return new Response(Uint8Array.from([1, 2, 3]), {
          headers: { 'content-type': 'image/png' }
        })
      case 'https://media.example/post.webp':
        return new Response(Uint8Array.from([4, 5, 6]), {
          headers: { 'content-type': 'image/webp' }
        })
      default:
        throw new Error('unexpected fetch')
    }
  })
  vi.stubGlobal('fetch', fetchMock)

  const context = {
    client: { rest: { channels: { createMessage, editMessage } } },
    env: { FAUNA_URL: 'https://private.example' },
    logger: { info: vi.fn(), warn: vi.fn() }
  }
  const message = {
    channelID: 'channel',
    content: 'https://x.com/alyxia/status/123',
    flags: 0,
    guildID: 'guild',
    id: 'message'
  }

  await handleAutoembeds(context, message)

  const options = createMessage.mock.calls.at(0)?.[1]
  expect(options?.files).toEqual([
    { contents: Buffer.from([1, 2, 3]), name: 'twitter-avatar.png' },
    { contents: Buffer.from([4, 5, 6]), name: 'twitter-media-1.webp' }
  ])
  expect(JSON.stringify(options?.components)).toContain('attachment://twitter-avatar.png')
  expect(JSON.stringify(options?.components)).toContain('attachment://twitter-media-1.webp')
  expect(JSON.stringify(options?.components)).not.toContain('private.example')
  expect(JSON.stringify(options?.components)).not.toContain('media.example')
})

test('builds a rich Instagram card', () => {
  const components = instagramComponents(
    'https://instagram.com/p/AbC_123/',
    {
      caption: { text: 'A *caption* with ||spoilers||' },
      clips_metadata: {
        music_info: {
          music_asset_info: {
            display_artist: 'Artist_Name',
            title: 'Song'
          }
        }
      },
      coauthor_producers: [{ username: 'friend' }],
      comment_count: 456,
      like_count: 12_345,
      taken_at: 1_783_857_600,
      user: {
        full_name: 'Alyxia_Test',
        is_verified: true,
        profile_pic_url: 'https://cdn.example/avatar.jpg',
        username: 'alyxia'
      }
    },
    {
      mediaItems: [{ media: { url: 'attachment://AbC_123-1.jpg' } }]
    },
    'sharer'
  )
  const rendered = JSON.stringify(components)

  expect(rendered).toContain('Alyxia\\\\_Test ✓')
  expect(rendered).toContain('instagram.com/friend')
  expect(rendered).toContain('♫ Artist\\\\_Name — Song')
  expect(rendered).toContain('A ∗caption∗ with | |spoilers| |')
  expect(rendered).toContain('♥ 12.3K')
  expect(rendered).toContain('💬 456')
  expect(rendered).toContain('instagram.com/sharer')
  expect(rendered).toContain('attachment://AbC_123-1.jpg')
})

test('fetches rich Instagram data and gives remote carousel media to Discord', async () => {
  const createMessage = vi.fn(async (_channelID: string, _options: CreateMessageOptions) => ({}))
  const editMessage = vi.fn(async () => ({}))
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    )
    if (
      url.hostname === 'www.instagram.com' &&
      url.searchParams.get('doc_id') === '26130443479876713'
    ) {
      return Response.json({
        data: {
          xdt_api__v1__media__shortcode__web_info: {
            items: [
              {
                caption: { text: 'Carousel caption' },
                carousel_media: [
                  {
                    image_versions2: {
                      candidates: [{ url: 'https://cdn.example/image.jpg' }]
                    },
                    media_type: 1
                  },
                  {
                    media_type: 2,
                    video_versions: [{ url: 'https://cdn.example/video.mp4' }]
                  }
                ],
                clips_metadata: {
                  music_info: {
                    music_asset_info: { display_artist: 'Artist', title: 'Song' }
                  }
                },
                coauthor_producers: [{ username: 'friend' }],
                comment_count: 20,
                like_count: 1_500,
                media_type: 8,
                taken_at: 1_783_857_600,
                user: {
                  full_name: 'Alyxia',
                  is_verified: true,
                  profile_pic_url: 'https://cdn.example/avatar.jpg',
                  username: 'alyxia'
                }
              }
            ]
          }
        }
      })
    }
    if (
      url.hostname === 'www.instagram.com' &&
      url.searchParams.get('doc_id') === '9545140138880336'
    ) {
      return Response.json({
        data: {
          xdt_get_relationship_for_shid_logged_out: {
            sender: { username: 'sharer' }
          }
        }
      })
    }
    throw new Error(`unexpected fetch: ${url.href}`)
  })
  vi.stubGlobal('fetch', fetchMock)

  const context = {
    client: { rest: { channels: { createMessage, editMessage } } },
    env: {},
    logger: { info: vi.fn(), warn: vi.fn() }
  }
  const message = {
    channelID: 'channel',
    content: 'https://www.instagram.com/p/AbC_123/?igsh=share-token',
    flags: 0,
    guildID: 'guild',
    id: 'message'
  }

  await handleAutoembeds(context, message)

  const options = createMessage.mock.calls.at(0)?.[1]
  expect(options?.flags).toBe(MessageFlags.IS_COMPONENTS_V2)
  expect(options?.files).toBeUndefined()
  const rendered = JSON.stringify(options?.components)
  expect(rendered).toContain('Carousel caption')
  expect(rendered).toContain('https://cdn.example/image.jpg')
  expect(rendered).toContain('https://cdn.example/video.mp4')
  expect(rendered).toContain('Shared by')
  expect(rendered).toContain('https://instagram.com/p/AbC_123/')
  expect(rendered).not.toContain('share-token')
})

test('uses the vendored Instagram-native strategy after rich lookup rate limits', async () => {
  const createMessage = vi.fn(async (_channelID: string, _options: CreateMessageOptions) => ({}))
  const editMessage = vi.fn(async () => ({}))
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    )
    if (
      url.hostname === 'www.instagram.com' &&
      url.searchParams.get('doc_id') === '26130443479876713'
    ) {
      return new Response('rate limited', { status: 401 })
    }
    if (url.hostname === 'i.instagram.com' && url.pathname === '/api/v1/oembed/') {
      return Response.json({ media_id: '123' })
    }
    if (url.hostname === 'i.instagram.com' && url.pathname === '/api/v1/media/123/info/') {
      return Response.json({
        items: [
          {
            video_versions: [{ height: 1_920, url: 'https://cdn.example/native.mp4', width: 1_080 }]
          }
        ]
      })
    }
    if (url.href === 'https://cdn.example/native.mp4') {
      return new Response(Uint8Array.from([1, 2, 3]), {
        headers: { 'content-type': 'video/mp4' }
      })
    }
    throw new Error(`unexpected fetch: ${url.href}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  const info = vi.fn()
  const context = {
    client: { rest: { channels: { createMessage, editMessage } } },
    env: {},
    logger: { info, warn: vi.fn() }
  }
  const message = {
    channelID: 'channel',
    content: 'https://instagram.com/reel/native-fallback/',
    flags: 0,
    guildID: 'guild',
    id: 'message'
  }

  await handleAutoembeds(context, message)

  const options = createMessage.mock.calls.at(0)?.[1]
  expect(options?.files).toEqual([
    { contents: Buffer.from([1, 2, 3]), name: 'instagram-media-1.mp4' }
  ])
  expect(JSON.stringify(options?.components)).toContain('attachment://instagram-media-1.mp4')
  expect(JSON.stringify(options?.components)).not.toContain('cdn.example')
  expect(info).toHaveBeenCalledWith('instagram autoembed resolved via fallback', {
    strategy: 'native'
  })
})

test('downloads and uploads SnapSave media after native resolution fails', async () => {
  const createMessage = vi.fn(async (_channelID: string, _options: CreateMessageOptions) => ({}))
  const editMessage = vi.fn(async () => ({}))
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    )
    if (url.hostname === 'snapsave.app' && url.pathname === '/action.php') {
      return new Response(
        encodeSnapSaveResponse(`
          <div class="download-items">
            <div class="download-items__thumb">
              <img src="https://cdn.example/poster.jpg">
            </div>
            <div class="download-items__btn">
              <a href="https://cdn.example/v2"><span>Download Video</span></a>
            </div>
          </div>
        `)
      )
    }
    if (url.href === 'https://cdn.example/v2') {
      return new Response(Uint8Array.from([4, 5, 6]), {
        headers: {
          'content-disposition': 'attachment; filename=snapsave-video.mp4',
          'content-type': 'application/octet-stream'
        }
      })
    }
    return new Response('unavailable', { status: 404 })
  })
  vi.stubGlobal('fetch', fetchMock)
  const info = vi.fn()
  const context = {
    client: { rest: { channels: { createMessage, editMessage } } },
    env: {},
    logger: { info, warn: vi.fn() }
  }
  const message = {
    channelID: 'channel',
    content: 'https://instagram.com/reel/snapsave-fallback/',
    flags: 0,
    guildID: 'guild',
    id: 'message'
  }

  await handleAutoembeds(context, message)

  const options = createMessage.mock.calls.at(0)?.[1]
  expect(options?.files).toEqual([
    { contents: Buffer.from([4, 5, 6]), name: 'instagram-media-1.mp4' }
  ])
  expect(JSON.stringify(options?.components)).toContain('attachment://instagram-media-1.mp4')
  expect(JSON.stringify(options?.components)).not.toContain('cdn.example')
  expect(
    fetchMock.mock.calls.some(([input]) => {
      const requestedURL =
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      return requestedURL.includes('cdn.example')
    })
  ).toBe(true)
  expect(info).toHaveBeenCalledWith('instagram autoembed resolved via fallback', {
    strategy: 'snapsave'
  })
})

test('uses the rewritten link when resolved Instagram media cannot be downloaded', async () => {
  const createMessage = vi.fn(async (_channelID: string, _options: CreateMessageOptions) => ({}))
  const editMessage = vi.fn(async () => ({}))
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    )
    if (
      url.hostname === 'www.instagram.com' &&
      url.searchParams.get('doc_id') === '26130443479876713'
    ) {
      return new Response('rate limited', { status: 401 })
    }
    if (url.hostname === 'i.instagram.com' && url.pathname === '/api/v1/oembed/') {
      return Response.json({ media_id: '123' })
    }
    if (url.hostname === 'i.instagram.com' && url.pathname === '/api/v1/media/123/info/') {
      return Response.json({
        items: [
          {
            video_versions: [
              { height: 1_920, url: 'https://cdn.example/unavailable.mp4', width: 1_080 }
            ]
          }
        ]
      })
    }
    if (url.href === 'https://cdn.example/unavailable.mp4') {
      return new Response('unavailable', { status: 503 })
    }
    throw new Error(`unexpected fetch: ${url.href}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  const warn = vi.fn()
  const context = {
    client: { rest: { channels: { createMessage, editMessage } } },
    env: {},
    logger: { info: vi.fn(), warn }
  }
  const message = {
    channelID: 'channel',
    content: 'https://instagram.com/reel/unavailable/',
    flags: 0,
    guildID: 'guild',
    id: 'message'
  }

  await handleAutoembeds(context, message)

  expect(createMessage).toHaveBeenCalledTimes(1)
  expect(createMessage).toHaveBeenCalledWith(
    'channel',
    expect.objectContaining({ content: 'https://vxinstagram.com/reel/unavailable/' })
  )
  expect(warn).toHaveBeenCalledWith('failed to download autoembed asset', {
    error: expect.any(Error),
    filenameBase: 'instagram-media-1'
  })
  expect(warn).toHaveBeenCalledWith('component autoembed failed', {
    error: expect.any(Error),
    service: 'instagram'
  })
})

test('falls back to a rewritten Instagram link when public lookup fails', async () => {
  const createMessage = vi.fn(async (_channelID: string, _options: CreateMessageOptions) => ({}))
  const editMessage = vi.fn(async () => ({}))
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('rate limited', { status: 429 }))
  )

  const context = {
    client: { rest: { channels: { createMessage, editMessage } } },
    env: {},
    logger: { info: vi.fn(), warn: vi.fn() }
  }
  const message = {
    channelID: 'channel',
    content: 'https://www.instagram.com/reel/example/',
    flags: 0,
    guildID: 'guild',
    id: 'message'
  }

  await handleAutoembeds(context, message)

  expect(createMessage).toHaveBeenCalledWith(
    'channel',
    expect.objectContaining({ content: 'https://vxinstagram.com/reel/example/' })
  )
})

test('falls back to a rewritten Twitter link when component lookup fails', async () => {
  const createMessage = vi.fn(async () => ({}))
  const editMessage = vi.fn(async () => ({}))
  const warn = vi.fn()
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('unavailable', { status: 503 }))
  )

  const context = {
    client: { rest: { channels: { createMessage, editMessage } } },
    env: { FAUNA_URL: 'https://private.example' },
    logger: { info: vi.fn(), warn }
  }
  const message = {
    channelID: 'channel',
    content: 'https://x.com/alyxia/status/123',
    flags: 0,
    guildID: 'guild',
    id: 'message'
  }

  await handleAutoembeds(context, message)

  expect(createMessage).toHaveBeenCalledWith(
    'channel',
    expect.objectContaining({ content: 'https://fixupx.com/alyxia/status/123' })
  )
  expect(warn).toHaveBeenCalledWith('component autoembed failed', {
    error: expect.any(Error),
    service: 'twitter'
  })
})

test('replies with rewritten links and suppresses the original embed', async () => {
  const createMessage = vi.fn(async () => ({}))
  const editMessage = vi.fn(async () => ({}))
  const context = {
    client: { rest: { channels: { createMessage, editMessage } } },
    env: {},
    logger: { info: vi.fn(), warn: vi.fn() }
  }
  const message = {
    channelID: 'channel',
    content: 'https://www.reddit.com/r/typescript/comments/example/',
    flags: 0,
    guildID: 'guild',
    id: 'message'
  }

  await handleAutoembeds(context, message)

  expect(createMessage).toHaveBeenCalledWith('channel', {
    allowedMentions: {
      everyone: false,
      repliedUser: false,
      roles: false,
      users: false
    },
    content: 'https://rxddit.com/r/typescript/comments/example/',
    messageReference: {
      channelID: 'channel',
      failIfNotExists: false,
      guildID: 'guild',
      messageID: 'message'
    }
  })
  expect(editMessage).toHaveBeenCalledWith('channel', 'message', {
    flags: MessageFlags.SUPPRESS_EMBEDS
  })
})

test('silently ignores missing permission errors while suppressing embeds', async () => {
  const createMessage = vi.fn(async () => ({}))
  const editMessage = vi.fn(async () => {
    throw Object.assign(new Error('missing permissions'), { code: 50_013, status: 403 })
  })
  const warn = vi.fn()
  const context = {
    client: { rest: { channels: { createMessage, editMessage } } },
    env: {},
    logger: { info: vi.fn(), warn }
  }
  const message = {
    channelID: 'channel',
    content: 'https://reddit.com/r/typescript/comments/example/',
    flags: 0,
    guildID: 'guild',
    id: 'message'
  }

  await handleAutoembeds(context, message)

  expect(createMessage).toHaveBeenCalledOnce()
  expect(editMessage).toHaveBeenCalledOnce()
  expect(warn).not.toHaveBeenCalled()
})

test('honors -ignore without sending or suppressing anything', async () => {
  const createMessage = vi.fn(async () => ({}))
  const editMessage = vi.fn(async () => ({}))
  const context = {
    client: { rest: { channels: { createMessage, editMessage } } },
    env: {},
    logger: { info: vi.fn(), warn: vi.fn() }
  }
  const message = {
    channelID: 'channel',
    content: 'https://reddit.com/r/typescript -IGNORE',
    flags: 0,
    guildID: 'guild',
    id: 'message'
  }

  await handleAutoembeds(context, message)

  expect(createMessage).not.toHaveBeenCalled()
  expect(editMessage).not.toHaveBeenCalled()
})

function encodeSnapSaveResponse(html: string): string {
  const decoded = `getElementById("download-section").innerHTML = "${html.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"; document.getElementById("inputData").remove(); `
  const alphabet = 'abcdefghijk'
  const encoded = Array.from(
    decoded,
    (character) =>
      `${String(character.codePointAt(0)).replace(/\d/gu, (digit) => alphabet[Number(digit)] ?? '')}k`
  ).join('')
  return `decodeURIComponent(escape(r))}("${encoded}","","${alphabet}","0","10",""))`
}

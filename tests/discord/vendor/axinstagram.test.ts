import { expect, test, vi } from 'vite-plus/test'
import {
  biggest,
  extractFromGQL,
  resolveAxInstagramMedia,
  smallest
} from '../../../src/discord/autoembeds/vendor/axinstagram.ts'

const candidates = [
  { height: 150, url: 'small.jpg', width: 150 },
  { height: 1_920, url: 'large.jpg', width: 1_080 },
  { height: 640, url: 'medium.jpg', width: 640 }
]

test('selects the largest and smallest Instagram media candidates', () => {
  expect(biggest(candidates)).toBe('large.jpg')
  expect(smallest(candidates)).toBe('small.jpg')
})

test('extracts a GraphQL video post', () => {
  expect(
    extractFromGQL({
      gql_data: { shortcode_media: { video_url: 'https://cdn.example/video.mp4' } }
    })
  ).toEqual({ videoUrl: 'https://cdn.example/video.mp4' })
})

test('extracts mixed GraphQL carousel media', () => {
  expect(
    extractFromGQL({
      gql_data: {
        xdt_shortcode_media: {
          edge_sidecar_to_children: {
            edges: [
              { node: { display_url: 'https://cdn.example/image.jpg' } },
              {
                node: {
                  display_url: 'https://cdn.example/poster.jpg',
                  video_url: 'https://cdn.example/video.mp4'
                }
              }
            ]
          }
        }
      }
    })
  ).toEqual({
    isPhoto: true,
    photos: [
      {
        full: 'https://cdn.example/image.jpg',
        isVideo: undefined,
        thumb: 'https://cdn.example/image.jpg'
      },
      {
        full: 'https://cdn.example/video.mp4',
        isVideo: true,
        thumb: 'https://cdn.example/poster.jpg'
      }
    ]
  })
})

test('falls through to the web GraphQL strategy when embed metadata is unavailable', async () => {
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    )
    if (url.hostname === 'i.instagram.com') {
      return new Response('unavailable', { status: 404 })
    }
    if (url.pathname.endsWith('/embed/captioned/') || url.pathname.endsWith('/embed/')) {
      return new Response('unavailable', { status: 404 })
    }
    if (url.pathname === '/p/example/' && init?.method !== 'POST') {
      return new Response('<html></html>')
    }
    if (url.pathname === '/graphql/query' && init?.method === 'POST') {
      return Response.json({
        data: { xdt_shortcode_media: { video_url: 'https://cdn.example/video.mp4' } }
      })
    }
    throw new Error(`unexpected fetch: ${url.href}`)
  })
  vi.stubGlobal('fetch', fetchMock)

  try {
    await expect(resolveAxInstagramMedia('https://instagram.com/p/example/')).resolves.toEqual({
      items: [{ thumbnail: undefined, type: 'video', url: 'https://cdn.example/video.mp4' }]
    })
  } finally {
    vi.unstubAllGlobals()
  }
})

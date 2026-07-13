import { expect, test } from 'vite-plus/test'
import {
  biggest,
  extractFromGQL,
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

import { expect, test } from 'vite-plus/test'
import { chooseArtist, parseRecording } from '../../src/jumble/musicbrainz-parser.ts'

test('chooses an exact MusicBrainz artist match before score order', () => {
  expect(
    chooseArtist(
      {
        artists: [
          { id: 'other', name: 'Björk tribute', score: 100 },
          { country: 'IS', id: 'artist', name: 'Björk', score: 80 }
        ]
      },
      'Björk'
    )
  ).toEqual({
    countryCode: 'IS',
    mbid: 'artist',
    tags: undefined,
    type: undefined,
    disambiguation: undefined,
    startDate: undefined,
    endDate: undefined
  })
})

test('parses recording metadata from its preferred dated release', () => {
  expect(
    parseRecording({
      disambiguation: 'studio recording',
      first: 'ignored',
      id: 'recording',
      length: '240000',
      releases: [
        {
          date: '2000-01-01',
          id: 'live-release',
          status: 'Live',
          title: 'Live Album'
        },
        {
          date: '1997-09-20',
          id: 'official-release',
          status: 'Official',
          title: 'Homogenic'
        }
      ]
    })
  ).toMatchObject({
    albumName: 'Homogenic',
    disambiguation: 'studio recording',
    durationMs: 240_000,
    mbid: 'recording',
    releaseDate: '1997-09-20'
  })
})

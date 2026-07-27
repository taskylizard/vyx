import { bench, describe } from 'vite-plus/test'
import { answerMatchesAny } from '../../src/jumble/answer.ts'

const acceptedAnswers = [
  'サニーボーイ・ラプソディ',
  { value: 'Sonny Boy Rhapsody', source: 'transliteration' as const },
  { value: 'Sonny Boy Rapsodii', source: 'musicbrainz' as const },
  { value: 'サニー・ボーイ・ラプソディ', source: 'discogs' as const }
]

describe('Jumble answer matching', () => {
  bench('matches a bounded alias set with typo tolerance', () => {
    answerMatchesAny(acceptedAnswers, 'Sonny Boy Rapsody')
  })
})

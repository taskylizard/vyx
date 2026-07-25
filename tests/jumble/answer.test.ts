import { expect, test } from 'vite-plus/test'
import {
  answerMatches,
  levenshteinDistance,
  normalizeAnswer,
  removeEditionSuffix,
  shuffleCharacters
} from '../../src/jumble/answer.ts'

test('normalizes punctuation, diacritics, and edition variants in music answers', () => {
  expect(normalizeAnswer('Björk')).toBe('bjork')
  expect(normalizeAnswer('Dazey & the Scouts')).toBe('dazeyandthescouts')
  expect(answerMatches("Guns N' Roses", 'Guns and Roses')).toBe(true)
  expect(answerMatches('Abbey Road', 'Abbey Road (Remastered)')).toBe(true)
  expect(answerMatches('Sufjan Stevens', 'Suffjan Stevens')).toBe(true)
  expect(answerMatches('Yesterday', 'Tomorrow')).toBe(false)
})

test('removes repeated album edition suffixes', () => {
  expect(removeEditionSuffix('Album Name (Live) (Remastered)')).toBe('Album Name')
  expect(removeEditionSuffix('The Album - The 2nd Mini Album')).toBe('The Album')
})

test('computes bounded edit distance and can deterministically scramble text', () => {
  expect(levenshteinDistance('kitten', 'sitting')).toBe(3)
  const indexes = [1, 0, 1, 0, 1, 0]
  expect(shuffleCharacters('AB CD', () => indexes.shift() ?? 0)).toBe('BA DC')
})

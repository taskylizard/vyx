import { expect, test } from 'vite-plus/test'
import { NotesService } from '../src/context.ts'

test('stores independent note snapshots for each user', () => {
  const notes = new NotesService()

  expect(notes.add('user-a', 'First')).toBe(1)
  expect(notes.add('user-a', 'Second')).toBe(2)
  expect(notes.add('user-b', 'Other')).toBe(1)
  expect(notes.list('user-a')).toEqual(['First', 'Second'])
  expect(notes.list('user-b')).toEqual(['Other'])
})

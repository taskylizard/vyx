import type { Client } from 'oceanic.js'

/** Services and application state available to every command invocation. */
export interface AppContext {
  client: Client
  notes: NotesService
}

/** A deliberately small service used to keep the command examples focused on rosepack. */
export class NotesService {
  readonly #notes = new Map<string, string[]>()

  /** Adds a note for a user and returns its position in their list. */
  add(userID: string, content: string): number {
    const notes = this.#notes.get(userID) ?? []
    notes.push(content)
    this.#notes.set(userID, notes)
    return notes.length
  }

  /** Returns a snapshot of the notes saved for a user. */
  list(userID: string): readonly string[] {
    return [...(this.#notes.get(userID) ?? [])]
  }
}

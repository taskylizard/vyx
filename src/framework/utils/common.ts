import { fileURLToPath } from 'node:url'
import {
  type AnyTextableChannel,
  type AnyThreadChannel,
  type Channel,
  type ChannelTypes,
  Collection,
  type MessageTypes,
  TextableChannelTypes,
  type TextableChannels,
  ThreadChannelTypes,
  type ThreadChannels,
  UndeletableMessageTypes
} from 'oceanic.js'
import { dirname } from 'pathe'

/**
 * Imports a module and returns its default export.
 *
 * @param {string} path - The path to the module.
 * @returns {Promise<T>} The default export of the module.
 */
export async function importDefault<T>(path: string): Promise<T> {
  return (
    (await import(path).catch(console.error)) as {
      default: T
    }
  ).default
}

/**
 * Formats a duration in milliseconds into a human-readable string.
 *
 * @param {number | undefined} duration - The duration in
milliseconds.
 * @returns {string} The formatted duration string.
 */
export function formatDuration(duration: number | undefined): string {
  if (typeof duration === 'undefined') return '00:00'
  if (duration > 3600000000) return 'Live'

  let seconds: string | number = Number.parseInt(`${(duration / 1000) % 60}`)
  let minutes: string | number = Number.parseInt(
    `${(duration / (1000 * 60)) % 60}`
  )
  let hours: string | number = Number.parseInt(
    `${(duration / (1000 * 60 * 60)) % 24}`
  )

  hours = hours < 10 ? `0${hours}` : hours
  minutes = minutes < 10 ? `0${minutes}` : minutes
  seconds = seconds < 10 ? `0${seconds}` : seconds

  if (duration < 3600000) {
    return `${minutes}:${seconds}`
  }
  return `${hours}:${minutes}:${seconds}`
}

/**
 * Returns the directory name from a URL.
 *
 * @param {URL | string} url - The URL.
 * @returns {string} The directory name.
 */
export function getDirname(url: URL | string): string {
  return dirname(getFilename(url))
}

/**
 * Returns the file name from a URL.
 *
 * @param {URL | string} url - The URL.
 * @returns {string} The file name.
 */
export function getFilename(url: URL | string): string {
  return fileURLToPath(url)
}

/**
 * Truncates a string to a specified maximum length.
 *
 * @param {string} string - The string to truncate.
 * @param {number} maxLength - The maximum length.
 * @returns {string} The truncated string.
 */
export function truncateString(string: string, maxLength: number): string {
  return string.length > maxLength
    ? `${string.substring(0, maxLength)}…`
    : string
}

/**
 * Splits an array into chunks.
 *
 * @param {T[]} array - The array to split.
 * @param {number} chunkSize - The size of each chunk.
 * @returns {T[][]} The array of chunks.
 */
export function splitArray<T>(array: T[], chunkSize: number): T[][] {
  const _chunkSize = chunkSize - 1
  return array.reduce<T[][]>((resultArray, item, index) => {
    const chunkIndex = Math.floor(index / _chunkSize)
    resultArray[chunkIndex] ||= []
    resultArray[chunkIndex].push(item)
    return resultArray
  }, [])
}

export function createGuard<T, U extends T>(
  check: (maybe: T) => U | undefined
): (maybe: T) => maybe is U {
  return (maybe: T): maybe is U => check(maybe) !== undefined
}

export const isThreadChannel = createGuard<Channel, AnyThreadChannel>(
  (channel) =>
    isThreadChannelType(channel.type)
      ? (channel as AnyThreadChannel)
      : undefined
)

export const isThreadChannelType = createGuard<ChannelTypes, ThreadChannels>(
  (type) =>
    ThreadChannelTypes.includes(type as ThreadChannels)
      ? (type as ThreadChannels)
      : undefined
)

export const isTextableChannel = createGuard<Channel, AnyTextableChannel>(
  (channel) =>
    isTextableChannelType(channel.type)
      ? (channel as AnyTextableChannel)
      : undefined
)

export const isTextableChannelType = createGuard<
  ChannelTypes,
  TextableChannels
>((type) =>
  TextableChannelTypes.includes(type as TextableChannels)
    ? (type as TextableChannels)
    : undefined
)

export const isUndeletableMessageType = createGuard<
  MessageTypes,
  (typeof UndeletableMessageTypes)[number]
>((type) =>
  UndeletableMessageTypes.includes(
    type as (typeof UndeletableMessageTypes)[number]
  )
    ? (type as (typeof UndeletableMessageTypes)[number])
    : undefined
)

export const emojis = [
  '🎊',
  '🎉',
  '🎈',
  '🎇',
  '🎆',
  '🎅',
  '🎄',
  '🎁',
  '🎀',
  '🎃',
  '🕺',
  '👻',
  '🤖',
  '🧙',
  '🧚',
  '🧛',
  '🧜',
  '🧟',
  '💇',
  '🚶',
  '🏃',
  '💃',
  '🕴',
  '🗣',
  '👤',
  '👥',
  '🤺',
  '🏇',
  '⛷',
  '🏂',
  '🏌',
  '🏄',
  '🚣',
  '🏊',
  '⛹',
  '🏋',
  '🌺',
  '🏕',
  '🏖',
  '🏗',
  '🏘',
  '🏙',
  '🏚',
  '🏛',
  '🏜'
]

/**
 * Represents a failed operation with an error message.
 */
export type Error = {
  readonly ok: false
  readonly error: string
  readonly value?: undefined
}

/**
 * Represents a successful operation with a value.
 * @template T - The type of the success value
 */
export type Ok<T> = {
  readonly ok: true
  readonly error?: undefined
  readonly value: T
}

/**
 * A union type representing either a successful result with a value or a failed result with an error message.
 * @template T - The type of the success value
 */
export type Result<T> = Ok<T> | Error

/**
 * Creates a successful Result containing the provided value.
 *
 * @template T - The type of the success value
 * @param {T} value - The success value to wrap
 * @returns {Result<T>} A successful Result
 *
 * @example
 * // Creating a successful result containing a number
 * const successResult = ok(42);
 * // successResult is { ok: true, value: 42 }
 *
 * @example
 * // Creating a successful result containing an object
 * const user = { id: 1, name: "Alice" };
 * const userResult = ok(user);
 * // ^? { ok: true, value: { id: 1, name: "Alice" } }
 */
export function ok<T>(value: T): Result<T> {
  return { ok: true, value }
}

/**
 * Creates a failed Result containing the provided error message.
 *
 * @param {string} error - The error message
 * @returns {Error} A failed Result
 *
 * @example
 * // Creating a failed result with an error message
 * const failedResult = error("Something went wrong");
 * // ^? { ok: false, error: "Something went wrong" }
 */
export function error(error: string): Error {
  return { ok: false, error }
}

/**
 * Extracts the value from a successful Result or throws an Error if the Result is a failure.
 * This function should only be used within a coroutine function.
 *
 * @template T - The type of the success value
 * @param {Result<T>} result - The Result to unwrap
 * @returns {T} The success value
 * @throws {Error} If the Result is a failure
 *
 * @private
 * @example
 * // This function should only be used inside a coroutine
 * // See coroutine examples for proper usage
 */
function unwrap<T>(result: Result<T>): T {
  if (result.ok) {
    return result.value
  }

  throw new Error(result.error)
}

/**
 * Creates a function that safely handles a series of operations that return Results.
 * This allows writing sequential code that properly propagates errors.
 *
 * @template T - The type of the final success value
 * @param {function} fn - A function that takes an unwrap function and returns a Result
 * @returns {Result<T>} The final Result
 *
 * @example
 * // Define functions that return Results
 * function divide(a: number, b: number): Result<number> {
 *   if (b === 0) {
 *     return error("Cannot divide by zero");
 *   }
 *   return ok(a / b);
 * }
 *
 * function addOne(n: number): Result<number> {
 *   return ok(n + 1);
 * }
 *
 * // Use coroutine to chain operations
 * function calculateResult(a: number, b: number): Result<number> {
 *   return coroutine(unwrap => {
 *     // If divide returns an error, the coroutine will immediately return that error
 *     const divided = unwrap(divide(a, b));
 *
 *     // This line only executes if divide was successful
 *     const result = unwrap(addOne(divided));
 *
 *     return ok(result);
 *   });
 * }
 *
 * // Success case
 * const success = calculateResult(10, 2);
 * //^? { ok: true, value: 6 }
 *
 * // Failure case
 * const failure = calculateResult(10, 0);
 * // ^? { ok: false, error: "Cannot divide by zero" }
 */
export function coroutine<T>(
  fn: (unwrap: <U>(result: Result<U>) => U) => Result<T>
): Result<T> {
  try {
    return fn(unwrap)
  } catch (err) {
    return error(err instanceof Error ? err.message : String(err))
  }
}

/**
 * Example usage of the Result type pattern
 *
 * @example
 * // Example: User data processing
 *
 * // Define domain types
 * type User = { id: string, name: string };
 * type Post = { id: string, userId: string, content: string };
 *
 * // Functions that might fail
 * function fetchUser(id: string): Result<User> {
 *   // Simulating an API call that could fail
 *   if (id === "invalid") {
 *     return error("User not found");
 *   }
 *   return ok({ id, name: "Example User" });
 * }
 *
 * function fetchPosts(userId: string): Result<Post[]> {
 *   // Simulating another API call
 *   if (userId === "no-posts") {
 *     return error("Failed to fetch posts");
 *   }
 *   return ok([
 *     { id: "post1", userId, content: "Hello world" }
 *   ]);
 * }
 *
 * // Using coroutine to compose operations
 * function getUserWithPosts(userId: string): Result<{user: User, posts: Post[]}> {
 *   return coroutine(unwrap => {
 *     const user = unwrap(fetchUser(userId));
 *     const posts = unwrap(fetchPosts(user.id));
 *     return ok({ user, posts });
 *   });
 * }
 *
 * // Using the Result
 * const result = getUserWithPosts("user123");
 *
 * if (result.ok) {
 *   console.log(`Found user ${result.value.user.name} with ${result.value.posts.length} posts`);
 * } else {
 *   console.error(`Error: ${result.error}`);
 * }
 */

export class ComponentState<T> {
  private static stateMap = new Collection<string, unknown>()
  private readonly componentId: string

  /**
   * Creates a new component state instance
   * @param componentId - The unique ID of the component
   * @param initialState - The initial state (optional)
   */
  private constructor(componentId: string, initialState?: T) {
    this.componentId = componentId

    if (
      initialState !== undefined &&
      !ComponentState.stateMap.has(componentId)
    ) {
      ComponentState.stateMap.set(componentId, initialState)
    }
  }

  /**
   * Gets the current state
   * @returns The current state or undefined if not set
   */
  get(): T | undefined {
    return ComponentState.stateMap.get(this.componentId) as T | undefined
  }

  /**
   * Sets a new state
   * @param newState - The new state to set
   * @returns The updated state
   */
  set(newState: T): T {
    ComponentState.stateMap.set(this.componentId, newState)
    return newState
  }

  /**
   * Updates the state using a function
   * @param updateFn - A function that receives the current state and returns the new state
   * @returns The updated state
   */
  update(updateFn: (currentState: T | undefined) => T): T {
    const currentState = this.get()
    const newState = updateFn(currentState)
    return this.set(newState)
  }

  /**
   * Removes the state
   */
  remove(): void {
    ComponentState.stateMap.delete(this.componentId)
  }

  /**
   * Checks if state exists for this component
   * @returns True if state exists, false otherwise
   */
  exists(): boolean {
    return ComponentState.stateMap.has(this.componentId)
  }

  /**
   * Creates or retrieves a state instance for a component
   * @param componentId - The unique ID of the component
   * @param initialState - The initial state (optional)
   * @returns A ComponentState instance
   */
  static state<S>(componentId: string, initialState?: S): ComponentState<S> {
    return new ComponentState<S>(componentId, initialState)
  }
}

/**
 * Create or retrieve state for a component
 * @param componentId - The unique ID of the component
 * @param initialState - The initial state (optional)
 * @returns A ComponentState instance
 */
export function state<S>(
  componentId: string,
  initialState?: S
): ComponentState<S> {
  return ComponentState.state<S>(componentId, initialState)
}

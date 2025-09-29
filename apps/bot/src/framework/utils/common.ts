import { Collection } from 'oceanic.js'

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

export const colors = {
  DEFAULT: 0x000000,
  WHITE: 0xffffff,
  AQUA: 0x1abc9c,
  GREEN: 0x57f287,
  BLUE: 0x3498db,
  YELLOW: 0xfee75c,
  PURPLE: 0x9b59b6,
  LUMINOUS_VIVID_PINK: 0xe91e63,
  FUCHSIA: 0xeb459e,
  GOLD: 0xf1c40f,
  ORANGE: 0xe67e22,
  RED: 0xed4245,
  GREY: 0x95a5a6,
  NAVY: 0x34495e,
  DARK_AQUA: 0x11806a,
  DARK_GREEN: 0x1f8b4c,
  DARK_BLUE: 0x206694,
  DARK_PURPLE: 0x71368a,
  DARK_VIVID_PINK: 0xad1457,
  DARK_GOLD: 0xc27c0e,
  DARK_ORANGE: 0xa84300,
  DARK_RED: 0x992d22,
  DARK_GREY: 0x979c9f,
  DARKER_GREY: 0x7f8c8d,
  LIGHT_GREY: 0xbcc0c0,
  DARK_NAVY: 0x2c3e50,
  BLURPLE: 0x5865f2,
  GREYPLE: 0x99aab5,
  DARK_BUT_NOT_BLACK: 0x2c2f33,
  NOT_QUITE_BLACK: 0x23272a
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
 *   logger.info(`Found user ${result.value.user.name} with ${result.value.posts.length} posts`);
 * } else {
 *   logger.error(`Error: ${result.error}`);
 * }
 */

export class ComponentState<T> {
  private static stateMap = new Collection<
    string,
    { value: unknown; lastAccessed: number }
  >()
  private static cleanupInterval: NodeJS.Timer | null = null
  private static readonly CLEANUP_INTERVAL_MS = 30 * 60 * 1000 // 30 minutes
  private static readonly MAX_AGE_MS = 2 * 60 * 60 * 1000 // 2 hours
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
      ComponentState.stateMap.set(componentId, {
        value: initialState,
        lastAccessed: Date.now()
      })
    }

    // Start cleanup interval if not already running
    ComponentState.startCleanup()
  }

  /**
   * Start the automatic cleanup process
   */
  private static startCleanup(): void {
    if (ComponentState.cleanupInterval === null) {
      ComponentState.cleanupInterval = setInterval(() => {
        ComponentState.cleanup()
      }, ComponentState.CLEANUP_INTERVAL_MS)
    }
  }

  /**
   * Clean up old state entries to prevent memory leaks
   */
  private static cleanup(): void {
    const now = Date.now()
    const toDelete: string[] = []

    for (const [key, entry] of ComponentState.stateMap.entries()) {
      if (now - entry.lastAccessed > ComponentState.MAX_AGE_MS) {
        toDelete.push(key)
      }
    }

    for (const key of toDelete) {
      ComponentState.stateMap.delete(key)
    }
  }

  /**
   * Manually trigger cleanup
   */
  public static forceCleanup(): void {
    ComponentState.cleanup()
  }

  /**
   * Stop the cleanup interval (for testing or shutdown)
   */
  public static stopCleanup(): void {
    if (ComponentState.cleanupInterval !== null) {
      clearInterval(ComponentState.cleanupInterval)
      ComponentState.cleanupInterval = null
    }
  }

  /**
   * Gets the current state
   * @returns The current state or undefined if not set
   */
  get(): T | undefined {
    const entry = ComponentState.stateMap.get(this.componentId)
    if (entry) {
      entry.lastAccessed = Date.now()
      return entry.value as T
    }
    return undefined
  }

  /**
   * Sets a new state
   * @param newState - The new state to set
   * @returns The updated state
   */
  set(newState: T): T {
    ComponentState.stateMap.set(this.componentId, {
      value: newState,
      lastAccessed: Date.now()
    })
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

import type { ScopedToolProvider, ScopedToolSet, ToolScope } from './mintlify-mcp.ts'

/**
 * Combines several scoped tool providers into one. Tool sets are merged in provider order, with
 * later providers winning name conflicts, instructions are joined in order, and the first
 * provider that declares a tool iteration limit sets it.
 */
export class CompositeToolProvider implements ScopedToolProvider {
  readonly #providers: readonly ScopedToolProvider[]

  constructor(providers: readonly ScopedToolProvider[]) {
    this.#providers = providers
  }

  async resolve(scope: ToolScope): Promise<ScopedToolSet> {
    const resolved = await Promise.all(
      this.#providers.map(async (provider) => provider.resolve(scope))
    )
    const instructions = resolved
      .map((set) => set.instructions)
      .filter((value): value is string => value !== undefined && value.length > 0)
      .join('\n\n')

    return {
      instructions: instructions.length === 0 ? undefined : instructions,
      maxToolIterations: resolved.find((set) => set.maxToolIterations !== undefined)
        ?.maxToolIterations,
      tools: Object.assign({}, ...resolved.map((set) => set.tools))
    }
  }
}

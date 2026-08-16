// oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- tasky: return-only inference lets the call site supply the real framework type
export function partialFixture<T>(value: unknown): T {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- tasky: integration tests only model the live framework fields each route touches
  return value as T
}

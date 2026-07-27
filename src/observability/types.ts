export const LOG_LEVELS = ['ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE'] as const

export type LogLevel = (typeof LOG_LEVELS)[number]

export type LogFields = Readonly<Record<string, unknown>>

export interface KanikouLogger {
  debug(message: string, fields?: LogFields): void
  error(message: string, fields?: LogFields): void
  info(message: string, fields?: LogFields): void
  trace(message: string, fields?: LogFields): void
  warn(message: string, fields?: LogFields): void
}

export interface ConsoleObservabilityConfig {
  kind: 'console'
  level: LogLevel
  serviceName: string
}

export interface AxiomObservabilityConfig {
  kind: 'axiom'
  endpoint: string
  level: LogLevel
  logsDataset: string
  serviceName: string
  token: string
  tracesDataset: string
}

export type KanikouObservabilityConfig = AxiomObservabilityConfig | ConsoleObservabilityConfig

export interface KanikouObservability {
  logger: KanikouLogger
  shutdown(): Promise<void>
}

export interface TraceOperationConfig {
  attributes?: LogFields
  parent: 'active' | 'root'
}

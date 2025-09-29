import { Axiom } from '@axiomhq/js'
import type { ConsolaReporter, LogObject } from 'consola'

interface AxiomReporterOptions {
  token: string
  dataset: string
  orgId?: string
}

export class AxiomReporter implements ConsolaReporter {
  private axiom: Axiom
  private dataset: string
  private batchBuffer: any[] = []
  private batchTimer: NodeJS.Timeout | null = null
  private readonly batchSize = 10
  private readonly batchTimeout = 5000

  constructor(options: AxiomReporterOptions) {
    this.axiom = new Axiom({
      token: options.token,
      orgId: options.orgId
    })
    this.dataset = options.dataset

    // Ensure flush on process exit
    process.on('beforeExit', () => {
      this.flush()
    })
  }

  log(logObj: LogObject) {
    try {
      const structuredLog = this.formatLogEvent(logObj)
      this.batchBuffer.push(structuredLog)

      // Batch logs for efficiency
      if (this.batchBuffer.length >= this.batchSize) {
        this.flush()
      } else if (!this.batchTimer) {
        this.batchTimer = setTimeout(() => {
          this.flush()
        }, this.batchTimeout)
      }
    } catch (error) {
      // Silently fail to avoid infinite loops
      console.error('Axiom reporter error:', error)
    }
  }

  private flush() {
    if (this.batchBuffer.length === 0) return

    try {
      const logs = [...this.batchBuffer]
      this.batchBuffer = []

      if (this.batchTimer) {
        clearTimeout(this.batchTimer)
        this.batchTimer = null
      }

      // Fire and forget - don't await to avoid blocking
      this.axiom.ingest(this.dataset, logs)
    } catch (error) {
      console.error('Failed to flush logs to Axiom:', error)
    }
  }

  private formatLogEvent(logObj: LogObject) {
    const message = Array.isArray(logObj.args)
      ? logObj.args.join(' ')
      : String(logObj.args || '')

    return {
      timestamp: logObj.date || new Date(),
      level: this.getLevelName(logObj.level),
      tag: logObj.tag,
      type: logObj.type,
      message,
      raw_args: logObj.args,
      environment: process.env.NODE_ENV || 'development',
      service: 'vyx-discord-bot',
      // Add structured fields if args contain objects
      ...this.extractStructuredData(logObj.args)
    }
  }

  private extractStructuredData(args: any): Record<string, any> {
    if (!Array.isArray(args)) return {}

    const structured: Record<string, any> = {}

    for (const arg of args) {
      if (typeof arg === 'object' && arg !== null && !Array.isArray(arg)) {
        // Merge object properties into the log
        Object.assign(structured, arg)
      }
    }

    return structured
  }

  private getLevelName(level?: number): string {
    if (level === undefined) return 'info'
    if (level < 1) return 'error'
    if (level === 1) return 'warn'
    if (level === 2) return 'info'
    if (level === 3) return 'debug'
    return 'trace'
  }
}

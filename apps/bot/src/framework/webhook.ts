import { EmbedBuilder } from '@oceanicjs/builders'
import type { ConsolaReporter, LogObject } from 'consola'
import { codeblock } from 'discord-md-tags'
import type { ExecuteWebhookOptions } from 'oceanic.js'
import type { Client } from './client'

interface WebhookReporterOptions {
  id: string
  token: string
  client: Client
}

export class WebhookReporter implements ConsolaReporter {
  private options: WebhookReporterOptions

  constructor(options: WebhookReporterOptions) {
    this.options = options
  }

  log(logObj: LogObject) {
    // Only handle error logs (level < 1 means error/fatal)
    if (logObj.level !== undefined && logObj.level < 1) {
      this.sendErrorWebhook(logObj)
    }
    // Also handle logs with 'error' type
    if (logObj.type === 'error' || logObj.type === 'fatal') {
      this.sendErrorWebhook(logObj)
    }
  }

  private async sendErrorWebhook(logObj: LogObject) {
    // Skip webhook execution for specific error messages
    const errorMessage = Array.isArray(logObj.args)
      ? logObj.args.join(' ')
      : String(logObj.args || '')

    if (
      errorMessage.includes(
        "Error: invalid float value for field 'discord': NaN"
      )
    ) {
      return
    }

    try {
      const webhookData = this.formatErrorEmbed(logObj)
      await this.options.client.rest.webhooks.execute(
        this.options.id,
        this.options.token,
        webhookData
      )
    } catch (error) {
      // Silently fail to avoid infinite loops
      console.error('Failed to send webhook:', error)
    }
  }

  private formatErrorEmbed(logObj: LogObject): ExecuteWebhookOptions {
    const embed = new EmbedBuilder()

    if (logObj.date) {
      embed.setTimestamp(logObj.date)
    }

    const message = Array.isArray(logObj.args)
      ? logObj.args.join(' ')
      : String(logObj.args || '')

    const tag = logObj.tag ? `[${logObj.tag}]` : ''
    const title = `${tag} Error`

    embed.setTitle(title)
    embed.setDescription(codeblock('js')`${message}`)
    embed.setColor(14362664) // Red color for errors

    return { embeds: [embed.toJSON()] }
  }
}

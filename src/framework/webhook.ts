import { EmbedBuilder } from '@oceanicjs/builders'
import { codeblock } from 'discord-md-tags'
import type { ExecuteWebhookOptions } from 'oceanic.js'
import {
  type Formatter,
  type LogData,
  LogLevel,
  type Logger,
  Transport,
  type TransportOptions
} from 'tracix'
import type { Client } from './client'

export class DiscordFormatter implements Formatter {
  // @ts-expect-error
  format(data: LogData, logger: Logger) {
    if (data.level === LogLevel.ERROR) {
      return this.formatErrorEmbed(data, logger)
    }
    // if (data.level === LogLevel.INFO) {
    //   return this.formatMessage(data, logger);
    // }
  }

  /**
   * Formats the log message.
   */
  protected formatMessage(data: LogData, logger: Logger) {
    let msg = `${logger.name} (${data.level.toString()}): \``
    for (const input of data.input!) msg += `${input} `
    msg += '`'

    return <ExecuteWebhookOptions>{ content: msg }
  }

  protected formatErrorEmbed(data: LogData, logger: Logger) {
    if (data.level !== LogLevel.ERROR) return
    const embed = new EmbedBuilder()
    let msg = ''

    if (data.timestamp) embed.setTimestamp(new Date(data.timestamp))
    for (const input of data.input!) msg += input

    msg += '\n'
    embed.setTitle(`${logger.name}: ${data.level.toString()}`)
    embed.setDescription(codeblock('js')`${msg}`)
    embed.setColor(14362664)
    return <ExecuteWebhookOptions>{ embeds: [embed.toJSON()] }
  }
}

interface DiscordTransportOptions extends TransportOptions {
  id: string
  token: string
  client: Client
}

export class DiscordTransport extends Transport<DiscordTransportOptions> {
  /**
   * Creates a new discord transport.
   * @param options
   */
  public constructor(options: DiscordTransportOptions) {
    super(options)
  }

  async print(data: LogData, formatted: string): Promise<void> {
    switch (data.level) {
      case LogLevel.ERROR: {
        // Skip webhook execution for specific error messages
        let shouldSendWebhook = true

        // Check if any input contains the specific error message
        if (data.input && Array.isArray(data.input)) {
          const errorMessage = data.input.join(' ')
          if (
            errorMessage.includes(
              "Error: invalid float value for field 'discord': NaN"
            )
          ) {
            shouldSendWebhook = false
          }
        }

        if (shouldSendWebhook) {
          await this.options.client.rest.webhooks.execute(
            this.options.id,
            this.options.token,
            formatted as any // Using type assertion to fix the type error
          )
        }
        break
      }

      default:
        break
    }

    return
  }
}

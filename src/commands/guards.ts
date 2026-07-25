import { MessageFlags, type EditInteractionContent } from 'oceanic.js'
import { match } from 'ts-pattern'
import { OWNER_USER_ID } from '../discord/ids.ts'

interface OwnerGuardContext {
  readonly interaction: {
    readonly user: {
      readonly id: string
    }
  }
  reply(content: EditInteractionContent | string): Promise<unknown>
}

/** Replies privately and reports whether command execution should stop. */
export async function denyUnlessBotOwner(context: OwnerGuardContext): Promise<boolean> {
  return match(context.interaction.user.id === OWNER_USER_ID)
    .with(true, () => false)
    .otherwise(async () => {
      await context.reply({
        content: 'Only the bot owner can use this command.',
        flags: MessageFlags.EPHEMERAL
      })
      return true
    })
}

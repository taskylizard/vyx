import { definePrefixCommand, type Equal, type Expect } from '#framework'

export default definePrefixCommand({
  name: 'greet',
  description: 'Greet a user with a custom message',
  aliases: ['hello', 'hi'],
  args: {
    username: { type: 'string', required: true },
    times: { type: 'number', defaultValue: 1 },
    message: { type: 'quoted', defaultValue: 'Hello' },
    extra: { type: 'rest' }
  } as const,
  usage: 'greet <username> [times] ["message"] [extra text]',
  cooldown: 5,
  async run(ctx) {
    const { username, times, message, extra } = ctx.args

    type _TestTypes = [
      Expect<Equal<typeof username, string>>,
      Expect<Equal<typeof times, number | undefined>>,
      Expect<Equal<typeof message, string | undefined>>,
      Expect<Equal<typeof extra, string | undefined>>
    ]

    const greeting = `${message}, ${username}!`
    const repeated = Array(times ?? 1).fill(greeting).join('\n')

    await ctx.reply({
      content: repeated,
      embeds: extra
        ? [{
          description: `_Extra: ${extra}_`,
          color: ctx.colors.BLUE
        }]
        : undefined
    })
  }
})

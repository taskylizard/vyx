import { slashCommand, subcommand } from '../framework.ts'

export default slashCommand({
  name: 'notes',
  description: 'Save and review personal notes',
  contexts: ['guild', 'botDm', 'privateChannel'],
  installations: ['guild', 'user'],

  async beforeExecute(context) {
    await context.defer({ ephemeral: true })
  },

  async onError(context, error) {
    console.error('The notes command failed.', error)
    await context.editResponse('Something went wrong while handling your notes.')
  },

  subcommands: {
    add: subcommand({
      description: 'Save a new note',
      options: {
        content: {
          description: 'The note you want to save',
          kind: 'string',
          maxLength: 1_000,
          required: true
        }
      },

      async execute(context) {
        const count = context.app.notes.add(context.interaction.user.id, context.options.content)
        await context.editResponse(`Saved note ${count}.`)
      }
    }),

    show: subcommand({
      description: 'Show your saved notes',

      async execute(context) {
        const notes = context.app.notes.list(context.interaction.user.id)
        await context.editResponse(
          notes.length === 0
            ? 'You have no saved notes.'
            : notes.map((note, index) => `${index + 1}. ${note}`).join('\n')
        )
      }
    })
  }
})

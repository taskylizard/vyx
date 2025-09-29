import { definePrecondition, useRuntimeEnv } from '../../src'

export default definePrecondition(async (interaction) => {
  const env = useRuntimeEnv()
  const authorId = interaction.member?.user.id

  if (authorId && authorId !== env.ownerId) {
    await interaction.reply({ content: 'You are not the owner of this bot!' })
    return false
  }
  return true
})

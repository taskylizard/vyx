import { defineCommand } from 'citty'
import { createRosepack } from '../../'

export default defineCommand({
  meta: {
    name: 'dev',
    description: 'Run rosepack in development mode'
  },
  args: {
    dir: {
      type: 'positional',
      description: 'Project directory',
      default: '.'
    }
  },
  async run(ctx) {
    process.env.NODE_ENV = 'development'

    await createRosepack({ rootDir: ctx.args.dir }, { cwd: ctx.args.dir })
  }
})

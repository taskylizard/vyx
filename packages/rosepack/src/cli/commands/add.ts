import { defineCommand } from 'citty'
import { consola } from 'consola'
import fs, { ensureDir } from 'fs-extra'

export default defineCommand({
  meta: {
    name: 'add',
    description: 'Add a new file to the project'
  },
  args: {
    type: {
      type: 'positional',
      description:
        'Type of the file to be created (command, event, context-menu, button, modal, select-menu, precondition)'
    },
    name: {
      type: 'positional',
      description: 'Name of the file to be created'
    }
  },
  async run(ctx) {
    let { type, name } = ctx.args
    const types = [
      'command',
      'event',
      'context-menu',
      'button',
      'modal',
      'select-menu',
      'precondition'
    ]

    name = name.replace(/(\.ts)$/g, '')
    if (!types.includes(type)) {
      consola.error('Invalid type')
      process.exit(1)
    }
    await fs.ensureDir(`./${type}s`)
    switch (type) {
      case 'command': {
        const category = await consola.prompt(
          'In which category would you like to place this command?',
          {
            type: 'text'
          }
        )
        const filePath = `./${type}s${
          category ? `/${category}` : ''
        }/${name}.ts`

        if (fs.existsSync(filePath)) {
          consola.error('Command already exists')
          process.exit(1)
        }
        await ensureDir(`./${type}s${category ? `/${category}` : ''}`)
        await fs.writeFile(
          filePath,
          "import { defineCommand } from 'rosepack'\n\n" +
            'export default defineCommand({\n' +
            "  description: 'Description here'\n" +
            '}, () => {\n' +
            '  // Code here\n' +
            '})\n'
        )
        break
      }
      case 'event': {
        const filePath = `./${type}s/${name}.ts`

        if (fs.existsSync(filePath)) {
          consola.error('Event already exists')
          process.exit(1)
        }
        await fs.writeFile(
          filePath,
          "import { defineEvent } from 'rosepack'\n\n" +
            'export default defineEvent(() => {\n' +
            '  // Code here\n' +
            '})\n'
        )
        break
      }
      case 'context-menu': {
        const filePath = `./${type}s/${name}.ts`

        if (fs.existsSync(filePath)) {
          consola.error('Context menu already exists')
          process.exit(1)
        }
        await fs.writeFile(
          filePath,
          "import { defineContextMenu } from 'rosepack'\n\n" +
            'export default defineContextMenu((interaction) => {\n' +
            '  // Code here\n' +
            '})\n'
        )
        break
      }
      case 'button': {
        const filePath = `./components/${type}s/${name}.ts`

        if (fs.existsSync(filePath)) {
          consola.error('Button already exists')
          process.exit(1)
        }
        await fs.writeFile(
          filePath,
          "import { defineButton } from 'rosepack'\n\n" +
            "export default defineButton({ label: '' }, (interaction) => {\n" +
            '  // Code here\n' +
            '})\n'
        )
        break
      }
      case 'modal': {
        const filePath = `./components/${type}s/${name}.ts`

        if (fs.existsSync(filePath)) {
          consola.error('Modal already exists')
          process.exit(1)
        }
        await fs.writeFile(
          filePath,
          "import { defineModal } from 'rosepack'\n\n" +
            'export default defineModal(' +
            '  {\n' +
            "    title: 'Title here',\n" +
            '    inputs: {}\n' +
            '  },\n' +
            '  (interaction) => {\n' +
            '  // Code here\n' +
            '})\n'
        )
        break
      }
      case 'select-menu': {
        const filePath = `./components/${type}s/${name}.ts`

        if (fs.existsSync(filePath)) {
          consola.error('Select menu already exists')
          process.exit(1)
        }
        await fs.writeFile(
          filePath,
          "import { defineSelectMenu } from 'rosepack'\n\n" +
            'export default defineSelectMenu(\n' +
            '  {\n' +
            "    type: 'String',\n" +
            "    placeholder: 'Your placeholder',\n" +
            '    options: []\n' +
            '  },\n' +
            '  (interaction) => {\n' +
            '    // Code here\n' +
            '  }\n' +
            ')\n'
        )
        break
      }
      case 'precondition': {
        const filePath = `./${type}s/${name}.ts`

        if (fs.existsSync(filePath)) {
          consola.error('Precondition already exists')
          process.exit(1)
        }
        await fs.writeFile(
          filePath,
          "import { definePrecondition } from 'rosepack'\n\n" +
            'export default definePrecondition(({ interaction }) => {\n' +
            '  // Code here\n' +
            '})\n'
        )
        break
      }
    }

    consola.success(`✨ ${type} ${name} has been created.`)
  }
})

import {
  ApplicationCommandOptionTypes,
  type ButtonComponent,
  ButtonStyles,
  ComponentTypes,
  type MessageComponent,
  type User
} from 'oceanic.js'
import { defineSlashCommand, state } from '#framework'

export default defineSlashCommand({
  name: 'tictactoe',
  description: 'Play Tic Tac Toe against a friend or AI!',
  options: {
    mode: {
      type: ApplicationCommandOptionTypes.STRING,
      description: 'Play against AI (default) or another user',
      required: false,
      choices: [
        { name: 'AI', value: 'ai' },
        { name: 'Multiplayer', value: 'multi' }
      ]
    },
    opponent: {
      type: ApplicationCommandOptionTypes.USER,
      description: 'The user to play against (required for multiplayer)',
      required: false
    }
  },
  async run(ctx) {
    const board: (string | null)[] = new Array(9).fill(EMPTY)
    const mode = ctx.options.getString('mode') ?? 'ai'
    const opponent = ctx.options.getUser('opponent')

    if (mode === 'multi' && !opponent)
      return await ctx.reply(
        'You must specify an opponent for multiplayer mode.'
      )

    if (opponent && opponent.bot)
      return await ctx.reply('You cannot play against a bot.')

    const PLAYER_X = ctx.user
    const PLAYER_O = mode === 'multi' ? opponent! : ('AI' as const)
    const getUser = (mark: string) => (mark === X ? PLAYER_X : PLAYER_O)
    const getId = (mark: string) => {
      if (mark === X) return PLAYER_X.id
      return typeof PLAYER_O === 'string' ? 'AI' : PLAYER_O.id
    }
    const name = (u: User | 'AI') => (typeof u === 'string' ? 'AI' : u.username)
    let turn = X
    const status = state(`${ctx.user.id}:ttt`, false)

    const updateButtons = (): ButtonComponent[] =>
      board.map((v, i) => ({
        type: ComponentTypes.BUTTON,
        customID: `ttt:${i}`,
        style:
          v === X
            ? ButtonStyles.PRIMARY
            : v === O
              ? ButtonStyles.DANGER
              : ButtonStyles.SECONDARY,
        label: v ?? '\u200b',
        disabled: !!v || status.get()
      }))

    const makeRows = (btns: ButtonComponent[]): MessageComponent[] => [
      { type: ComponentTypes.ACTION_ROW, components: btns.slice(0, 3) },
      { type: ComponentTypes.ACTION_ROW, components: btns.slice(3, 6) },
      { type: ComponentTypes.ACTION_ROW, components: btns.slice(6, 9) }
    ]

    await ctx.reply({
      content:
        mode === 'ai'
          ? 'Your move!'
          : `${PLAYER_X.username} vs ${name(PLAYER_O)}`,
      components: makeRows(updateButtons())
    })

    const msg = await ctx.interaction.getOriginal()

    while (!status.get()) {
      if (mode === 'ai' && turn === O) {
        const aiMove = bestMove(board)
        if (aiMove !== -1) board[aiMove] = O
        if (checkWinner(board)) {
          status.set(true)
          await msg.edit({
            content: 'AI wins!',
            components: makeRows(updateButtons())
          })
          return
        }
        if (isDraw(board)) {
          status.set(true)
          await msg.edit({
            content: 'Draw!',
            components: makeRows(updateButtons())
          })
          return
        }
        turn = X
        await msg.edit({ components: makeRows(updateButtons()) })
        continue
      }

      const inter = await ctx.collectButton({
        messageID: msg.id,
        filter: (i) => {
          const id = i.user.id
          return mode === 'ai'
            ? id === ctx.user.id
            : id === PLAYER_X.id ||
                (typeof PLAYER_O !== 'string' && id === PLAYER_O.id)
        },
        timeout: 60000
      })
      if (!inter) return

      if (getId(turn) !== inter.user.id) {
        await inter.reply({ content: 'Not your turn.', flags: 64 })
        continue
      }

      const idx = Number.parseInt(inter.data.customID.split(':')[1])
      if (board[idx]) continue
      board[idx] = turn

      if (checkWinner(board)) {
        status.set(true)
        await inter.editParent({
          content: `${name(getUser(turn))} wins!`,
          components: makeRows(updateButtons())
        })
        return
      }

      if (isDraw(board)) {
        status.set(true)
        await inter.editParent({
          content: 'Draw!',
          components: makeRows(updateButtons())
        })
        return
      }

      turn = turn === X ? O : X
      await inter.editParent({ components: makeRows(updateButtons()) })
    }
  }
})

const EMPTY = null,
  X = '❌',
  O = '⭕'
function checkWinner(b: (string | null)[]) {
  const wins = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6]
  ]
  for (const [a, b1, c] of wins)
    if (b[a] && b[a] === b[b1] && b[b1] === b[c]) return b[a]
  return null
}

function isDraw(b: (string | null)[]) {
  return b.every((cell) => cell !== EMPTY) && !checkWinner(b)
}

function bestMove(b: (string | null)[]) {
  let best = Number.NEGATIVE_INFINITY,
    move = -1
  for (let i = 0; i < 9; i++) {
    if (b[i]) continue
    b[i] = O
    const score = minimax(b, 0, false)
    b[i] = EMPTY
    if (score > best) {
      best = score
      move = i
    }
  }
  return move
}
function minimax(b: (string | null)[], depth: number, isMax: boolean): number {
  const winner = checkWinner(b)
  if (winner === O) return 10 - depth
  if (winner === X) return depth - 10
  if (isDraw(b)) return 0

  let best = isMax ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY
  for (let i = 0; i < 9; i++) {
    if (b[i]) continue
    b[i] = isMax ? O : X
    const score = minimax(b, depth + 1, !isMax)
    b[i] = EMPTY
    best = isMax ? Math.max(score, best) : Math.min(score, best)
  }
  return best
}

// Checks every bundled puzzle: all solution moves are legal from its FEN.
import { readFileSync } from 'node:fs'
import { Chess } from 'chess.js'

const puzzles = JSON.parse(readFileSync(new URL('../src/data/puzzles.json', import.meta.url), 'utf8'))
let bad = 0
const themeCount = {}
for (const p of puzzles) {
  const c = new Chess(p.fen)
  try {
    for (const m of p.moves) c.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] })
    if (p.themes.some((t) => t.startsWith('mate')) && !c.isCheckmate()) throw new Error('mate theme but no mate')
  } catch (e) {
    bad++
    console.log('BAD', p.id, e.message)
  }
  for (const t of p.themes) themeCount[t] = (themeCount[t] ?? 0) + 1
}
console.log(`${puzzles.length} puzzles, ${bad} bad`)
console.log(Object.entries(themeCount).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t}:${n}`).join(' '))
process.exit(bad ? 1 : 0)

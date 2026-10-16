import data from '../data/puzzles.json'

/** A Lichess puzzle: `moves[0]` is the opponent's setup move, the rest is the solution (UCI). */
export type Puzzle = {
  id: string
  fen: string
  moves: string[]
  rating: number
  themes: string[]
  url: string
}

export const puzzles = data as Puzzle[]

/** Picks an unplayed puzzle near the player's rating, recycling once everything has been seen. */
export function pickPuzzle(rating: number, played: string[], exclude?: string): Puzzle {
  const seen = new Set(played)
  let pool = puzzles.filter((p) => !seen.has(p.id) && p.id !== exclude)
  if (pool.length === 0) pool = puzzles.filter((p) => p.id !== exclude)
  for (const range of [150, 250, 400, 700]) {
    const near = pool.filter((p) => Math.abs(p.rating - rating) <= range)
    if (near.length >= 3) return near[Math.floor(Math.random() * near.length)]
  }
  return pool.reduce((best, p) => (Math.abs(p.rating - rating) < Math.abs(best.rating - rating) ? p : best))
}

export function findPuzzle(id: string): Puzzle | undefined {
  return puzzles.find((p) => p.id === id)
}

const THEME_LABELS: Record<string, string> = {
  mateIn1: 'Mate in 1',
  mateIn2: 'Mate in 2',
  mateIn3: 'Mate in 3',
  mateIn4: 'Mate in 4',
  mateIn5: 'Mate in 5',
  backRankMate: 'Back rank mate',
  smotheredMate: 'Smothered mate',
  anastasiaMate: "Anastasia's mate",
  arabianMate: 'Arabian mate',
  bodenMate: "Boden's mate",
  epauletteMate: 'Epaulette mate',
  hookMate: 'Hook mate',
  morphysMate: "Morphy's mate",
  operaMate: 'Opera mate',
  doubleBishopMate: 'Double bishop mate',
  dovetailMate: 'Dovetail mate',
  fork: 'Fork',
  pin: 'Pin',
  skewer: 'Skewer',
  discoveredAttack: 'Discovered attack',
  discoveredCheck: 'Discovered check',
  doubleCheck: 'Double check',
  hangingPiece: 'Hanging piece',
  sacrifice: 'Sacrifice',
  deflection: 'Deflection',
  attraction: 'Attraction',
  clearance: 'Clearance',
  interference: 'Interference',
  intermezzo: 'Intermezzo',
  xRayAttack: 'X-ray attack',
  zugzwang: 'Zugzwang',
  promotion: 'Promotion',
  underPromotion: 'Underpromotion',
  advancedPawn: 'Advanced pawn',
  exposedKing: 'Exposed king',
  kingsideAttack: 'Kingside attack',
  queensideAttack: 'Queenside attack',
  attackingF2F7: 'Attacking f2/f7',
  trappedPiece: 'Trapped piece',
  defensiveMove: 'Defensive move',
  quietMove: 'Quiet move',
  capturingDefender: 'Capture the defender',
  endgame: 'Endgame',
  middlegame: 'Middlegame',
  opening: 'Opening',
  rookEndgame: 'Rook endgame',
  bishopEndgame: 'Bishop endgame',
  pawnEndgame: 'Pawn endgame',
  knightEndgame: 'Knight endgame',
  queenEndgame: 'Queen endgame',
  queenRookEndgame: 'Queen & rook endgame',
}

/** Tactical themes worth showing to the player (skips length/eval tags like "short" or "crushing"). */
export function themeLabels(themes: string[]): string[] {
  return themes.filter((t) => t in THEME_LABELS && t !== 'mate').map((t) => THEME_LABELS[t])
}

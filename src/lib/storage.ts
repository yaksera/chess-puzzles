// Player progress kept in localStorage: rating, streaks and recently played puzzles.

export type Stats = {
  rating: number
  peak: number
  streak: number
  bestStreak: number
  solved: number
  attempted: number
  /** Puzzle ids already played, oldest first; used to avoid repeats. */
  played: string[]
  muted: boolean
}

const KEY = 'chess-puzzles:stats:v1'
export const START_RATING = 1200

export const defaultStats: Stats = {
  rating: START_RATING,
  peak: START_RATING,
  streak: 0,
  bestStreak: 0,
  solved: 0,
  attempted: 0,
  played: [],
  muted: false,
}

export function loadStats(): Stats {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...defaultStats }
    return { ...defaultStats, ...JSON.parse(raw) }
  } catch {
    return { ...defaultStats }
  }
}

export function saveStats(stats: Stats) {
  try {
    localStorage.setItem(KEY, JSON.stringify(stats))
  } catch {
    // Storage full or blocked: progress just won't persist.
  }
}

/** Simple Elo: K is larger for the first puzzles so the rating settles quickly. */
export function ratingDelta(player: number, puzzle: number, won: boolean, attempted: number): number {
  const k = attempted < 20 ? 40 : 24
  const expected = 1 / (1 + Math.pow(10, (puzzle - player) / 400))
  const delta = Math.round(k * ((won ? 1 : 0) - expected))
  // Always move at least one point so every result is felt.
  if (delta === 0) return won ? 1 : -1
  return delta
}

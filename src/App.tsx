/* eslint-disable react/refs -- puzzle session state lives in refs (read by timers) and renders via an explicit rerender() */
import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Chess } from 'chess.js'
import type { Move, Square } from 'chess.js'
import { Chessboard } from 'react-chessboard'
import type { Arrow, PieceDropHandlerArgs, PieceHandlerArgs, SquareHandlerArgs } from 'react-chessboard'
import { findPuzzle, pickPuzzle, themeLabels } from './lib/puzzles'
import type { Puzzle } from './lib/puzzles'
import { loadStats, ratingDelta, saveStats } from './lib/storage'
import type { Stats } from './lib/storage'
import { play, setMuted, unlockAudio } from './lib/sounds'
import './App.css'

/**
 * intro    – start position shown, opponent's setup move about to play
 * play     – waiting for the player's move
 * opponent – correct move made, opponent reply about to play
 * wrong    – wrong move shown, about to be taken back
 * replay   – "Show solution" is playing the remaining moves
 * done     – puzzle finished (solved, or solution shown)
 */
type Phase = 'intro' | 'play' | 'opponent' | 'wrong' | 'replay' | 'done'
type Mark = { from: string; to: string; kind: 'correct' | 'wrong' }
type Color = 'white' | 'black'

const SETUP_DELAY = 700
const REPLY_DELAY = 450
const WRONG_UNDO_DELAY = 850
const REPLAY_STEP = 750

const PROMOTION_PIECES = ['q', 'r', 'b', 'n'] as const
const PIECE_GLYPH: Record<string, [string, string]> = {
  q: ['♕', '♛'],
  r: ['♖', '♜'],
  b: ['♗', '♝'],
  n: ['♘', '♞'],
}

function uci(move: Move) {
  return move.from + move.to + (move.promotion ?? '')
}

function playMoveSound(move: Move) {
  if (move.san.includes('+') || move.san.includes('#')) play('check')
  else if (move.captured) play('capture')
  else play('move')
}

function initialPuzzle(): Puzzle {
  const id = new URLSearchParams(location.search).get('id')
  const stats = loadStats()
  return (id && findPuzzle(id)) || pickPuzzle(stats.rating, stats.played)
}

export default function App() {
  const [stats, setStats] = useState<Stats>(loadStats)
  const [, rerender] = useReducer((n: number) => n + 1, 0)

  // Puzzle session state lives in refs so timers never read stale values.
  const puzzleRef = useRef<Puzzle>(initialPuzzle())
  const gameRef = useRef(new Chess(puzzleRef.current.fen))
  const stepRef = useRef(0) // index of the next move in puzzle.moves
  const phaseRef = useRef<Phase>('intro')
  const failedRef = useRef(false) // mistake, hint or solution used this attempt
  const ratedRef = useRef(false) // rating already applied for this puzzle
  const revealedRef = useRef(false) // "Show solution" was used
  const markRef = useRef<Mark | null>(null)
  const hintRef = useRef(0)
  const noteRef = useRef<'none' | 'retry' | 'correct'>('none') // status hint after a take-back or a reply
  const timers = useRef<number[]>([])

  const [selected, setSelected] = useState<Square | null>(null)
  const [promotion, setPromotion] = useState<{ from: Square; to: Square } | null>(null)
  const [delta, setDelta] = useState<number | null>(null)

  const puzzle = puzzleRef.current
  const game = gameRef.current
  const phase = phaseRef.current
  const playerColor: Color = puzzle.fen.split(' ')[1] === 'w' ? 'black' : 'white'

  const statsRef = useRef(stats)
  statsRef.current = stats
  useEffect(() => saveStats(stats), [stats])
  useEffect(() => setMuted(stats.muted), [stats.muted])
  useEffect(() => {
    const unlock = () => unlockAudio()
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('touchend', unlock, { once: true })
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('touchend', unlock)
    }
  }, [])

  const schedule = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms))
  }, [])
  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }, [])

  const setPhase = useCallback((p: Phase) => {
    phaseRef.current = p
    rerender()
  }, [])

  /** Applies the rating result once per puzzle; retries don't count again. */
  const rate = useCallback((won: boolean) => {
    if (ratedRef.current) return
    ratedRef.current = true
    const cur = statsRef.current
    const d = ratingDelta(cur.rating, puzzleRef.current.rating, won, cur.attempted)
    setDelta(d)
    setStats((s) => {
      const rating = s.rating + d
      const streak = won ? s.streak + 1 : 0
      return {
        ...s,
        rating,
        peak: Math.max(s.peak, rating),
        streak,
        bestStreak: Math.max(s.bestStreak, streak),
        solved: s.solved + (won ? 1 : 0),
        attempted: s.attempted + 1,
      }
    })
  }, [])

  const fail = useCallback(() => {
    if (failedRef.current) return
    failedRef.current = true
    rate(false)
  }, [rate])

  const startPuzzle = useCallback(
    (p: Puzzle, retry = false) => {
      clearTimers()
      puzzleRef.current = p
      gameRef.current = new Chess(p.fen)
      stepRef.current = 0
      failedRef.current = false
      revealedRef.current = false
      markRef.current = null
      hintRef.current = 0
      noteRef.current = 'none'
      if (!retry) {
        ratedRef.current = false
        setDelta(null)
        setStats((s) => (s.played.includes(p.id) ? s : { ...s, played: [...s.played, p.id].slice(-400) }))
        window.history.replaceState(null, '', `?id=${p.id}`)
      }
      setSelected(null)
      setPromotion(null)
      setPhase('intro')
      schedule(() => {
        const move = gameRef.current.move(p.moves[0])
        playMoveSound(move)
        stepRef.current = 1
        setPhase('play')
      }, SETUP_DELAY)
    },
    [clearTimers, schedule, setPhase],
  )

  // Kick off the first puzzle (and tidy timers on unmount / StrictMode re-run).
  useEffect(() => {
    startPuzzle(puzzleRef.current)
    return clearTimers
  }, [startPuzzle, clearTimers])

  const finish = useCallback(() => {
    if (!failedRef.current) rate(true)
    play('solved')
    setPhase('done')
  }, [rate, setPhase])

  /** Tries the player's move. Returns true if the board should accept the drop. */
  const tryMove = useCallback(
    (from: Square, to: Square, promo?: string): boolean => {
      if (phaseRef.current !== 'play') return false
      const g = gameRef.current
      const p = puzzleRef.current
      const piece = g.get(from)
      const legal = g.moves({ square: from, verbose: true }).filter((m) => m.to === to)
      if (legal.length === 0) return false
      if (!promo && piece?.type === 'p' && legal.some((m) => m.promotion)) {
        setPromotion({ from, to })
        return false
      }

      const move = g.move({ from, to, promotion: promo })
      const step = stepRef.current
      const expected = p.moves[step]
      const isLast = step === p.moves.length - 1
      hintRef.current = 0
      noteRef.current = 'none'
      setSelected(null)

      if (uci(move) === expected || (isLast && g.isCheckmate())) {
        playMoveSound(move)
        markRef.current = { from, to, kind: 'correct' }
        stepRef.current = step + 1
        if (isLast) {
          finish()
          return true
        }
        setPhase('opponent')
        schedule(() => {
          const reply = gameRef.current.move(p.moves[stepRef.current])
          playMoveSound(reply)
          markRef.current = null
          noteRef.current = 'correct'
          stepRef.current += 1
          setPhase('play')
        }, REPLY_DELAY)
        return true
      }

      // Wrong: show the move, shake, then take it back.
      play('wrong')
      markRef.current = { from, to, kind: 'wrong' }
      fail()
      setPhase('wrong')
      schedule(() => {
        gameRef.current.undo()
        markRef.current = null
        noteRef.current = 'retry'
        setPhase('play')
      }, WRONG_UNDO_DELAY)
      return true
    },
    [fail, finish, schedule, setPhase],
  )

  const hint = useCallback(() => {
    if (phaseRef.current !== 'play') return
    fail()
    hintRef.current = Math.min(2, hintRef.current + 1)
    rerender()
  }, [fail])

  const showSolution = useCallback(() => {
    const ph = phaseRef.current
    if (ph === 'done' || ph === 'replay' || ph === 'intro') return
    clearTimers()
    fail()
    revealedRef.current = true
    // A wrong move may still be on the board; take it back first.
    // If the opponent's reply was pending, the step already points at it.
    if (ph === 'wrong') gameRef.current.undo()
    markRef.current = null
    hintRef.current = 0
    setSelected(null)
    setPromotion(null)
    setPhase('replay')
    const p = puzzleRef.current
    const stepOnce = () => {
      if (stepRef.current >= p.moves.length) {
        setPhase('done')
        return
      }
      const move = gameRef.current.move(p.moves[stepRef.current])
      playMoveSound(move)
      stepRef.current += 1
      rerender()
      schedule(stepOnce, REPLAY_STEP)
    }
    schedule(stepOnce, 250)
  }, [clearTimers, fail, schedule, setPhase])

  const retry = useCallback(() => startPuzzle(puzzleRef.current, true), [startPuzzle])

  const next = useCallback(() => {
    // Skipping an unfinished puzzle counts as a miss, like on chess.com.
    if (phaseRef.current !== 'done' && phaseRef.current !== 'intro') fail()
    const s = statsRef.current
    startPuzzle(pickPuzzle(s.rating, s.played, puzzleRef.current.id))
  }, [fail, startPuzzle])

  const toggleMute = () => setStats((s) => ({ ...s, muted: !s.muted }))

  // Keyboard shortcuts: H hint, R retry, S solution, N / → next.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const k = e.key.toLowerCase()
      if (k === 'h') hint()
      else if (k === 'r') retry()
      else if (k === 's') showSolution()
      else if (k === 'n' || (k === 'arrowright' && phaseRef.current === 'done')) next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [hint, retry, showSolution, next])

  // ---- Board interaction ----------------------------------------------------

  const legalTargets = selected && phase === 'play' ? game.moves({ square: selected, verbose: true }) : []

  const isOwnPiece = (pieceType?: string) => !!pieceType && pieceType[0] === playerColor[0]

  const onSquareClick = ({ piece, square }: SquareHandlerArgs) => {
    if (phaseRef.current !== 'play') return
    const sq = square as Square
    if (selected && legalTargets.some((m) => m.to === sq)) {
      tryMove(selected, sq)
      return
    }
    if (isOwnPiece(piece?.pieceType)) setSelected(sq === selected ? null : sq)
    else setSelected(null)
  }

  const onPieceDrop = ({ sourceSquare, targetSquare }: PieceDropHandlerArgs) => {
    if (!targetSquare || targetSquare === sourceSquare) return false
    return tryMove(sourceSquare as Square, targetSquare as Square)
  }

  const onPieceDrag = ({ square }: PieceHandlerArgs) => {
    if (square && phaseRef.current === 'play') setSelected(square as Square)
  }

  const canDragPiece = ({ piece }: PieceHandlerArgs) => phaseRef.current === 'play' && isOwnPiece(piece.pieceType)

  // ---- Square decoration ----------------------------------------------------

  const moveHistory = game.history({ verbose: true })
  const lastMove = moveHistory.at(-1)
  const mark = markRef.current
  const expected = puzzle.moves[stepRef.current]
  const hintLevel = phase === 'play' ? hintRef.current : 0

  const squareLayers: Record<string, string[]> = {}
  const add = (sq: string, layer: string) => (squareLayers[sq] ??= []).push(layer)
  const fill = (c: string) => `linear-gradient(${c}, ${c})`

  if (lastMove && !(mark && mark.to === lastMove.to)) {
    add(lastMove.from, fill('rgba(255, 255, 51, 0.42)'))
    add(lastMove.to, fill('rgba(255, 255, 51, 0.42)'))
  }
  if (mark) {
    const c = mark.kind === 'correct' ? 'rgba(129, 182, 76, 0.8)' : 'rgba(229, 57, 53, 0.75)'
    add(mark.from, fill(c))
    add(mark.to, fill(c))
  }
  if (selected) add(selected, fill('rgba(255, 255, 51, 0.5)'))
  if (hintLevel >= 1 && expected) add(expected.slice(0, 2), fill('rgba(66, 165, 245, 0.6)'))
  if (game.inCheck()) {
    const king = game
      .board()
      .flat()
      .find((p) => p && p.type === 'k' && p.color === game.turn())
    if (king) add(king.square, 'radial-gradient(circle, rgba(255, 0, 0, 0.9) 0%, rgba(231, 0, 0, 0.5) 40%, transparent 72%)')
  }
  for (const m of legalTargets) {
    add(
      m.to,
      m.captured
        ? 'radial-gradient(circle, transparent 66%, rgba(0, 0, 0, 0.16) 67%)'
        : 'radial-gradient(circle, rgba(0, 0, 0, 0.16) 24%, transparent 25%)',
    )
  }

  const arrows: Arrow[] =
    hintLevel >= 2 && expected
      ? [{ startSquare: expected.slice(0, 2), endSquare: expected.slice(2, 4), color: 'rgba(66, 165, 245, 0.85)' }]
      : []

  const squareRenderer = ({ square, children }: SquareHandlerArgs & { children?: ReactNode }) => {
    const layers = squareLayers[square]
    const style: CSSProperties = { width: '100%', height: '100%', position: 'relative' }
    // Layers are listed bottom-up; CSS backgrounds paint the first one on top.
    if (layers) style.background = [...layers].reverse().join(', ')
    const badge =
      mark && mark.to === square ? (
        <span className={`badge badge-${mark.kind}`} aria-hidden>
          {mark.kind === 'correct' ? '✓' : '✕'}
        </span>
      ) : phase === 'done' && !failedRef.current && lastMove?.to === square ? (
        <span className="badge badge-correct" aria-hidden>
          ★
        </span>
      ) : null
    return (
      <div style={style}>
        {children}
        {badge}
      </div>
    )
  }

  // ---- Status panel ---------------------------------------------------------

  const sideName = playerColor === 'white' ? 'White' : 'Black'
  const solvedClean = phase === 'done' && !failedRef.current
  const status = (() => {
    switch (phase) {
      case 'intro':
        return { tone: 'neutral', title: 'Get ready…', text: `You play as ${sideName}.` }
      case 'play':
        if (hintLevel > 0)
          return { tone: 'hint', title: 'Hint', text: hintLevel === 1 ? 'Move the highlighted piece.' : 'Play the arrow move.' }
        if (noteRef.current === 'retry') return { tone: 'bad', title: 'Try again', text: `Find the best move for ${sideName}.` }
        if (noteRef.current === 'correct') return { tone: 'good', title: 'Best move!', text: 'Keep going…' }
        return { tone: 'neutral', title: `${sideName} to move`, text: `Find the best move for ${sideName}.` }
      case 'opponent':
        return { tone: 'good', title: 'Correct!', text: 'Keep going…' }
      case 'wrong':
        return { tone: 'bad', title: 'Incorrect', text: "That's not the move. Try again." }
      case 'replay':
        return { tone: 'hint', title: 'Solution', text: 'Watch the winning line.' }
      case 'done':
        if (revealedRef.current) return { tone: 'hint', title: 'Solution shown', text: 'Study it, then try the next one.' }
        return solvedClean
          ? { tone: 'good', title: 'Puzzle solved!', text: 'Nicely done — first try.' }
          : { tone: 'good', title: 'Puzzle solved!', text: 'Solved, but not on the first try.' }
    }
  })()

  const themes = themeLabels(puzzle.themes)
  const showThemes = phase === 'done'
  const startMoveNumber = Number(puzzle.fen.split(' ')[5])
  const startsWithBlack = puzzle.fen.split(' ')[1] === 'b'
  const moveNumber = (ply: number) => startMoveNumber + Math.floor((ply + (startsWithBlack ? 1 : 0)) / 2)
  const accuracy = stats.attempted ? Math.round((stats.solved / stats.attempted) * 100) : 0

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-icon" aria-hidden>
            ♞
          </span>
          <span>Puzzles</span>
        </div>
        <button className="icon-btn" onClick={toggleMute} title={stats.muted ? 'Unmute' : 'Mute'} aria-label={stats.muted ? 'Unmute' : 'Mute'}>
          {stats.muted ? '🔇' : '🔊'}
        </button>
      </header>

      <main className="layout">
        <section className="board-col">
          <div className={`board-wrap ${phase === 'wrong' ? 'shake' : ''}`}>
            <Chessboard
              options={{
                id: 'puzzle-board',
                position: game.fen(),
                boardOrientation: playerColor,
                animationDurationInMs: 180,
                allowDrawingArrows: false,
                arrows,
                darkSquareStyle: { backgroundColor: '#739552' },
                lightSquareStyle: { backgroundColor: '#ebecd0' },
                darkSquareNotationStyle: { color: '#ebecd0', fontWeight: 700 },
                lightSquareNotationStyle: { color: '#739552', fontWeight: 700 },
                dropSquareStyle: { boxShadow: 'inset 0 0 0 4px rgba(255,255,255,0.65)' },
                boardStyle: { borderRadius: 6, overflow: 'hidden' },
                canDragPiece,
                onPieceDrag,
                onPieceDrop,
                onSquareClick,
                squareRenderer,
              }}
            />
            {promotion && (
              <div className="promo-backdrop" onClick={() => setPromotion(null)}>
                <div className="promo" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Choose promotion piece">
                  {PROMOTION_PIECES.map((pc) => (
                    <button
                      key={pc}
                      className="promo-btn"
                      onClick={() => {
                        const { from, to } = promotion
                        setPromotion(null)
                        tryMove(from, to, pc)
                      }}
                      aria-label={`Promote to ${pc}`}
                    >
                      {PIECE_GLYPH[pc][playerColor === 'white' ? 0 : 1]}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        <aside className="panel">
          <div className="rating-card">
            <div>
              <div className="label">Puzzle rating</div>
              <div className="rating">
                {stats.rating}
                {delta !== null && (
                  <span className={`delta ${delta >= 0 ? 'up' : 'down'}`} key={`${puzzle.id}-${delta}`}>
                    {delta >= 0 ? `+${delta}` : delta}
                  </span>
                )}
              </div>
            </div>
            <div className="streak" title="Current streak (best)">
              <span className={`flame ${stats.streak > 0 ? 'on' : ''}`} aria-hidden>
                🔥
              </span>
              <div>
                <div className="streak-num">{stats.streak}</div>
                <div className="label">best {stats.bestStreak}</div>
              </div>
            </div>
          </div>

          <div className={`status status-${status.tone}`} aria-live="polite">
            <div className="status-icon" aria-hidden>
              {status.tone === 'good' ? '✓' : status.tone === 'bad' ? '✕' : status.tone === 'hint' ? '💡' : playerColor === 'white' ? '♔' : '♚'}
            </div>
            <div>
              <div className="status-title">{status.title}</div>
              <div className="status-text">{status.text}</div>
            </div>
          </div>

          <div className="info">
            <div className="info-row">
              <span className="label">Puzzle</span>
              <span>
                #{puzzle.id} · <strong>{phase === 'done' ? puzzle.rating : '?'}</strong>
              </span>
            </div>
            <div className="themes">
              {showThemes ? themes.map((t) => <span className="chip" key={t}>{t}</span>) : <span className="chip muted">Themes hidden until solved</span>}
            </div>
            {moveHistory.length > 1 && (
              <ol className="moves">
                {moveHistory.slice(1).map((m, i) => {
                  const ply = i + 1 // ply 0 is the opponent's setup move
                  const num = moveNumber(ply)
                  const showNum = i === 0 || m.color === 'w'
                  return (
                    <li key={ply} className={m.color === playerColor[0] ? 'mine' : ''}>
                      {showNum && <span className="num">{m.color === 'w' ? `${num}.` : `${num}…`}</span>}
                      {m.san}
                    </li>
                  )
                })}
              </ol>
            )}
          </div>

          <div className="actions">
            {phase === 'done' ? (
              <>
                <button className="btn primary big" onClick={next}>
                  Next puzzle →
                </button>
                <div className="row">
                  <button className="btn" onClick={retry}>
                    ↺ Retry
                  </button>
                  <a className="btn" href={puzzle.url} target="_blank" rel="noreferrer">
                    View game ↗
                  </a>
                </div>
              </>
            ) : (
              <>
                <div className="row">
                  <button className="btn" onClick={hint} disabled={phase !== 'play'} title="Using a hint counts as a miss">
                    💡 Hint
                  </button>
                  <button className="btn" onClick={retry} disabled={phase === 'intro'}>
                    ↺ Retry
                  </button>
                </div>
                <div className="row">
                  <button className="btn" onClick={showSolution} disabled={phase === 'intro' || phase === 'replay'}>
                    👁 Solution
                  </button>
                  <button className="btn primary" onClick={next}>
                    Next →
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="stats">
            <div>
              <div className="stat-num">{stats.solved}</div>
              <div className="label">solved</div>
            </div>
            <div>
              <div className="stat-num">{stats.attempted}</div>
              <div className="label">played</div>
            </div>
            <div>
              <div className="stat-num">{accuracy}%</div>
              <div className="label">success</div>
            </div>
            <div>
              <div className="stat-num">{stats.peak}</div>
              <div className="label">peak</div>
            </div>
          </div>

          <p className="footnote">
            Puzzles from the <a href="https://database.lichess.org/#puzzles" target="_blank" rel="noreferrer">Lichess database</a> (CC0). Keys: H hint · R retry · S solution · N next
          </p>
        </aside>
      </main>
    </div>
  )
}

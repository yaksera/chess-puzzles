# Chess Puzzles

A chess.com-style puzzle trainer: solve tactics only, no games and no accounts.

```bash
npm install
npm run dev
```

## Features

- Drag-and-drop or click/tap to move, with legal-move dots, check glow and a promotion picker
- The board is flipped to the side that has to move. The opponent's setup move and replies play automatically.
- A correct move turns green with a ✓. A wrong move turns red with a ✕, shakes the board and is taken back.
- Hint (first press highlights the piece, second press shows an arrow), Retry, Show solution, Next puzzle
- Elo puzzle rating, current and best streak, solved/played stats, all saved in `localStorage`
- A mistake, a hint, viewing the solution or skipping counts as a miss. Each puzzle is rated only once, and retries don't count.
- Synthesized move, capture, check, wrong and solved sounds (Web Audio), with a mute toggle
- Dark theme with a mobile layout
- Keyboard: `H` hint · `R` retry · `S` solution · `N` next
- `?id=<puzzleId>` in the URL opens a specific puzzle

## Puzzles

`src/data/puzzles.json` holds 118 puzzles from the [Lichess puzzle database](https://database.lichess.org/#puzzles) (CC0), rated 693–2599. They cover themes such as mate in 1/2/3, fork, pin, skewer, discovered attack, back-rank mate, sacrifice, deflection and promotion. `moves[0]` is the opponent's setup move and the rest is the solution in UCI. `npm run validate` replays every line with chess.js.

## Install on iPhone (free)

The app is a PWA. Host `dist/` on any free HTTPS host (GitHub Pages, Netlify, Cloudflare Pages), then:

1. Open the URL in **Safari**.
2. Tap **Share**, then **Add to Home Screen**.

It opens full-screen with its own icon and works offline after the first visit. Turn off the ring/silent switch to hear sounds.

`npm run build` makes `dist/` with relative paths, so it also works from a sub-folder.

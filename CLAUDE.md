# rps-shoot

Online Rock Paper Scissors for two players, built with vanilla JS and Cloudflare Workers.

## Architecture

- **Backend**: `src/worker.js` — a Cloudflare Worker that routes WebSocket connections to a Durable Object (`GameRoom`). Each game room is a separate DO instance identified by a short random ID.
- **Frontend**: `public/` — vanilla HTML/CSS/JS, no framework. Served as static assets by the same Worker.
- **Deployment**: Cloudflare Workers + Durable Objects (free tier). Deploy with `npm run deploy` (runs `wrangler deploy`). Wrangler v4. Auto-deploys on push to `main` via `.github/workflows/deploy.yml` (requires `CLOUDFLARE_API_TOKEN` secret in GitHub).

The backend and frontend are one deployment unit — there is no separate static host. Cloudflare serves both.

## How a game works

1. Player A clicks "New Game" → a random 6-character room ID is generated → URL updates to `?game={roomId}` → a player token is generated and stored in `sessionStorage` → WebSocket connects to `/game/{roomId}?token={token}`
2. Player A shares the URL (Copy button, or Share button via Web Share API if supported)
3. Player B loads the URL → generates their own token → connects to the same Durable Object
4. The DO tracks both player slots and each player's pick
5. When both players have picked, the DO resolves the round and sends each player a tailored `result` message
6. The DO resets picks after each round — rematches reuse the same connection and room

## Player slots and reconnection

The DO tracks players as named slots (`this.slots`), not anonymous connections. Each slot has a `token`, a `ws` (nullable), and a `pick`.

- On connect, the token is checked against existing slots. If it matches, the WebSocket is swapped in (reconnect). If no match and a slot is free, a new slot is created. If both slots are filled by different tokens, the connection is rejected (409).
- On disconnect, `ws` is set to `null` but the slot is preserved, allowing the player to reconnect.
- The first message sent to every connecting client is `reconnected`, which carries enough state to restore the UI (player count, whether they've already picked this round, whether the opponent has picked).
- Reconnection only works while the DO is alive in memory. If both players disconnect long enough for the DO to evict, state is lost.
- Tokens are stored in `sessionStorage` (not `localStorage`) so each tab gets an independent token and stale tokens are cleaned up when the tab closes.

## WebSocket message types

**Client → Server:**
- `{ type: "pick", pick: "rock"|"paper"|"scissors" }`
- `{ type: "play_again" }` — relayed to the other player
- `{ type: "series_start" }` — relayed to the other player

**Server → Client:**
- `{ type: "reconnected", playerIndex, connectedCount, yourPick, opponentPicked }` — sent immediately on every connection (first-time or reconnect)
- `{ type: "player_count", count: 1|2 }` — broadcast when a player connects or disconnects
- `{ type: "pick_received" }` — confirms your pick was registered
- `{ type: "opponent_picked" }` — notifies you the other player has locked in
- `{ type: "result", yourPick, theirPick, outcome: "win"|"lose"|"draw" }`
- `{ type: "play_again" }` — relayed from the other player
- `{ type: "series_start" }` — relayed from the other player

## Frontend screens

Four screens toggled via the `show()` function (sets `hidden` attribute). Each screen fades in via a CSS animation on `:not([hidden])`. The `--duration` CSS variable controls animation speed and is set to `0s` when `prefers-reduced-motion` is active.

- `screen-lobby` — initial screen, "New Game" button
- `screen-waiting` — shown to the game creator while waiting for opponent, displays the shareable URL with Copy and (if supported) Share buttons
- `screen-game` — active play, shows status text + 🪨📄✂️ buttons + series score (when in series mode)
- `screen-result` — shown after each round with outcome, pick detail, and action buttons

A persistent `← Home` footer button is visible on all non-lobby screens. It closes the WebSocket and returns to the lobby.

## Series mode (Best 2 of 3)

- After a non-draw result, a "Best 2 out of 3?" button appears
- Clicking it counts that round as round 1 of the series and notifies the other player via `series_start`
- The first round always counts — clicking "Best 2 out of 3?" doesn't discard it
- Both players land on `screen-result` showing the choice buttons and series score during an active series
- Series score is shown below the buttons on both `screen-game` and `screen-result`
- When someone reaches 2 wins, the headline reads e.g. "You won the series 2-1! 🏆"
- "Best 2 out of 3?" is hidden after a draw (no round to carry forward)
- Series state is client-side only — the server just relays `series_start` and `play_again`

## Key decisions

- **Durable Objects over Pages Functions**: DOs hold WebSocket connections in memory and manage per-room state. Pages Functions are stateless and can't do this.
- **`new_sqlite_classes` migration**: Required for Durable Objects on the free plan (not `new_classes`).
- **No framework**: The UI is simple enough that vanilla JS with `hidden` attribute toggling is sufficient.
- **`sessionStorage` for tokens**: Scoped to the tab, so two tabs don't share tokens and stale entries are cleaned up automatically on tab close.
- **Favicon**: A random emoji (🪨, 📄, or ✂️) is drawn onto a canvas on page load and set as the favicon, also prepended to the `<title>`.

## Local development

```sh
npm run dev   # starts wrangler dev on http://localhost:8787
```

Open two browser tabs to test a full game locally.

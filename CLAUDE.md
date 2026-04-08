# rps-shoot

Online Rock Paper Scissors for two players, built with vanilla JS and Cloudflare Workers.

## Architecture

- **Backend**: `src/worker.js` — a Cloudflare Worker that routes WebSocket connections to a Durable Object (`GameRoom`). Each game room is a separate DO instance identified by a short random ID.
- **Frontend**: `public/` — vanilla HTML/CSS/JS, no framework. Served as static assets by the same Worker.
- **Deployment**: Cloudflare Workers + Durable Objects (free tier). Deploy with `npm run deploy` (runs `wrangler deploy`). Wrangler v4.

The backend and frontend are one deployment unit — there is no separate static host. Cloudflare serves both.

## How a game works

1. Player A clicks "New Game" → a random 6-character room ID is generated → URL updates to `?game={roomId}` → WebSocket connects to `/game/{roomId}`
2. Player A shares the URL with Player B
3. Player B loads the URL → connects to the same Durable Object
4. The DO tracks both WebSocket connections and each player's pick
5. When both players have picked, the DO resolves the round and sends each player a tailored `result` message
6. The DO resets picks after each round — rematches reuse the same connection and room

## WebSocket message types

**Client → Server:**
- `{ type: "pick", pick: "rock"|"paper"|"scissors" }`
- `{ type: "play_again" }` — relayed to the other player
- `{ type: "series_start" }` — relayed to the other player

**Server → Client:**
- `{ type: "player_count", count: 1|2 }`
- `{ type: "pick_received" }` — confirms your pick was registered
- `{ type: "opponent_picked" }` — notifies you the other player has locked in
- `{ type: "result", yourPick, theirPick, outcome: "win"|"lose"|"draw" }`
- `{ type: "play_again" }` — relayed from the other player
- `{ type: "series_start" }` — relayed from the other player

## Frontend screens

Four screens toggled via the `show()` function (sets `hidden` attribute):
- `screen-lobby` — initial screen, "New Game" button
- `screen-waiting` — shown to the game creator while waiting for opponent, displays the shareable URL
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

## Key decisions

- **Durable Objects over Pages Functions**: DOs hold WebSocket connections in memory and manage per-room state. Pages Functions are stateless and can't do this.
- **`new_sqlite_classes` migration**: Required for Durable Objects on the free plan (not `new_classes`).
- **No framework**: The UI is simple enough that vanilla JS with `hidden` attribute toggling is sufficient.
- **Series state is client-side only**: The server is stateless with respect to series mode — it just relays `series_start` and `play_again` messages. Each client tracks its own series wins/losses.

## Local development

```sh
npm run dev   # starts wrangler dev on http://localhost:8787
```

Open two browser tabs to test a full game locally.

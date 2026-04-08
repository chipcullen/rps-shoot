export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/game/")) {
      const roomId = url.pathname.slice(6); // strip /game/
      if (!roomId) return new Response("Missing room ID", { status: 400 });

      const id = env.GAME_ROOM.idFromName(roomId);
      const room = env.GAME_ROOM.get(id);
      return room.fetch(request);
    }

    return new Response("Not found", { status: 404 });
  },
};

export class GameRoom {
  constructor(state) {
    this.state = state;
    this.players = []; // [{ ws, pick }]
  }

  async fetch(request) {
    const upgrade = request.headers.get("Upgrade");
    if (!upgrade || upgrade !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    if (this.players.length >= 2) {
      return new Response("Room full", { status: 409 });
    }

    const { 0: client, 1: server } = new WebSocketPair();
    server.accept();

    const player = { ws: server, pick: null };
    this.players.push(player);
    const playerIndex = this.players.length - 1;

    this.broadcast({ type: "player_count", count: this.players.length });

    server.addEventListener("message", (event) => {
      let data;
      try { data = JSON.parse(event.data); } catch { return; }

      if (data.type === "series_start" || data.type === "play_again") {
        // Relay to the other player only
        for (const p of this.players) {
          if (p !== player) {
            try { p.ws.send(JSON.stringify({ type: data.type })); } catch {}
          }
        }
      } else if (data.type === "pick") {
        const valid = ["rock", "paper", "scissors"];
        if (!valid.includes(data.pick)) return;

        player.pick = data.pick;

        // Let this player know their pick was received
        server.send(JSON.stringify({ type: "pick_received" }));

        // Notify the other player that their opponent has locked in
        for (const p of this.players) {
          if (p !== player) {
            try { p.ws.send(JSON.stringify({ type: "opponent_picked" })); } catch {}
          }
        }

        // If both players have picked, resolve
        if (this.players.length === 2 && this.players[0].pick && this.players[1].pick) {
          const result = resolve(this.players[0].pick, this.players[1].pick);
          this.players[0].ws.send(JSON.stringify({
            type: "result",
            yourPick: this.players[0].pick,
            theirPick: this.players[1].pick,
            outcome: result === 0 ? "draw" : result === 1 ? "win" : "lose",
          }));
          this.players[1].ws.send(JSON.stringify({
            type: "result",
            yourPick: this.players[1].pick,
            theirPick: this.players[0].pick,
            outcome: result === 0 ? "draw" : result === 2 ? "win" : "lose",
          }));
          // Reset picks for rematch
          this.players[0].pick = null;
          this.players[1].pick = null;
        }
      }
    });

    server.addEventListener("close", () => {
      this.players = this.players.filter((p) => p !== player);
      this.broadcast({ type: "player_count", count: this.players.length });
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  broadcast(msg) {
    const text = JSON.stringify(msg);
    for (const p of this.players) {
      try { p.ws.send(text); } catch {}
    }
  }
}

// Returns 0 = draw, 1 = player1 wins, 2 = player2 wins
function resolve(p1, p2) {
  if (p1 === p2) return 0;
  if (
    (p1 === "rock" && p2 === "scissors") ||
    (p1 === "scissors" && p2 === "paper") ||
    (p1 === "paper" && p2 === "rock")
  ) return 1;
  return 2;
}

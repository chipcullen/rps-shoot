export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/game/")) {
      const roomId = url.pathname.slice(6);
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
    // slots: [{ token, ws, pick }] — index 0 = player 1, index 1 = player 2
    // ws is null when that player is disconnected
    this.slots = [];
  }

  async fetch(request) {
    const upgrade = request.headers.get("Upgrade");
    if (!upgrade || upgrade !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    const url = new URL(request.url);
    const token = url.searchParams.get("token");
    if (!token) return new Response("Missing token", { status: 400 });

    // Check if this token belongs to an existing slot (reconnect)
    const existingSlot = this.slots.find((s) => s.token === token);

    // If no existing slot and room is full, reject
    if (!existingSlot && this.slots.length >= 2) {
      return new Response("Room full", { status: 409 });
    }

    const { 0: client, 1: server } = new WebSocketPair();
    server.accept();

    let slot;
    if (existingSlot) {
      // Reconnect: swap in the new WebSocket
      existingSlot.ws = server;
      slot = existingSlot;
    } else {
      // New player: create a slot
      slot = { token, ws: server, pick: null };
      this.slots.push(slot);
    }

    const connectedCount = this.slots.filter((s) => s.ws !== null).length;

    // Send this player their current state
    const reconnectState = {
      type: "reconnected",
      playerIndex: this.slots.indexOf(slot),
      connectedCount,
      yourPick: slot.pick,
      opponentPicked: this.slots.find((s) => s !== slot)?.pick !== null &&
                      this.slots.find((s) => s !== slot)?.pick !== undefined,
    };
    server.send(JSON.stringify(reconnectState));

    // Notify everyone of updated player count
    this.broadcast({ type: "player_count", count: connectedCount });

    server.addEventListener("message", (event) => {
      let data;
      try { data = JSON.parse(event.data); } catch { return; }

      if (data.type === "series_start" || data.type === "play_again") {
        for (const s of this.slots) {
          if (s !== slot && s.ws) {
            try { s.ws.send(JSON.stringify({ type: data.type })); } catch {}
          }
        }
      } else if (data.type === "pick") {
        const valid = ["rock", "paper", "scissors"];
        if (!valid.includes(data.pick)) return;

        slot.pick = data.pick;

        server.send(JSON.stringify({ type: "pick_received" }));

        for (const s of this.slots) {
          if (s !== slot && s.ws) {
            try { s.ws.send(JSON.stringify({ type: "opponent_picked" })); } catch {}
          }
        }

        // Resolve if both players have picked
        if (this.slots.length === 2 && this.slots[0].pick && this.slots[1].pick) {
          const result = resolve(this.slots[0].pick, this.slots[1].pick);
          this.slots[0].ws?.send(JSON.stringify({
            type: "result",
            yourPick: this.slots[0].pick,
            theirPick: this.slots[1].pick,
            outcome: result === 0 ? "draw" : result === 1 ? "win" : "lose",
          }));
          this.slots[1].ws?.send(JSON.stringify({
            type: "result",
            yourPick: this.slots[1].pick,
            theirPick: this.slots[0].pick,
            outcome: result === 0 ? "draw" : result === 2 ? "win" : "lose",
          }));
          this.slots[0].pick = null;
          this.slots[1].pick = null;
        }
      }
    });

    server.addEventListener("close", () => {
      slot.ws = null;
      const connectedCount = this.slots.filter((s) => s.ws !== null).length;
      this.broadcast({ type: "player_count", count: connectedCount });
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  broadcast(msg) {
    const text = JSON.stringify(msg);
    for (const s of this.slots) {
      if (s.ws) {
        try { s.ws.send(text); } catch {}
      }
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

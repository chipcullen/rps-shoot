const WS_BASE =
  location.hostname === "localhost"
    ? "ws://localhost:8787"
    : `wss://${location.hostname}`;

// Screens
const screens = {
  lobby: document.getElementById("screen-lobby"),
  waiting: document.getElementById("screen-waiting"),
  game: document.getElementById("screen-game"),
  result: document.getElementById("screen-result"),
};

function show(name) {
  for (const [key, el] of Object.entries(screens)) {
    el.hidden = key !== name;
  }
}

// Elements
const btnNewGame = document.getElementById("btn-new-game");
const shareUrl = document.getElementById("share-url");
const btnCopy = document.getElementById("btn-copy");
const gameStatus = document.getElementById("game-status");
const choiceBtns = document.querySelectorAll(".choice");
const resultOutcome = document.getElementById("result-outcome");
const resultDetail = document.getElementById("result-detail");
const btnRematch = document.getElementById("btn-rematch");

let ws = null;
let currentRoomId = null;

function generateRoomId() {
  return Math.random().toString(36).slice(2, 8); // e.g. "xk9m2f"
}

function connect(roomId) {
  currentRoomId = roomId;
  ws = new WebSocket(`${WS_BASE}/game/${roomId}`);

  ws.addEventListener("open", () => {
    console.log("WebSocket connected");
  });

  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    handleMessage(msg);
  });

  ws.addEventListener("close", () => {
    if (screens.game.hidden && screens.result.hidden) return;
    gameStatus.textContent = "Opponent disconnected.";
    show("game");
    setChoicesEnabled(false);
  });

  ws.addEventListener("error", () => {
    alert("Connection error. Please try again.");
    show("lobby");
  });
}

function handleMessage(msg) {
  switch (msg.type) {
    case "player_count":
      if (msg.count === 1) {
        // Still waiting (someone disconnected)
        if (!screens.waiting.hidden) return;
        gameStatus.textContent = "Waiting for opponent…";
        show("game");
        setChoicesEnabled(false);
      } else if (msg.count === 2) {
        gameStatus.textContent = "Opponent joined! Make your pick.";
        show("game");
        setChoicesEnabled(true);
      }
      break;

    case "pick_received":
      gameStatus.textContent = "Pick locked in. Waiting for opponent…";
      setChoicesEnabled(false);
      break;

    case "result":
      show("result");
      const labels = {
        rock: "🪨 Rock",
        paper: "📄 Paper",
        scissors: "✂️ Scissors",
      };
      resultDetail.textContent = `You: ${labels[msg.yourPick]} — Them: ${labels[msg.theirPick]}`;
      if (msg.outcome === "win") resultOutcome.textContent = "You win! 🎉";
      else if (msg.outcome === "lose")
        resultOutcome.textContent = "You lose. 😭";
      else resultOutcome.textContent = "Draw!";
      break;
  }
}

function setChoicesEnabled(enabled) {
  choiceBtns.forEach((btn) => (btn.disabled = !enabled));
}

// --- Event listeners ---

btnNewGame.addEventListener("click", () => {
  const roomId = generateRoomId();
  const url = `${location.origin}${location.pathname}?game=${roomId}`;
  shareUrl.value = url;
  history.replaceState(null, "", `?game=${roomId}`);
  show("waiting");
  connect(roomId);
});

btnCopy.addEventListener("click", () => {
  navigator.clipboard.writeText(shareUrl.value).then(() => {
    btnCopy.textContent = "Copied!";
    setTimeout(() => (btnCopy.textContent = "Copy"), 2000);
  });
});

choiceBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    ws.send(JSON.stringify({ type: "pick", pick: btn.dataset.pick }));
  });
});

btnRematch.addEventListener("click", () => {
  gameStatus.textContent = "Make your pick.";
  setChoicesEnabled(true);
  show("game");
});

// --- On load: check for game param ---
const params = new URLSearchParams(location.search);
const roomParam = params.get("game");
if (roomParam) {
  // Joining an existing game
  connect(roomParam);
  gameStatus.textContent = "Connecting…";
  show("game");
  setChoicesEnabled(false);
} else {
  show("lobby");
}

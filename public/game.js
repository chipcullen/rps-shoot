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

const footerHome = document.getElementById("footer-home");

function show(name) {
  for (const [key, el] of Object.entries(screens)) {
    el.hidden = key !== name;
  }
  footerHome.hidden = name === "lobby";
}

// Elements
const btnNewGame = document.getElementById("btn-new-game");
const shareUrl = document.getElementById("share-url");
const btnCopy = document.getElementById("btn-copy");
const gameStatus = document.getElementById("game-status");
const choiceBtns = document.querySelectorAll(".choice");
const resultOutcome = document.getElementById("result-outcome");
const resultDetail = document.getElementById("result-detail");
const seriesScore = document.getElementById("series-score");
const btnRematch = document.getElementById("btn-rematch");
const btnBestOf3 = document.getElementById("btn-best-of-3");
const resultChoices = document.getElementById("result-choices");
const btnGoHome = document.getElementById("btn-go-home");
const gameSeriesScore = document.getElementById("game-series-score");

let ws = null;
let currentRoomId = null;
let seriesMode = false;
let mySeriesWins = 0;
let theirSeriesWins = 0;
let lastOutcome = null;

function generateRoomId() {
  return Math.random().toString(36).slice(2, 8);
}

function startSeries() {
  seriesMode = true;
  mySeriesWins = 0;
  theirSeriesWins = 0;
}

function clearSeriesState() {
  seriesMode = false;
  mySeriesWins = 0;
  theirSeriesWins = 0;
  seriesScore.hidden = true;
  gameSeriesScore.hidden = true;
}

function resetSeries() {
  clearSeriesState();
  seriesScore.hidden = true;
  gameSeriesScore.hidden = true;
}

function showSeriesScore() {
  const text = `You ${mySeriesWins} — Them ${theirSeriesWins}`;
  seriesScore.textContent = text;
  seriesScore.hidden = false;
  gameSeriesScore.textContent = text;
  gameSeriesScore.hidden = false;
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
    resetSeries();
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

    case "play_again":
      resetSeries();
      resultOutcome.textContent = "Opponent wants to play again!";
      resultDetail.textContent = "Make your pick:";
      btnRematch.hidden = true;
      btnBestOf3.hidden = true;
      resultChoices.hidden = false;
      setChoicesEnabled(true);
      show("result");
      break;

    case "series_start":
      startSeries();
      // The round just played counts as round 1 for this player too
      if (lastOutcome === "win") mySeriesWins++;
      else if (lastOutcome === "lose") theirSeriesWins++;
      showSeriesScore();
      resultOutcome.textContent = "Opponent wants to play Best 2 of 3!";
      resultDetail.textContent = "Make your pick:";
      btnRematch.hidden = true;
      btnBestOf3.hidden = true;
      resultChoices.hidden = false;
      setChoicesEnabled(true);
      show("result");
      break;

    case "pick_received":
      gameStatus.textContent = "Pick locked in. Waiting for opponent…";
      setChoicesEnabled(false);
      break;

    case "opponent_picked":
      if (!screens.result.hidden) {
        resultDetail.textContent = "Opponent is locked in. Make your pick!";
      } else {
        gameStatus.textContent = "Opponent is locked in. Make your pick!";
      }
      break;

    case "result": {
      const labels = {
        rock: "🪨 Rock",
        paper: "📄 Paper",
        scissors: "✂️ Scissors",
      };
      resultDetail.textContent = `You: ${labels[msg.yourPick]} — Them: ${labels[msg.theirPick]}`;

      lastOutcome = msg.outcome;

      if (msg.outcome === "win") resultOutcome.textContent = "You win! 🎉";
      else if (msg.outcome === "lose")
        resultOutcome.textContent = "You lose. 😭";
      else resultOutcome.textContent = "Draw!";

      if (seriesMode) {
        if (msg.outcome === "win") mySeriesWins++;
        else if (msg.outcome === "lose") theirSeriesWins++;

        const decided = mySeriesWins === 2 || theirSeriesWins === 2;

        if (decided) {
          resultOutcome.textContent =
            mySeriesWins === 2
              ? `You won ${mySeriesWins}-${theirSeriesWins}! 🏆`
              : `You lost ${mySeriesWins}-${theirSeriesWins}. 😭😭`;
          clearSeriesState();
          btnRematch.hidden = false;
          btnBestOf3.hidden = true;
          resultChoices.hidden = true;
        } else {
          showSeriesScore();
          btnRematch.hidden = true;
          btnBestOf3.hidden = true;
          resultChoices.hidden = false;
          setChoicesEnabled(true);
        }
      } else {
        seriesScore.hidden = true;
        btnRematch.hidden = false;
        btnBestOf3.hidden = msg.outcome === "draw";
        resultChoices.hidden = true;
      }

      show("result");
      break;
    }
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
    if (!screens.result.hidden) {
      gameStatus.textContent = "Make your pick.";
      show("game");
    }
    ws.send(JSON.stringify({ type: "pick", pick: btn.dataset.pick }));
  });
});

btnRematch.addEventListener("click", () => {
  resetSeries();
  ws.send(JSON.stringify({ type: "play_again" }));
  gameStatus.textContent = "Make your pick.";
  setChoicesEnabled(true);
  show("game");
});

btnBestOf3.addEventListener("click", () => {
  startSeries();
  // The round just played counts as round 1
  if (lastOutcome === "win") mySeriesWins++;
  else if (lastOutcome === "lose") theirSeriesWins++;
  ws.send(JSON.stringify({ type: "series_start" }));
  resultOutcome.textContent = "Best 2 out of 3!";
  resultDetail.textContent = "Make your pick:";
  btnRematch.hidden = true;
  btnBestOf3.hidden = true;
  resultChoices.hidden = false;
  setChoicesEnabled(true);
  showSeriesScore();
  show("result");
});

btnGoHome.addEventListener("click", () => {
  if (ws) {
    ws.close();
    ws = null;
  }
  resetSeries();
  history.replaceState(null, "", location.pathname);
  show("lobby");
});

// --- On load: check for game param ---
const params = new URLSearchParams(location.search);
const roomParam = params.get("game");
if (roomParam) {
  connect(roomParam);
  gameStatus.textContent = "Connecting…";
  show("game");
  setChoicesEnabled(false);
} else {
  show("lobby");
}

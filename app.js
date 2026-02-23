const DESKTOP_COLS = 25;
const DESKTOP_ROWS = 15;
const MOBILE_COLS = 15;
const MOBILE_ROWS = 25;
const COLORS = ["#f44336", "#2196f3", "#ffeb3b", "#4caf50", "#9c27b0"];
const START_TIME = 120;
const PENALTY_SECONDS = 10;

const state = {
  board: [],
  cols: DESKTOP_COLS,
  rows: DESKTOP_ROWS,
  score: 0,
  timeLeft: START_TIME,
  mode: "timed",
  timerStarted: false,
  timerId: null,
  ended: false,
};

const boardEl = document.getElementById("board");
const scoreEl = document.getElementById("score");
const timeEl = document.getElementById("time");
const remainingEl = document.getElementById("remaining");
const modeEl = document.getElementById("mode");
const boardShapeEl = document.getElementById("board-shape");
const restartEl = document.getElementById("restart");
const messageEl = document.getElementById("message");

let audioCtx = null;

function ensureAudioContext() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) {
      return;
    }
    audioCtx = new Ctx();
  }

  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
}

function playTone(freq, duration, options = {}) {
  if (!audioCtx) {
    return;
  }

  const type = options.type || "sine";
  const volume = options.volume || 0.05;
  const delay = options.delay || 0;

  const start = audioCtx.currentTime + delay;
  const end = start + duration;

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);

  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  osc.start(start);
  osc.stop(end + 0.01);
}

function playSuccessSound(hitCount) {
  if (!audioCtx) {
    return;
  }

  playTone(520, 0.08, { type: "triangle", volume: 0.045 });
  playTone(Math.min(900, 620 + hitCount * 18), 0.1, {
    type: "triangle",
    volume: 0.05,
    delay: 0.06,
  });
}

function playMissSound() {
  if (!audioCtx) {
    return;
  }

  playTone(180, 0.12, { type: "square", volume: 0.035 });
}

function playGameOverSound() {
  if (!audioCtx) {
    return;
  }

  playTone(420, 0.12, { type: "sawtooth", volume: 0.03, delay: 0.01 });
  playTone(280, 0.14, { type: "sawtooth", volume: 0.03, delay: 0.11 });
  playTone(200, 0.16, { type: "sawtooth", volume: 0.03, delay: 0.23 });
}

function randomColor() {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

function updateBoardDimensions() {
  if (boardShapeEl.value === "portrait") {
    state.cols = MOBILE_COLS;
    state.rows = MOBILE_ROWS;
    return;
  }
  state.cols = DESKTOP_COLS;
  state.rows = DESKTOP_ROWS;
}

function initBoard() {
  do {
    state.board = Array.from({ length: state.rows }, () =>
      Array.from({ length: state.cols }, randomColor)
    );
    const centerX = Math.floor(state.cols / 2);
    const centerY = Math.floor(state.rows / 2);
    state.board[centerY][centerX] = null;
  } while (!hasAnyPlayableMove());
}

function startTimer() {
  if (state.mode !== "timed") {
    timeEl.textContent = "∞";
    return;
  }
  if (state.timerStarted) {
    return;
  }

  state.timerStarted = true;
  stopTimer();

  state.timerId = setInterval(() => {
    if (state.ended) {
      return;
    }
    state.timeLeft -= 1;
    if (state.timeLeft <= 0) {
      state.timeLeft = 0;
      endGame("時間切れです");
    }
    renderStats();
  }, 1000);
}

function stopTimer() {
  if (state.timerId) {
    clearInterval(state.timerId);
    state.timerId = null;
  }
}

function renderStats() {
  scoreEl.textContent = String(state.score);
  timeEl.textContent = state.mode === "timed" ? String(state.timeLeft) : "∞";
  remainingEl.textContent = String(countRemainingTiles());
}

function countRemainingTiles() {
  let count = 0;
  for (let y = 0; y < state.rows; y += 1) {
    for (let x = 0; x < state.cols; x += 1) {
      if (state.board[y][x]) {
        count += 1;
      }
    }
  }
  return count;
}

function setMessage(text, kind = "") {
  messageEl.textContent = text;
  messageEl.className = kind;
}

function scanNearestTile(x, y, dx, dy) {
  let cx = x + dx;
  let cy = y + dy;
  while (cx >= 0 && cx < state.cols && cy >= 0 && cy < state.rows) {
    const color = state.board[cy][cx];
    if (color) {
      return { x: cx, y: cy, color };
    }
    cx += dx;
    cy += dy;
  }
  return null;
}

function pickRemovableTiles(x, y) {
  const nearest = [
    scanNearestTile(x, y, 1, 0),
    scanNearestTile(x, y, -1, 0),
    scanNearestTile(x, y, 0, 1),
    scanNearestTile(x, y, 0, -1),
  ].filter(Boolean);

  const colorCount = new Map();
  for (const tile of nearest) {
    colorCount.set(tile.color, (colorCount.get(tile.color) || 0) + 1);
  }

  return nearest.filter((tile) => (colorCount.get(tile.color) || 0) >= 2);
}

function hasAnyPlayableMove() {
  for (let y = 0; y < state.rows; y += 1) {
    for (let x = 0; x < state.cols; x += 1) {
      if (state.board[y][x] === null && pickRemovableTiles(x, y).length > 0) {
        return true;
      }
    }
  }
  return false;
}

function handleTap(x, y) {
  ensureAudioContext();

  if (state.ended) {
    return;
  }
  if (state.board[y][x] !== null) {
    return;
  }

  const removable = pickRemovableTiles(x, y);
  if (removable.length === 0) {
    playMissSound();
    if (state.mode === "timed" && state.timerStarted) {
      state.timeLeft = Math.max(0, state.timeLeft - PENALTY_SECONDS);
      if (state.timeLeft === 0) {
        endGame("時間切れです");
      }
    }
    setMessage(
      state.mode === "timed" && !state.timerStarted
        ? "消せる組み合わせがありません（最初の消去成功でタイム開始）"
        : "消せる組み合わせがありません（タイムアタック時は-10秒）",
      "warn"
    );
    renderStats();
    return;
  }

  for (const tile of removable) {
    state.board[tile.y][tile.x] = null;
  }
  state.score += removable.length;
  playSuccessSound(removable.length);
  if (state.mode === "timed" && !state.timerStarted) {
    startTimer();
  }
  setMessage(`${removable.length} タイル獲得`, "ok");

  renderBoard();
  renderStats();

  const remaining = countRemainingTiles();
  if (remaining === 0) {
    endGame("全消し達成！");
    return;
  }

  if (!hasAnyPlayableMove()) {
    endGame("これ以上消せる場所がありません");
  }
}

function renderBoard() {
  boardEl.style.setProperty("--cols", String(state.cols));
  boardEl.innerHTML = "";

  for (let y = 0; y < state.rows; y += 1) {
    for (let x = 0; x < state.cols; x += 1) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cell";
      btn.setAttribute("aria-label", `x:${x + 1}, y:${y + 1}`);

      const color = state.board[y][x];
      if (color) {
        btn.style.background = color;
        btn.disabled = true;
        btn.style.cursor = "default";
      } else {
        btn.classList.add("empty");
        btn.addEventListener("click", () => handleTap(x, y));
      }

      boardEl.appendChild(btn);
    }
  }
}

function endGame(reason) {
  state.ended = true;
  stopTimer();
  playGameOverSound();
  setMessage(`ゲーム終了: ${reason} / スコア ${state.score}`, "warn");
}

function resetGame() {
  ensureAudioContext();
  updateBoardDimensions();
  state.score = 0;
  state.timeLeft = START_TIME;
  state.mode = modeEl.value;
  state.timerStarted = false;
  state.ended = false;
  stopTimer();
  initBoard();
  renderBoard();
  renderStats();
  setMessage(
    state.mode === "timed" ? "最初にタイルを消すとカウントダウン開始" : "",
    state.mode === "timed" ? "ok" : ""
  );
}

restartEl.addEventListener("click", resetGame);
modeEl.addEventListener("change", resetGame);
boardShapeEl.addEventListener("change", resetGame);

boardShapeEl.value = "portrait";

resetGame();

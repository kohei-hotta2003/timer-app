const timerEl     = document.getElementById("timer");
const startButton = document.getElementById("start");
const stopButton  = document.getElementById("stop");
const resetButton = document.getElementById("reset");

const STORAGE_KEY = "timerState";

if (!timerEl || !startButton || !stopButton || !resetButton) {
  console.error("Required elements not found: #timer, #start, #stop, #reset");
} else {
  let accumulatedTimeMs     = 0;
  let isRunning             = false;
  let lastStartEpochMs      = null;
  let startPerfMs           = null;
  let rafHandle             = null;

  let lastRenderedTimeText  = null;

  function formatTime(ms) {
    const totalSec = Math.floor(ms / 1000);
    const hh = String(Math.floor(totalSec / 3600)).padStart(2, "0");
    const mm = String(Math.floor((totalSec % 3600) / 60)).padStart(2, "0");
    const ss = String(totalSec % 60).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  }

  function render(totalMs) {
    const text = formatTime(totalMs);
    if (text === lastRenderedTimeText) return;
    lastRenderedTimeText = text;
    timerEl.innerText = text;
    document.title = `${text} – Timer`;
  }

  function persist() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ elapsedMs: accumulatedTimeMs, running: isRunning, lastStartAt: lastStartEpochMs })
      );
    } catch (e) {
      console.warn("Persist failed:", e);
    }
  }

  function reflectButtons() {
    startButton.disabled = false;
    stopButton.disabled  = false;
    startButton.setAttribute("aria-pressed", isRunning ? "true" : "false");
    stopButton.setAttribute("aria-pressed",  isRunning ? "false" : "true");
    startButton.classList.toggle("is-active", isRunning);
    stopButton.classList.toggle("is-active", !isRunning);
  }

  function tick() {
    const runningMs =
      isRunning && startPerfMs !== null ? performance.now() - startPerfMs : 0;
    const totalMs = Math.max(0, Math.floor(accumulatedTimeMs + runningMs));
    render(totalMs);
    if (isRunning) {
      rafHandle = requestAnimationFrame(tick);
    } else {
      rafHandle = null;
    }
  }

  function startTimer() {
    if (isRunning) return;
    isRunning = true;
    lastStartEpochMs = Date.now();
    startPerfMs = performance.now();
    reflectButtons();
    persist();
    if (!rafHandle) rafHandle = requestAnimationFrame(tick);
  }

  function stopTimer() {
    if (!isRunning) return;
    if (startPerfMs !== null) {
      accumulatedTimeMs += performance.now() - startPerfMs;
    }
    isRunning = false;
    startPerfMs = null;
    lastStartEpochMs = null;
    reflectButtons();
    persist();
    render(accumulatedTimeMs);
  }

  function resetTimer() {
    if (isRunning) stopTimer();
    accumulatedTimeMs = 0;
    lastStartEpochMs = null;
    startPerfMs = null;
    lastRenderedTimeText = null;
    render(0);
    reflectButtons();
    persist();
  }

  (function restore() {
    try {
      const storedJson = localStorage.getItem(STORAGE_KEY);
      if (storedJson) {
        const savedState = JSON.parse(storedJson);
        if (typeof savedState.elapsedMs === "number") accumulatedTimeMs = savedState.elapsedMs;
        if (typeof savedState.running === "boolean") isRunning = savedState.running;
        if (Number.isFinite(savedState.lastStartAt)) lastStartEpochMs = savedState.lastStartAt;
      }
      if (isRunning && lastStartEpochMs) {
        accumulatedTimeMs += Math.max(0, Date.now() - lastStartEpochMs);
        startPerfMs = performance.now();
        if (!rafHandle) rafHandle = requestAnimationFrame(tick);
      } else {
        isRunning = false;
        render(accumulatedTimeMs);
      }
    } catch (e) {
      console.warn("Restore failed, fallback to zero:", e);
      accumulatedTimeMs = 0; isRunning = false; lastStartEpochMs = null; startPerfMs = null;
      render(0);
    } finally {
      reflectButtons();
    }
  })();

  startButton.addEventListener("click", startTimer);
  stopButton .addEventListener("click", stopTimer);
  resetButton.addEventListener("click", resetTimer);

  window.addEventListener("keydown", (e) => {
    const targetTag = (e.target && e.target.tagName) || "";
    if (targetTag === "INPUT" || targetTag === "TEXTAREA" || targetTag === "SELECT" || e.isComposing) return;
    if (e.code === "Space") { e.preventDefault(); isRunning ? stopTimer() : startTimer(); }
    if (e.key.toLowerCase() === "r") { e.preventDefault(); resetTimer(); }
  });

  window.addEventListener("beforeunload", () => {
    try {
      if (isRunning && startPerfMs !== null) {
        const total = accumulatedTimeMs + (performance.now() - startPerfMs);
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ elapsedMs: Math.floor(total), running: true, lastStartAt: Date.now() })
        );
      } else {
        persist();
      }
    } catch {}
  });

  render(accumulatedTimeMs);
}

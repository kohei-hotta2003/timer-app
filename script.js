// ------- 初期参照: UI要素の取得（存在検証つき） -------
const timerEl     = document.getElementById("timer");
const startButton = document.getElementById("start");
const stopButton  = document.getElementById("stop");
const resetButton = document.getElementById("reset");

// LocalStorage用キー（状態の永続化: リロード/再訪問に強い）
const STORAGE_KEY = "timerState";

// 必須要素が見つからない場合は早期ログ出し（フェイルファスト）
if (!timerEl || !startButton || !stopButton || !resetButton) {
  console.error("Required elements not found: #timer, #start, #stop, #reset");
} else {
  // ------- アプリ内状態 -------
  // 累積ミリ秒（停止中も保持） / 実行中フラグ / 前回開始時刻 / 高精度開始時刻 / RAFハンドル
  let accumulatedTimeMs     = 0;
  let isRunning             = false;
  let lastStartEpochMs      = null;   // Date.now() ベース（復元のため保持）
  let startPerfMs           = null;   // performance.now() ベース（ドリフト低減）
  let rafHandle             = null;

  // 直近描画文字列（無駄なDOM更新を避ける＝パフォーマンス最適化）
  let lastRenderedTimeText  = null;

  // ------- 表示フォーマット（00:00:00） -------
  function formatTime(ms) {
    const totalSec = Math.floor(ms / 1000);
    const hh = String(Math.floor(totalSec / 3600)).padStart(2, "0");
    const mm = String(Math.floor((totalSec % 3600) / 60)).padStart(2, "0");
    const ss = String(totalSec % 60).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  }

  // ------- 画面描画（同一値はスキップしCPU/バッテリー負荷を軽減） -------
  function render(totalMs) {
    const text = formatTime(totalMs);
    if (text === lastRenderedTimeText) return;
    lastRenderedTimeText = text;
    timerEl.innerText = text;
    // ドキュメントタイトルにも反映（タブに時間表示＝UX向上）
    document.title = `${text} – Timer`;
  }

  // ------- 状態の永続化（LocalStorage） -------
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

  // ------- ボタン状態の反映（アクセシビリティ配慮: aria-pressed） -------
  function reflectButtons() {
    startButton.disabled = false;
    stopButton.disabled  = false;
    startButton.setAttribute("aria-pressed", isRunning ? "true" : "false");
    stopButton.setAttribute("aria-pressed",  isRunning ? "false" : "true");
    startButton.classList.toggle("is-active", isRunning);
    stopButton.classList.toggle("is-active", !isRunning);
  }

  // ------- 毎フレーム更新（requestAnimationFrameでスムーズに） -------
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

  // ------- 開始：二重開始防止・高精度計測開始・保存・RAF起動 -------
  function startTimer() {
    if (isRunning) return;
    isRunning = true;
    lastStartEpochMs = Date.now();        // 復元用（スリープ/タブ復帰でもズレにくい）
    startPerfMs = performance.now();      // 表示用の高精度カウンタ
    reflectButtons();
    persist();
    if (!rafHandle) rafHandle = requestAnimationFrame(tick);
  }

  // ------- 停止：経過を累積に反映・状態保存・最終描画 -------
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

  // ------- リセット：実行中なら停止→ゼロクリア→UI反映・保存 -------
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

  // ------- 起動時復元：前回実行中だった場合の継続にも対応 -------
  (function restore() {
    try {
      const storedJson = localStorage.getItem(STORAGE_KEY);
      if (storedJson) {
        const savedState = JSON.parse(storedJson);
        if (typeof savedState.elapsedMs === "number") accumulatedTimeMs = savedState.elapsedMs;
        if (typeof savedState.running === "boolean") isRunning = savedState.running;
        if (Number.isFinite(savedState.lastStartAt)) lastStartEpochMs = savedState.lastStartAt;
      }
      // 前回「実行中」で保存されていれば、その分を補正して継続
      if (isRunning && lastStartEpochMs) {
        accumulatedTimeMs += Math.max(0, Date.now() - lastStartEpochMs);
        startPerfMs = performance.now();
        if (!rafHandle) rafHandle = requestAnimationFrame(tick);
      } else {
        isRunning = false;
        render(accumulatedTimeMs);
      }
    } catch (e) {
      // 壊れた保存データ等は握りつぶしてクリーンスタート（UX優先）
      console.warn("Restore failed, fallback to zero:", e);
      accumulatedTimeMs = 0; isRunning = false; lastStartEpochMs = null; startPerfMs = null;
      render(0);
    } finally {
      reflectButtons();
    }
  })();

  // ------- クリック操作 -------
  startButton.addEventListener("click", startTimer);
  stopButton .addEventListener("click", stopTimer);
  resetButton.addEventListener("click", resetTimer);

  // ------- キーボード操作（Spaceで開始/停止、Rでリセット） -------
  // 入力中（フォーム要素/日本語変換中）はショートカット無効化＝誤操作防止
  window.addEventListener("keydown", (e) => {
    const targetTag = (e.target && e.target.tagName) || "";
    if (targetTag === "INPUT" || targetTag === "TEXTAREA" || targetTag === "SELECT" || e.isComposing) return;
    if (e.code === "Space") { e.preventDefault(); isRunning ? stopTimer() : startTimer(); }
    if (e.key.toLowerCase() === "r") { e.preventDefault(); resetTimer(); }
  });

  // ------- ページ離脱時の最終保存（実行中のズレを最小化） -------
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

  // 初期描画（0表示 or 復元値）
  render(accumulatedTimeMs);
}

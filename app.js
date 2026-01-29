// ---------- Theme (light/dark) ----------
const THEME_KEY = "json_flashcards_theme_v1";
const themeToggle = document.getElementById("themeToggle");
const themeLabel = document.getElementById("themeLabel");

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  themeToggle.checked = theme === "dark";
  themeLabel.textContent = theme === "dark" ? "Dark" : "Light";
  localStorage.setItem(THEME_KEY, theme);
}

(function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === "light" || saved === "dark") {
    applyTheme(saved);
    return;
  }
  // Default: match OS preference
  const prefersDark =
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(prefersDark ? "dark" : "light");
})();

themeToggle.addEventListener("change", () => {
  applyTheme(themeToggle.checked ? "dark" : "light");
});

// ---------- Utilities ----------
const STORAGE_KEY = "json_flashcards_deck_v1";

function safeString(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  return JSON.stringify(v, null, 2);
}

function normalizeKeys(obj) {
  const keyMap = [
    ["front", "front"],
    ["back", "back"],
    ["q", "front"],
    ["a", "back"],
    ["question", "front"],
    ["answer", "back"],
    ["prompt", "front"],
    ["response", "back"],
    ["term", "front"],
    ["definition", "back"],
    ["title", "front"],
    ["content", "back"],
  ];

  const lower = {};
  for (const k of Object.keys(obj)) lower[k.toLowerCase()] = k;

  const out = { front: "", back: "" };
  for (const [from, to] of keyMap) {
    if (lower[from]) out[to] = safeString(obj[lower[from]]);
  }

  if (!out.front || !out.back) {
    const entries = Object.entries(obj);
    if (entries.length >= 2) {
      if (!out.front) out.front = safeString(entries[0][1]);
      if (!out.back) out.back = safeString(entries[1][1]);
    } else if (entries.length === 1) {
      if (!out.front) out.front = entries[0][0];
      if (!out.back) out.back = safeString(entries[0][1]);
    }
  }

  return out;
}

function parseIntoDeck(anyJson) {
  const deck = [];

  if (Array.isArray(anyJson)) {
    for (const item of anyJson) {
      if (Array.isArray(item)) {
        const front = safeString(item[0]);
        const back = safeString(item[1]);
        if (front || back) deck.push({ front, back });
      } else if (item && typeof item === "object") {
        const { front, back } = normalizeKeys(item);
        if (front || back) deck.push({ front, back });
      } else {
        const front = safeString(item);
        if (front) deck.push({ front, back: "" });
      }
    }
    return deck;
  }

  if (anyJson && typeof anyJson === "object") {
    const keys = Object.keys(anyJson).map((k) => k.toLowerCase());
    const looksLikeCard =
      keys.includes("front") ||
      keys.includes("question") ||
      keys.includes("term") ||
      keys.includes("q");
    if (looksLikeCard) {
      const { front, back } = normalizeKeys(anyJson);
      if (front || back) return [{ front, back }];
    }

    for (const [k, v] of Object.entries(anyJson)) {
      const front = safeString(k);
      const back = safeString(v);
      if (front || back) deck.push({ front, back });
    }
    return deck;
  }

  throw new Error("JSON must be an array or an object.");
}

function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- State ----------
let deck = [];
let viewOrder = [];
let current = 0;
let showingFront = true;
let isShuffled = false;

// ---------- Elements ----------
const jsonInput = document.getElementById("jsonInput");
const loadBtn = document.getElementById("loadBtn");
const exampleBtn = document.getElementById("exampleBtn");
const exportBtn = document.getElementById("exportBtn");
const clearBtn = document.getElementById("clearBtn");

const errorBox = document.getElementById("errorBox");
const deckCountPill = document.getElementById("deckCountPill");
const storagePill = document.getElementById("storagePill");

const indexPill = document.getElementById("indexPill");
const shuffledPill = document.getElementById("shuffledPill");
const progressFill = document.getElementById("progressFill");

const bigCard = document.getElementById("bigCard");
const faceLabel = document.getElementById("faceLabel");
const faceText = document.getElementById("faceText");
const smallNote = document.getElementById("smallNote");

const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const flipBtn = document.getElementById("flipBtn");
const shuffleBtn = document.getElementById("shuffleBtn");

// ---------- UI Helpers ----------
function setError(msg) {
  if (!msg) {
    errorBox.style.display = "none";
    errorBox.textContent = "";
  } else {
    errorBox.style.display = "block";
    errorBox.textContent = msg;
  }
}

function updatePills() {
  deckCountPill.textContent = `${deck.length} card${deck.length === 1 ? "" : "s"}`;

  const saved = !!localStorage.getItem(STORAGE_KEY);
  storagePill.textContent = saved
    ? "localStorage: saved"
    : "localStorage: empty";

  const total = viewOrder.length;
  indexPill.textContent = total
    ? `Card ${current + 1} / ${total}`
    : "Card 0 / 0";

  shuffledPill.textContent = isShuffled ? "order: shuffled" : "order: normal";

  const pct = total ? ((current + 1) / total) * 100 : 0;
  progressFill.style.width = `${pct}%`;
}

function currentCard() {
  if (!deck.length || !viewOrder.length) return null;
  const idx = viewOrder[current];
  return deck[idx] || null;
}

function renderCard() {
  const card = currentCard();
  updatePills();

  if (!card) {
    faceLabel.textContent = "Front";
    faceText.textContent = "Load a deck to begin";
    smallNote.textContent =
      "Tip: paste JSON on the left, then click “Load Deck”.";
    return;
  }

  const side = showingFront ? "Front" : "Back";
  faceLabel.textContent = side;

  const text = showingFront ? card.front : card.back;
  faceText.textContent =
    text || (showingFront ? "(empty front)" : "(empty back)");
  smallNote.textContent = "Click card to flip • Space flips • ←/→ navigate";
}

function setDeck(newDeck, save = true) {
  deck = newDeck;
  viewOrder = deck.map((_, i) => i);
  current = 0;
  showingFront = true;
  isShuffled = false;

  if (save) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(deck));
  }
  updatePills();
  renderCard();
}

function go(delta) {
  if (!viewOrder.length) return;
  current = (current + delta + viewOrder.length) % viewOrder.length;
  showingFront = true;
  renderCard();
}

function flip() {
  if (!viewOrder.length) return;
  showingFront = !showingFront;
  renderCard();
}

function toggleShuffle() {
  if (!deck.length) return;
  isShuffled = !isShuffled;

  viewOrder = isShuffled
    ? shuffleArray(deck.map((_, i) => i))
    : deck.map((_, i) => i);

  // Reset to beginning of deck after shuffle/unshuffle
  current = 0;
  showingFront = true;
  renderCard();
}

// ---------- Actions ----------
loadBtn.addEventListener("click", () => {
  try {
    setError("");
    const raw = jsonInput.value.trim();
    if (!raw) throw new Error("Paste some JSON first.");

    const parsed = JSON.parse(raw);
    const newDeck = parseIntoDeck(parsed);

    if (!newDeck.length) throw new Error("No cards found in that JSON.");
    setDeck(newDeck, true);
  } catch (e) {
    setError(String(e?.message || e));
  }
});

exampleBtn.addEventListener("click", () => {
  const example = [
    {
      front: "Plot",
      back: "The sequence of events in a story (what happens).",
    },
    {
      front: "Diegetic music",
      back: "Music that exists in the story world and can be heard by characters.",
    },
    {
      front: "Non-diegetic music",
      back: "Music added for the audience (score/underscore), not heard by characters.",
    },
    [
      "Leitmotif",
      "A recurring musical idea linked to a character, place, or concept.",
    ],
  ];
  jsonInput.value = JSON.stringify(example, null, 2);
  setError("");
});

exportBtn.addEventListener("click", async () => {
  try {
    setError("");
    if (!deck.length) throw new Error("No deck loaded to export.");

    const text = JSON.stringify(deck, null, 2);
    await navigator.clipboard.writeText(text);
    exportBtn.textContent = "Copied!";
    setTimeout(() => (exportBtn.textContent = "Export Current Deck"), 900);
  } catch (e) {
    jsonInput.value = JSON.stringify(deck, null, 2);
    setError(
      "Clipboard copy failed in this browser/session. I put the exported deck JSON into the textarea instead.",
    );
  }
});

clearBtn.addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEY);
  deck = [];
  viewOrder = [];
  current = 0;
  showingFront = true;
  isShuffled = false;
  updatePills();
  renderCard();
  setError("");
});

prevBtn.addEventListener("click", () => go(-1));
nextBtn.addEventListener("click", () => go(1));
flipBtn.addEventListener("click", () => flip());
shuffleBtn.addEventListener("click", () => toggleShuffle());

bigCard.addEventListener("click", () => flip());

window.addEventListener("keydown", (e) => {
  const key = e.key.toLowerCase();
  if (key === "arrowleft") {
    e.preventDefault();
    go(-1);
  } else if (key === "arrowright") {
    e.preventDefault();
    go(1);
  } else if (key === " " || key === "spacebar") {
    e.preventDefault();
    flip();
  } else if (key === "s") {
    toggleShuffle();
  }
});

// ---------- Load saved deck on startup ----------
(function initDeck() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        deck = parsed.map((x) => ({
          front: safeString(x?.front ?? ""),
          back: safeString(x?.back ?? ""),
        }));
        viewOrder = deck.map((_, i) => i);
      }
    } catch { }
  }
  updatePills();
  renderCard();
})();

// ---------- Quiz Mode ----------

// Quiz State
let quizMode = false; // false = study, true = quiz
let quizType = "multipleChoice"; // "multipleChoice" or "writeIn"
let score = 0;
let streak = 0;
let bestStreak = 0;
let correctCount = 0;
let answeredCount = 0;
let missedCards = []; // indices of cards answered incorrectly
let currentChoices = []; // for multiple choice
let correctChoiceIndex = -1;
let quizCardIndex = 0; // current position in quiz
let waitingForNext = false; // after answering, waiting to go to next

// Quiz Elements
const studyModeBtn = document.getElementById("studyModeBtn");
const quizModeBtn = document.getElementById("quizModeBtn");
const quizTypeToggle = document.getElementById("quizTypeToggle");
const multipleChoiceBtn = document.getElementById("multipleChoiceBtn");
const writeInBtn = document.getElementById("writeInBtn");
const scoreDisplay = document.getElementById("scoreDisplay");
const scorePill = document.getElementById("scorePill");
const streakPill = document.getElementById("streakPill");

const quizAnswers = document.getElementById("quizAnswers");
const choiceGrid = document.getElementById("choiceGrid");
const choiceBtns = document.querySelectorAll(".choiceBtn");

const writeInArea = document.getElementById("writeInArea");
const writeInInput = document.getElementById("writeInInput");
const submitAnswerBtn = document.getElementById("submitAnswerBtn");
const showAnswerBtn = document.getElementById("showAnswerBtn");

const quizFeedback = document.getElementById("quizFeedback");
const feedbackText = document.getElementById("feedbackText");
const nextQuizBtn = document.getElementById("nextQuizBtn");

const summaryModal = document.getElementById("summaryModal");
const finalScore = document.getElementById("finalScore");
const finalAccuracy = document.getElementById("finalAccuracy");
const finalStreak = document.getElementById("finalStreak");
const finalCards = document.getElementById("finalCards");
const restartQuizBtn = document.getElementById("restartQuizBtn");
const retryMissedBtn = document.getElementById("retryMissedBtn");
const backToStudyBtn = document.getElementById("backToStudyBtn");

// Study controls that should be hidden in quiz mode
const studyControls = document.querySelector(".studyControls");

// ---------- Quiz Helpers ----------

function normalizeAnswer(str) {
  return str.toLowerCase().trim().replace(/\s+/g, " ");
}

function fuzzyMatch(userAnswer, correctAnswer) {
  const user = normalizeAnswer(userAnswer);
  const correct = normalizeAnswer(correctAnswer);

  // Exact match
  if (user === correct) return true;

  // Check if user answer contains most of the correct answer
  const correctWords = correct.split(" ");
  const userWords = user.split(" ");

  // If correct answer is short, require exact match
  if (correctWords.length <= 2) {
    return user === correct;
  }

  // For longer answers, check word overlap (at least 80%)
  const matchedWords = correctWords.filter(w => userWords.includes(w));
  return matchedWords.length >= correctWords.length * 0.8;
}

function generateChoices(correctIndex) {
  // Get all other card backs as potential wrong answers
  const others = deck
    .map((card, i) => ({ back: card.back, index: i }))
    .filter((item) => item.index !== correctIndex && item.back.trim());

  // Shuffle and pick 3
  const shuffledOthers = shuffleArray(others).slice(0, 3);

  // Create choices array with correct answer
  const choices = shuffledOthers.map((item) => item.back);

  // If we don't have enough wrong answers, fill with placeholders
  while (choices.length < 3) {
    choices.push("(No other answer available)");
  }

  // Add correct answer at random position
  const correctPos = Math.floor(Math.random() * 4);
  choices.splice(correctPos, 0, deck[correctIndex].back);

  return { choices, correctPos };
}

function updateScoreDisplay() {
  scorePill.textContent = `🏆 ${score} pts`;
  streakPill.textContent = `🔥 ${streak}`;
}

function triggerStreakAnimation() {
  streakPill.classList.remove("fire");
  void streakPill.offsetWidth; // Force reflow
  streakPill.classList.add("fire");
}

function awardPoints(correct) {
  if (correct) {
    correctCount++;
    streak++;
    if (streak > bestStreak) bestStreak = streak;

    // Base points
    let points = 10;

    // Streak bonuses
    if (streak >= 10) {
      points += 20;
      triggerStreakAnimation();
    } else if (streak >= 5) {
      points += 10;
      triggerStreakAnimation();
    } else if (streak >= 3) {
      points += 5;
      triggerStreakAnimation();
    }

    score += points;
  } else {
    streak = 0;
  }
  answeredCount++;
  updateScoreDisplay();
}

function showQuizFeedback(correct, correctAnswer) {
  feedbackText.className = "feedbackText " + (correct ? "correct" : "incorrect");

  if (correct) {
    feedbackText.textContent = "✓ Correct!";
    if (streak >= 10) {
      feedbackText.textContent += " 🔥 10+ streak! +20 bonus!";
    } else if (streak >= 5) {
      feedbackText.textContent += " 🔥 5+ streak! +10 bonus!";
    } else if (streak >= 3) {
      feedbackText.textContent += " 🔥 3+ streak! +5 bonus!";
    }
  } else {
    feedbackText.innerHTML = `✗ Incorrect<br><small>Correct answer: ${correctAnswer}</small>`;
  }

  quizFeedback.style.display = "block";
  waitingForNext = true;
}

function hideQuizUI() {
  quizAnswers.style.display = "none";
  writeInArea.style.display = "none";
  quizFeedback.style.display = "none";
}

function showQuizCard() {
  hideQuizUI();
  waitingForNext = false;

  const card = currentCard();
  if (!card) return;

  // Reset choice button states
  choiceBtns.forEach((btn) => {
    btn.classList.remove("correct", "incorrect");
    btn.disabled = false;
  });

  // Show front (question)
  faceLabel.textContent = "Question";
  faceText.textContent = card.front || "(empty question)";
  smallNote.textContent = "";

  if (quizType === "multipleChoice") {
    const deckIndex = viewOrder[current];
    const { choices, correctPos } = generateChoices(deckIndex);
    currentChoices = choices;
    correctChoiceIndex = correctPos;

    // Populate buttons
    const labels = ["A", "B", "C", "D"];
    choiceBtns.forEach((btn, i) => {
      btn.textContent = `${labels[i]}. ${choices[i]}`;
    });

    quizAnswers.style.display = "block";
  } else {
    writeInInput.value = "";
    writeInArea.style.display = "block";
    writeInInput.focus();
  }
}

function handleChoiceClick(choiceIndex) {
  if (waitingForNext) return;

  const deckIndex = viewOrder[current];
  const correct = choiceIndex === correctChoiceIndex;

  // Track missed
  if (!correct && !missedCards.includes(deckIndex)) {
    missedCards.push(deckIndex);
  }

  // Highlight buttons
  choiceBtns.forEach((btn, i) => {
    btn.disabled = true;
    if (i === correctChoiceIndex) {
      btn.classList.add("correct");
    } else if (i === choiceIndex) {
      btn.classList.add("incorrect");
    }
  });

  awardPoints(correct);
  showQuizFeedback(correct, deck[deckIndex].back);
}

function handleWriteInSubmit() {
  if (waitingForNext) return;

  const deckIndex = viewOrder[current];
  const userAnswer = writeInInput.value.trim();
  const correctAnswer = deck[deckIndex].back;
  const correct = fuzzyMatch(userAnswer, correctAnswer);

  if (!correct && !missedCards.includes(deckIndex)) {
    missedCards.push(deckIndex);
  }

  awardPoints(correct);
  showQuizFeedback(correct, correctAnswer);
  writeInArea.style.display = "none";
}

function handleShowAnswer() {
  if (waitingForNext) return;

  const deckIndex = viewOrder[current];

  // Count as incorrect
  if (!missedCards.includes(deckIndex)) {
    missedCards.push(deckIndex);
  }

  awardPoints(false);
  showQuizFeedback(false, deck[deckIndex].back);
  writeInArea.style.display = "none";
}

function goNextQuizCard() {
  waitingForNext = false;

  // Check if quiz complete
  if (current >= viewOrder.length - 1) {
    showSummary();
    return;
  }

  current++;
  updatePills();
  showQuizCard();
}

function showSummary() {
  const accuracy = answeredCount > 0
    ? Math.round((correctCount / answeredCount) * 100)
    : 0;

  finalScore.textContent = `${score} pts`;
  finalAccuracy.textContent = `${accuracy}%`;
  finalStreak.textContent = `🔥 ${bestStreak}`;
  finalCards.textContent = `${correctCount} / ${answeredCount}`;

  // Show/hide retry button based on missed cards
  retryMissedBtn.style.display = missedCards.length > 0 ? "block" : "none";

  summaryModal.style.display = "flex";
}

function hideSummary() {
  summaryModal.style.display = "none";
}

function resetQuizStats() {
  score = 0;
  streak = 0;
  bestStreak = 0;
  correctCount = 0;
  answeredCount = 0;
  missedCards = [];
  current = 0;
  updateScoreDisplay();
}

function startQuiz(cardIndices = null) {
  hideSummary();
  resetQuizStats();

  // Use provided indices or full deck
  if (cardIndices && cardIndices.length > 0) {
    viewOrder = shuffleArray(cardIndices);
  } else {
    viewOrder = shuffleArray(deck.map((_, i) => i));
  }

  updatePills();
  showQuizCard();
}

function enterQuizMode() {
  if (deck.length < 4) {
    setError("Quiz mode requires at least 4 cards for multiple choice options.");
    return;
  }

  quizMode = true;
  isShuffled = true; // Quiz mode always uses shuffled deck
  setError("");

  // Update UI
  studyModeBtn.classList.remove("active");
  quizModeBtn.classList.add("active");
  quizTypeToggle.style.display = "flex";
  scoreDisplay.style.display = "flex";
  studyControls.style.display = "none";
  bigCard.classList.add("quizMode");
  bigCard.style.cursor = "default";

  startQuiz();
}

function exitQuizMode() {
  quizMode = false;
  hideSummary();
  hideQuizUI();

  // Update UI
  studyModeBtn.classList.add("active");
  quizModeBtn.classList.remove("active");
  quizTypeToggle.style.display = "none";
  scoreDisplay.style.display = "none";
  studyControls.style.display = "flex";
  bigCard.classList.remove("quizMode");
  bigCard.style.cursor = "pointer";

  // Reset to study mode
  viewOrder = deck.map((_, i) => i);
  current = 0;
  showingFront = true;
  isShuffled = false;
  updatePills();
  renderCard();
}

function setQuizType(type) {
  quizType = type;

  if (type === "multipleChoice") {
    multipleChoiceBtn.classList.add("active");
    writeInBtn.classList.remove("active");
  } else {
    multipleChoiceBtn.classList.remove("active");
    writeInBtn.classList.add("active");
  }

  // Restart quiz with new type
  if (quizMode && deck.length >= 4) {
    startQuiz();
  }
}

// ---------- Quiz Event Listeners ----------

studyModeBtn.addEventListener("click", () => {
  if (!quizMode) return;
  exitQuizMode();
});

quizModeBtn.addEventListener("click", () => {
  if (quizMode) return;
  enterQuizMode();
});

multipleChoiceBtn.addEventListener("click", () => {
  if (quizType === "multipleChoice") return;
  setQuizType("multipleChoice");
});

writeInBtn.addEventListener("click", () => {
  if (quizType === "writeIn") return;
  setQuizType("writeIn");
});

choiceBtns.forEach((btn, i) => {
  btn.addEventListener("click", () => handleChoiceClick(i));
});

submitAnswerBtn.addEventListener("click", handleWriteInSubmit);
showAnswerBtn.addEventListener("click", handleShowAnswer);
nextQuizBtn.addEventListener("click", goNextQuizCard);

restartQuizBtn.addEventListener("click", () => startQuiz());
retryMissedBtn.addEventListener("click", () => startQuiz([...missedCards]));
backToStudyBtn.addEventListener("click", exitQuizMode);

// Write-in Enter key support
writeInInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    handleWriteInSubmit();
  }
});

// Quiz keyboard shortcuts (1-4 for choices, Enter for next)
window.addEventListener("keydown", (e) => {
  if (!quizMode) return;

  // Don't interfere with typing in write-in mode
  if (document.activeElement === writeInInput) return;

  const key = e.key;

  // Number keys for multiple choice
  if (quizType === "multipleChoice" && !waitingForNext) {
    if (key === "1" || key === "a") handleChoiceClick(0);
    else if (key === "2" || key === "b") handleChoiceClick(1);
    else if (key === "3" || key === "c") handleChoiceClick(2);
    else if (key === "4" || key === "d") handleChoiceClick(3);
  }

  // Enter or Space for next card
  if (waitingForNext && (key === "Enter" || key === " ")) {
    e.preventDefault();
    goNextQuizCard();
  }
});

// Override bigCard click in quiz mode
bigCard.addEventListener("click", (e) => {
  if (quizMode) {
    e.stopPropagation();
    return;
  }
});

// ---------- Fullscreen Mode ----------

const gridElement = document.querySelector(".grid");
const fullscreenBtn = document.getElementById("fullscreenBtn");
const fsText = fullscreenBtn.querySelector(".fs-text");
let isFullscreen = false;

function toggleFullscreen() {
  isFullscreen = !isFullscreen;
  gridElement.classList.toggle("fullscreen", isFullscreen);
  fullscreenBtn.classList.toggle("active", isFullscreen);

  // Update text
  fsText.textContent = isFullscreen ? "Exit Focus" : "Focus";
  fullscreenBtn.title = isFullscreen ? "Exit focus mode" : "Focus mode (hide JSON panel)";
}

fullscreenBtn.addEventListener("click", toggleFullscreen);

// Keyboard shortcut: F for fullscreen
window.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() === "f" && document.activeElement !== writeInInput && document.activeElement !== jsonInput) {
    toggleFullscreen();
  }
});

// ---------- GPT Prompt Feature ----------

const gptPromptBtn = document.getElementById("gptPromptBtn");
const gptModal = document.getElementById("gptModal");
const gptPromptText = document.getElementById("gptPromptText");
const copyPromptBtn = document.getElementById("copyPromptBtn");
const closePromptBtn = document.getElementById("closePromptBtn");

const GPT_PROMPT = `You are a helpful assistant that converts study notes into flashcard JSON format.

The user will provide notes, and you should convert them into a JSON array of flashcard objects.

**Output Format:**
\`\`\`json
[
  { "front": "Question or term", "back": "Answer or definition" },
  { "front": "Another question", "back": "Another answer" }
]
\`\`\`

**Rules:**
1. Each flashcard has "front" (question/term) and "back" (answer/definition)
2. Keep text concise but complete
3. One concept per card
4. For lists, consider making separate cards for each item
5. Output ONLY valid JSON, no other text

**Alternative accepted formats (but prefer the above):**
- Array of pairs: \`[["Q1", "A1"], ["Q2", "A2"]]\`
- Object map: \`{"Term1": "Definition1", "Term2": "Definition2"}\`
- Keys can also be: q/a, question/answer, term/definition

**Example Input:**
"The mitochondria is the powerhouse of the cell. 
Photosynthesis converts sunlight into energy.
DNA stands for deoxyribonucleic acid."

**Example Output:**
\`\`\`json
[
  { "front": "What is the mitochondria?", "back": "The powerhouse of the cell" },
  { "front": "What does photosynthesis do?", "back": "Converts sunlight into energy" },
  { "front": "What does DNA stand for?", "back": "Deoxyribonucleic acid" }
]
\`\`\`

Now convert the user's notes into flashcard JSON:`;

function showGptPrompt() {
  gptPromptText.textContent = GPT_PROMPT;
  gptModal.style.display = "flex";
}

function hideGptPrompt() {
  gptModal.style.display = "none";
}

async function copyPrompt() {
  try {
    await navigator.clipboard.writeText(GPT_PROMPT);
    copyPromptBtn.textContent = "Copied!";
    setTimeout(() => (copyPromptBtn.textContent = "Copy to Clipboard"), 1500);
  } catch (e) {
    copyPromptBtn.textContent = "Copy failed";
    setTimeout(() => (copyPromptBtn.textContent = "Copy to Clipboard"), 1500);
  }
}

gptPromptBtn.addEventListener("click", showGptPrompt);
closePromptBtn.addEventListener("click", hideGptPrompt);
copyPromptBtn.addEventListener("click", copyPrompt);

// Close modal on backdrop click
gptModal.addEventListener("click", (e) => {
  if (e.target === gptModal) {
    hideGptPrompt();
  }
});

// Close modal on Escape
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && gptModal.style.display === "flex") {
    hideGptPrompt();
  }
});

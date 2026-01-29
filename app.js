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
    } catch {}
  }
  updatePills();
  renderCard();
})();

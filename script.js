const BANK_FOLDER = "Question Bank";
const $ = (id) => document.getElementById(id);
const LETTERS = "ABCDEFGHIJ";

let quiz = null;        // loaded JSON of the current bank
let bankName = "";      // e.g. "Practice 1"
let questions = [];     // shuffled flat list: { partIndex, ...question }
let answers = [];       // chosen option index, or null for blank
let current = 0;
let scoring = { correct: 2, wrong: -1, blank: 0 };
let totals = null;      // filled when results are shown
let partTotals = [];

/* ---------- helpers ---------- */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function show(id) {
  ["menu", "quiz", "results"].forEach((s) => ($(s).hidden = s !== id));
  window.scrollTo(0, 0);
}

function shuffle(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const isJson = (name) => /\.json$/i.test(name);
const baseName = (name) => name.replace(/\.json$/i, "");
const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true });

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ---------- opening page: find question banks ---------- */
const MANIFEST = "banks.json"; // optional list of bank files, lives inside the folder

const folderUrl = () => new URL(encodeURIComponent(BANK_FOLDER) + "/", location.href).href;

function makeBanks(files) {
  const seen = new Set();
  return files
    .filter((f) => isJson(f) && f.toLowerCase() !== MANIFEST && !seen.has(f) && seen.add(f))
    .map((file) => ({
      name: baseName(file),
      load: async () => {
        const r = await fetch(folderUrl() + encodeURIComponent(file));
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      },
    }));
}

// 1) banks.json inside the folder: ["Practice 1.json", "Practice 2.json"]. Most reliable on GitHub Pages.
async function listFromManifest() {
  const res = await fetch(folderUrl() + MANIFEST, { cache: "no-store" });
  if (!res.ok) throw new Error("no manifest");
  const arr = await res.json();
  if (!Array.isArray(arr)) throw new Error("bad manifest");
  return makeBanks(arr.map((n) => String(n)).map((n) => (isJson(n) ? n : n + ".json")));
}

// 2) GitHub Pages without a manifest: ask the GitHub API what is in the folder.
async function listFromGitHub() {
  if (!/\.github\.io$/i.test(location.hostname)) throw new Error("not github pages");
  const owner = location.hostname.split(".")[0];
  const repo = location.pathname.split("/")[1] || `${owner}.github.io`;
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(BANK_FOLDER)}`);
  if (!res.ok) throw new Error("api " + res.status);
  const items = await res.json();
  return makeBanks(items.filter((i) => i.type === "file").map((i) => i.name)).sort(byName);
}

// 3) Plain local server (python -m http.server): read the folder's file listing.
async function listFromDirectory() {
  const res = await fetch(folderUrl());
  if (!res.ok) throw new Error("no listing");
  const doc = new DOMParser().parseFromString(await res.text(), "text/html");
  const names = [...doc.querySelectorAll("a")]
    .map((a) => decodeURIComponent((a.getAttribute("href") || "").split("/").pop()));
  return makeBanks(names).sort(byName);
}

async function findBanks() {
  for (const method of [listFromManifest, listFromGitHub, listFromDirectory]) {
    try {
      const banks = await method();
      if (banks.length) return banks;
    } catch (err) { /* try the next method */ }
  }
  return [];
}

async function init() {
  show("menu");
  $("folder-box").hidden = false;

  if (location.protocol !== "file:") {
    const banks = await findBanks();
    if (banks.length) {
      $("menu-msg").textContent = "Pick a question bank to begin.";
      $("folder-box").hidden = true;
      renderBanks(banks);
      return;
    }
    $("menu-msg").textContent =
      `No question banks found in the "${BANK_FOLDER}" folder. Check that the folder name matches exactly ` +
      `(capital letters count online) and that it holds .json files. You can also select the folder manually.`;
    return;
  }
  $("menu-msg").textContent =
    `The browser cannot look inside folders by itself when this page is opened by double-click. ` +
    `Select your "${BANK_FOLDER}" folder once and its question banks will be listed. ` +
    `Files are read on your computer only.`;
}

// Works everywhere: user picks the folder, we list the .json files inside.
$("folder-input").addEventListener("change", (e) => {
  const all = [...e.target.files].filter((f) => isJson(f.name) && f.name.toLowerCase() !== MANIFEST);
  // Prefer files directly inside the chosen folder; fall back to any nested ones.
  const direct = all.filter((f) => (f.webkitRelativePath || "").split("/").length === 2);
  const chosen = direct.length ? direct : all;
  if (!chosen.length) {
    $("menu-msg").textContent = "No .json files found in that folder. Select the folder that contains your question banks.";
    $("bank-list").replaceChildren();
    return;
  }
  $("menu-msg").textContent = "Pick a question bank to begin.";
  $("folder-label").textContent = "Choose a different folder";
  renderBanks(chosen.map((f) => ({
    name: baseName(f.name),
    load: async () => JSON.parse(await f.text()),
  })).sort(byName));
});

function renderBanks(banks) {
  const list = $("bank-list");
  list.replaceChildren();
  banks.forEach((bank) => {
    const b = el("button", "bank", bank.name);
    b.type = "button";
    b.addEventListener("click", async () => {
      try {
        start(await bank.load(), bank.name);
      } catch (err) {
        $("menu-msg").textContent = `Could not open "${bank.name}": ${err.message}`;
        window.scrollTo(0, 0);
      }
    });
    list.append(b);
  });
}

function validate(d) {
  if (!d || !Array.isArray(d.parts) || !d.parts.length) return '"parts" must be a non-empty array.';
  for (const [i, p] of d.parts.entries()) {
    if (!Array.isArray(p.questions) || !p.questions.length) return `Part ${i + 1} has no questions.`;
    for (const [j, q] of p.questions.entries()) {
      const where = `Part ${i + 1}, question ${j + 1}`;
      if (!q.question) return `${where}: missing "question".`;
      if (!Array.isArray(q.options) || q.options.length < 2) return `${where}: needs at least 2 options.`;
      if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.options.length)
        return `${where}: "answer" must be an option index from 0 to ${q.options.length - 1}.`;
    }
  }
  return null;
}

/* ---------- start a quiz ---------- */
function start(data, name) {
  const problem = validate(data);
  if (problem) {
    $("menu-msg").textContent = `"${name}" has a data problem: ${problem}`;
    show("menu");
    return;
  }
  quiz = data;
  bankName = name;
  scoring = Object.assign({ correct: 2, wrong: -1, blank: 0 }, data.scoring);

  const flat = [];
  data.parts.forEach((part, partIndex) =>
    part.questions.forEach((q) => flat.push({ ...q, partIndex }))
  );
  questions = shuffle(flat);
  answers = questions.map(() => null);
  current = 0;

  document.title = name;
  $("quiz-title").textContent = data.title || name;
  renderQuestion();
  show("quiz");
}

/* ---------- quiz view ---------- */
function renderQuestion() {
  const q = questions[current];
  $("progress").textContent = `Question ${current + 1} of ${questions.length}`;
  $("question-text").textContent = q.question;

  const box = $("options");
  box.replaceChildren();
  q.options.forEach((text, i) => {
    const btn = el("button", "option" + (answers[current] === i ? " selected" : ""));
    btn.type = "button";
    btn.setAttribute("role", "radio");
    btn.setAttribute("aria-checked", answers[current] === i);
    btn.append(el("span", "key", LETTERS[i]), el("span", "", text));
    btn.addEventListener("click", () => {
      answers[current] = answers[current] === i ? null : i; // click again to clear
      renderQuestion();
    });
    box.append(btn);
  });

  $("prev").disabled = current === 0;
  $("next").textContent = current === questions.length - 1 ? "Finish" : "Next";

  const nav = $("navigator");
  nav.replaceChildren();
  questions.forEach((_, i) => {
    const b = el("button", "", String(i + 1));
    b.type = "button";
    if (answers[i] !== null) b.classList.add("answered");
    if (i === current) b.classList.add("current");
    b.setAttribute("aria-label", `Go to question ${i + 1}`);
    b.addEventListener("click", () => { current = i; renderQuestion(); });
    nav.append(b);
  });
}

$("prev").addEventListener("click", () => {
  if (current > 0) { current--; renderQuestion(); }
});

$("next").addEventListener("click", () => {
  if (current < questions.length - 1) { current++; renderQuestion(); return; }
  const blanks = answers.filter((a) => a === null).length;
  if (blanks && !confirm(`${blanks} question(s) are blank. Finish anyway?`)) return;
  showResults();
});

$("retry").addEventListener("click", () => start(quiz, bankName)); // reshuffles
$("menu-btn").addEventListener("click", () => show("menu"));
$("download").addEventListener("click", downloadReport);

/* ---------- results ---------- */
function statusOf(i) {
  if (answers[i] === null) return "blank";
  return answers[i] === questions[i].answer ? "correct" : "wrong";
}

// Within a part: wrong first, then blank, then correct. Ties keep quiz order.
const RANK = { wrong: 0, blank: 1, correct: 2 };
function reviewOrder(partIndex) {
  return questions
    .map((q, i) => i)
    .filter((i) => questions[i].partIndex === partIndex)
    .sort((a, b) => RANK[statusOf(a)] - RANK[statusOf(b)] || a - b);
}

function computeTotals() {
  partTotals = quiz.parts.map((p) => ({ title: p.title, score: 0, max: 0 }));
  totals = { correct: 0, wrong: 0, blank: 0, score: 0, max: 0 };
  questions.forEach((q, i) => {
    const s = statusOf(i);
    totals[s]++;
    totals.score += scoring[s];
    totals.max += scoring.correct;
    partTotals[q.partIndex].score += scoring[s];
    partTotals[q.partIndex].max += scoring.correct;
  });
}

function showResults() {
  computeTotals();
  $("result-bank").textContent = bankName;
  $("final-score").textContent = totals.score;
  $("final-max").textContent = `out of ${totals.max}`;
  $("c-correct").textContent = totals.correct;
  $("c-wrong").textContent = totals.wrong;
  $("c-blank").textContent = totals.blank;

  const list = $("part-scores");
  list.replaceChildren();
  partTotals.forEach((p, i) => {
    const li = el("li");
    li.append(el("span", "", p.title || `Part ${i + 1}`), el("strong", "", `${p.score}/${p.max}`));
    list.append(li);
  });

  renderReview();
  show("results");
}

function renderReview() {
  const review = $("review");
  review.replaceChildren();

  quiz.parts.forEach((part, partIndex) => {
    review.append(el("h2", "review-part", part.title || `Part ${partIndex + 1}`));

    reviewOrder(partIndex).forEach((i) => {
      const q = questions[i];
      const s = statusOf(i);
      const card = el("article", `panel review-q ${s}`);

      const head = el("div", "review-head");
      head.append(
        el("span", "", `Question ${i + 1}`),
        el("span", "badge", { correct: "Correct", wrong: "Wrong", blank: "Blank" }[s])
      );
      card.append(head, el("h3", "", q.question));

      q.options.forEach((text, oi) => {
        const isAnswer = oi === q.answer;
        const isChosenWrong = answers[i] === oi && !isAnswer;
        const row = el("div", "review-opt" + (isAnswer ? " is-answer" : "") + (isChosenWrong ? " is-chosen-wrong" : ""));
        row.append(el("span", "key", LETTERS[oi] + "."), el("span", "", text));
        if (isAnswer) row.append(el("span", "tag", answers[i] === oi ? "Your answer" : "Correct answer"));
        if (isChosenWrong) row.append(el("span", "tag", "Your answer"));
        card.append(row);
      });

      if (q.explanation) {
        const ex = el("p", "explanation");
        ex.append(el("strong", "", "Explanation"), document.createTextNode(q.explanation));
        card.append(ex);
      }
      review.append(card);
    });
  });
}

/* ---------- download report ---------- */
// Produces one self-contained .html file (open it in any browser; Print > Save as PDF works too).
function downloadReport() {
  const label = { correct: "Correct", wrong: "Wrong", blank: "Blank" };
  let body = "";

  quiz.parts.forEach((part, partIndex) => {
    body += `<h2>${esc(part.title || "Part " + (partIndex + 1))}</h2>`;
    reviewOrder(partIndex).forEach((i) => {
      const q = questions[i];
      const s = statusOf(i);
      body += `<article class="q ${s}"><div class="head"><span>Question ${i + 1}</span><span class="badge">${label[s]}</span></div>`;
      body += `<h3>${esc(q.question)}</h3>`;
      q.options.forEach((text, oi) => {
        const isAnswer = oi === q.answer;
        const wrongPick = answers[i] === oi && !isAnswer;
        const tag = isAnswer ? (answers[i] === oi ? "Your answer" : "Correct answer") : wrongPick ? "Your answer" : "";
        body += `<div class="opt${isAnswer ? " ok" : ""}${wrongPick ? " bad" : ""}"><b>${LETTERS[oi]}.</b> <span>${esc(text)}</span>${tag ? `<em>${tag}</em>` : ""}</div>`;
      });
      if (s === "blank") body += `<p class="none">Not answered</p>`;
      if (q.explanation) body += `<p class="expl"><strong>Explanation</strong>${esc(q.explanation)}</p>`;
      body += `</article>`;
    });
  });

  const partRows = partTotals
    .map((p, i) => `<tr><td>${esc(p.title || "Part " + (i + 1))}</td><td class="r">${p.score}/${p.max}</td></tr>`)
    .join("");

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(bankName)} - Report</title><style>
body{font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:760px;margin:0 auto;padding:24px 16px;color:#14262b;line-height:1.5}
h1{margin:0 0 4px}.date{color:#5d6f73;margin:0 0 20px}
.score{font-size:3rem;font-weight:800;margin:0}.max{color:#5d6f73;margin:0 0 12px}
.counts span{display:inline-block;margin-right:16px;font-weight:600}
table{border-collapse:collapse;width:100%;margin:16px 0 8px}td{padding:8px 4px;border-bottom:1px solid #cbd6d3}.r{text-align:right;font-weight:700}
h2{margin:32px 0 10px;border-bottom:2px solid #14262b;padding-bottom:4px}
.q{border:1px solid #cbd6d3;border-left:6px solid #7b858a;border-radius:8px;padding:14px 16px;margin-bottom:14px;break-inside:avoid}
.q.correct{border-left-color:#2e7d4f}.q.wrong{border-left-color:#b3402f}
.head{display:flex;justify-content:space-between;color:#5d6f73;font-size:.9rem}.badge{font-weight:700}
.correct .badge{color:#2e7d4f}.wrong .badge{color:#b3402f}
h3{margin:6px 0 10px;font-size:1.05rem}
.opt{padding:7px 10px;margin-bottom:6px;border:1px solid #cbd6d3;border-radius:6px}
.opt.ok{background:#dcf0e4;border-color:#2e7d4f}.opt.bad{background:#f6dfda;border-color:#b3402f}
.opt em{float:right;font-style:normal;font-weight:600;font-size:.85rem}
.none{color:#7b858a;margin:6px 0}.expl{background:#eef2f1;border-radius:6px;padding:10px 12px;margin:10px 0 0;font-size:.95rem}
.expl strong{display:block}
</style></head><body>
<h1>${esc(bankName)}</h1><p class="date">${esc(new Date().toLocaleString())}</p>
<p class="score">${totals.score}</p><p class="max">out of ${totals.max}</p>
<p class="counts"><span>Correct: ${totals.correct}</span><span>Wrong: ${totals.wrong}</span><span>Blank: ${totals.blank}</span></p>
<table>${partRows}</table>
${body}
</body></html>`;

  const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${bankName} - report.html`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

init();

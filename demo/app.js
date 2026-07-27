// TypeForge demo application.
//
// Parsing, the IR and all four emitters come from ../src. This file owns the
// editor, the language tabs and the copy button — nothing else.
import { codegen, LANGUAGES } from "../src/index.js";
import { SAMPLES, sampleById } from "../src/samples.js";
import { escapeHtml } from "../src/format.js";

const { el, $, $$, toast } = A;

const state = {
  sampleId: "user-profile",
  language: "typescript",
  result: null,
};

const KEYWORDS = "export|import|from|type|interface|const|let|function|class|def|return|package|struct|map|string|number|boolean|int64|float64|bool|enum|dataclass|Optional|Union|List|Literal|Any|Dict|True|False|None|async|await|new|default|do|if|else";
const TOKEN = new RegExp(`(\\/\\/[^\\n]*|#[^\\n]*|"(?:\\\\.|[^"\\\\])*"|'(?:\\\\.|[^'\\\\])*'|\`(?:[^\`\\\\]|\\\\.)*\`|\\b(?:${KEYWORDS})\\b)`, "g");

/** Tiny token-based highlighter. Builds escaped text for everything else. */
function highlight(code) {
  let html = "";
  let last = 0;
  for (const match of code.matchAll(TOKEN)) {
    html += escapeHtml(code.slice(last, match.index));
    const token = match[0];
    const kind = token.startsWith("//") || token.startsWith("#") ? "tok-c"
      : /^["'`]/.test(token) ? "tok-s" : "tok-k";
    html += `<span class="${kind}">${escapeHtml(token)}</span>`;
    last = match.index + token.length;
  }
  return html + escapeHtml(code.slice(last));
}

/* --------------------------------------------------------------- rendering */

function renderSampleChips() {
  $("#sample-chips").replaceChildren(...SAMPLES.map((sample) =>
    el("button", {
      class: "chip" + (sample.id === state.sampleId ? " active" : ""),
      title: sample.blurb,
      onclick: () => {
        state.sampleId = sample.id;
        $("#schema-editor").value = JSON.stringify(sample.schema, null, 2);
        renderSampleChips();
        regenerate();
      },
    }, sample.name)));
}

function renderLanguageTabs() {
  $("#lang-tabs").replaceChildren(...LANGUAGES.map((language) =>
    el("button", {
      class: "lang-tab" + (language.id === state.language ? " active" : ""),
      role: "tab",
      "aria-selected": String(language.id === state.language),
      onclick: () => selectLanguage(language.id),
    }, language.label)));
}

function selectLanguage(id) {
  state.language = id;
  renderLanguageTabs();
  renderCode();
  history.replaceState(null, "", `#${id}${state.sampleId === "user-profile" ? "" : "-" + state.sampleId}`);
}

function currentOutput() {
  if (!state.result) return null;
  return state.result.outputs.find((output) => output.id === state.language) || state.result.outputs[0];
}

function renderCode() {
  const output = currentOutput();
  if (!output) return;
  $("#code-output").innerHTML = highlight(output.code);
  $("#line-count").textContent = `${output.code.split("\n").length - 1} lines`;
  const language = LANGUAGES.find((entry) => entry.id === state.language);
  $("#lang-badge").textContent = language.label;
  $("#lang-badge").className = "badge gold";
  $("#code-sub").textContent = `typeof ${state.result.ir.rootName} · ${language.extension} output`;
}

function renderStats() {
  if (!state.result) return;
  const { stats, ir } = state.result;
  $("#stats-badge").textContent = `${stats.types} types`;
  $("#ir-badge").textContent = `IR ${ir.definitions.length} named + 1 root`;
  $("#ir-strip").replaceChildren(
    statCard("Types in IR", String(stats.types), "named definitions plus the root"),
    statCard("Fields", String(stats.fields), "across every object"),
    statCard("Refs resolved", String(stats.references), "local $ref targets inlined"),
    statCard("Nesting depth", String(stats.depth), `root is ${ir.rootName}`),
  );
}

function statCard(label, value, sub) {
  return el("div", { class: "card" },
    el("div", { class: "stat" },
      el("div", { class: "stat-label", text: label }),
      el("div", { class: "stat-value", text: value }),
      el("div", { class: "small muted", text: sub })));
}

/* -------------------------------------------------------------- generation */

function showError(message) {
  const box = $("#parse-error");
  box.textContent = message;
  box.classList.remove("hide");
  $("#parse-status").textContent = "Schema error — showing the last valid output";
  $("#parse-status").style.color = "var(--red)";
}

function clearError() {
  $("#parse-error").classList.add("hide");
  $("#parse-status").style.color = "";
}

function regenerate() {
  const text = $("#schema-editor").value;
  const started = performance.now();
  try {
    state.result = codegen(text);
  } catch (error) {
    showError(error.message);
    return;
  }
  clearError();
  const elapsed = performance.now() - started;
  const { stats } = state.result;
  $("#parse-status").textContent = `Parsed · ${stats.types} types, ${stats.fields} fields`;
  $("#schema-size").textContent = `${(text.length / 1024).toFixed(1)} KB`;
  $("#gen-time").textContent = `generated all 4 in ${elapsed.toFixed(1)} ms`;
  renderStats();
  renderCode();
}

/* ------------------------------------------------------------------ actions */

async function copyCode() {
  const output = currentOutput();
  if (!output) return;
  try {
    await navigator.clipboard.writeText(output.code);
    toast(`Copied ${output.label} (${output.code.split("\n").length - 1} lines)`, "success");
  } catch {
    A.download(`typeforge.${output.extension}`, output.code);
    toast("Clipboard blocked — downloaded the file instead", "info");
  }
}

function downloadCode() {
  const output = currentOutput();
  if (!output) return;
  A.download(`typeforge.${output.extension}`, output.code);
  toast(`Downloaded typeforge.${output.extension}`, "success");
}

/* --------------------------------------------------------------------- boot */

function applyHash() {
  const hash = location.hash.replace("#", "");
  if (!hash) return;
  const [first, ...rest] = hash.split("-");
  const language = LANGUAGES.find((entry) => entry.id === first);
  if (language) state.language = language.id;
  const sampleId = rest.join("-");
  if (sampleId && SAMPLES.some((sample) => sample.id === sampleId)) state.sampleId = sampleId;
}

function init() {
  applyHash();
  const sample = sampleById(state.sampleId);
  state.sampleId = sample.id;
  $("#schema-editor").value = JSON.stringify(sample.schema, null, 2);
  renderSampleChips();
  renderLanguageTabs();
  regenerate();

  $("#schema-editor").addEventListener("input", A.debounce(() => {
    const parsed = (() => {
      try { return JSON.stringify(JSON.parse($("#schema-editor").value)); } catch { return null; }
    })();
    const match = SAMPLES.find((entry) => JSON.stringify(entry.schema) === parsed);
    state.sampleId = match ? match.id : null;
    renderSampleChips();
    regenerate();
  }, 380));
  $("#copy").addEventListener("click", copyCode);
  $("#download").addEventListener("click", downloadCode);
  $("#reset-sample").addEventListener("click", () => {
    const fallback = state.sampleId || "user-profile";
    state.sampleId = fallback;
    $("#schema-editor").value = JSON.stringify(sampleById(fallback).schema, null, 2);
    renderSampleChips();
    regenerate();
  });
}

init();

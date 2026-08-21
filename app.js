const STORAGE_KEY = "opalday-data-v1";
const CODE_KEY = "opalday-sync-code";
const state = {
  planner: load(STORAGE_KEY, { items: [], updatedAt: "" }),
  syncCode: localStorage.getItem(CODE_KEY) || "",
  syncStatus: "Local only",
  saveTimer: null
};
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const workerUrl = () => (window.OPALDAY_CONFIG?.workerUrl || "").replace(/\/$/, "");

function load(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } }
function randomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[char]));
}
function parseEntry(value) {
  const [rawTitle, rawSubtasks = ""] = value.split(/:(.+)/);
  let title = rawTitle.trim();
  const lower = title.toLowerCase();
  const kind = /med|dose|injection|vyvgart|nucala/.test(lower) ? "medication" : /clean|tidy|organize|reset|sheets|closet|desk|table|shelf/.test(lower) ? "reset" : "habit";
  let cadence = /every day|daily|each day/.test(lower) ? "daily" : /month/.test(lower) ? "monthly" : "weekly";
  let target = Number(lower.match(/(\d+)\s*(?:x|times?)\s*(?:a|per|each)?\s*week/)?.[1] || 1);
  const intervalWeeks = Number(lower.match(/every\s+(\d+)\s+weeks?/)?.[1] || 0) || null;
  if (intervalWeeks) cadence = "interval";
  const days = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
  const fixedDay = days.findIndex(day => lower.includes(day));
  const time = lower.match(/(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)/);
  let fixedTime = null;
  if (time) {
    let hour = Number(time[1]);
    if (time[3] === "pm" && hour < 12) hour += 12;
    if (time[3] === "am" && hour === 12) hour = 0;
    fixedTime = String(hour).padStart(2,"0") + ":" + (time[2] || "00");
  }
  title = title
    .replace(/\b(?:every day|daily|each day|once a week|every week|weekly|once a month|every month|monthly)\b/gi,"")
    .replace(/\b\d+\s*(?:x|times?)\s*(?:a|per|each)?\s*week\b/gi,"")
    .replace(/\bevery\s+\d+\s+weeks?\b/gi,"")
    .replace(/\b(?:on\s+)?(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)s?\b/gi,"")
    .replace(/\b(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/gi,"")
    .replace(/\s+/g," ").trim() || rawTitle.trim();
  const subtasks = rawSubtasks.split(",").map(value => value.trim()).filter(Boolean).map(title => ({ id: crypto.randomUUID(), title, done: false }));
  return { id: crypto.randomUUID(), title, kind, cadence, target, intervalWeeks, fixedDay: fixedDay >= 0 ? fixedDay : null, fixedTime, subtasks, completed: false, completions: [], rescueReminder: true, createdAt: new Date().toISOString() };
}
function cadenceLabel(item) {
  if (item.cadence === "daily") return "Every day";
  if (item.cadence === "monthly") return "Once this month";
  if (item.cadence === "interval") return `Every ${item.intervalWeeks || 1} weeks`;
  return item.target > 1 ? `${item.target} times this week` : "Once this week";
}
function save(push = true) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.planner));
  render();
  if (push && state.syncCode) {
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(syncPush, 650);
  }
}
function render() {
  $("#todayDate").textContent = new Intl.DateTimeFormat("en-US",{weekday:"long",month:"long",day:"numeric"}).format(new Date());
  const complete = state.planner.items.filter(item => item.completed).length;
  const total = state.planner.items.length;
  const progress = total ? Math.round(complete / total * 100) : 0;
  $("#progressTitle").textContent = total ? `${complete} of ${total} complete` : "Your day is wide open";
  $("#progressNote").textContent = total ? "One thing at a time is plenty." : "Add your first habit, reset, medication, or event.";
  $("#progressNumber").textContent = progress + "%";
  $("#progressRing").style.setProperty("--progress", progress * 3.6 + "deg");
  $("#syncText").textContent = state.syncCode ? state.syncStatus : "Set up sync";
  $(".sync-dot").classList.toggle("active", Boolean(state.syncCode));
  const items = [...state.planner.items].sort((a,b) => (a.fixedTime || "99:99").localeCompare(b.fixedTime || "99:99"));
  $("#items").innerHTML = items.length ? `<div class="timeline">${items.map(itemHtml).join("")}</div>` : `
    <button class="empty-state" id="emptyAdd"><span class="empty-orb">＋</span><strong>Build today naturally</strong>
    <span>Try “PT three times a week” or “Organize closet monthly: clothes, shoes, donations.”</span></button>`;
  $("#emptyAdd")?.addEventListener("click", () => openModal("#addModal"));
  $$("[data-toggle-item]").forEach(button => button.addEventListener("click", () => toggleItem(button.dataset.toggleItem)));
  $$("[data-subtask]").forEach(button => button.addEventListener("click", () => toggleSubtask(button.dataset.item, button.dataset.subtask)));
}
function itemHtml(item) {
  const time = item.fixedTime ? new Date("2000-01-01T"+item.fixedTime).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"}) : "Anytime";
  return `<article class="timeline-item kind-${item.kind} ${item.completed ? "is-complete" : ""}">
    <div class="time-column">${time}</div><div class="timeline-rail"><span></span></div>
    <div class="item-bubble"><button class="check-button" data-toggle-item="${item.id}">${item.completed ? "✓" : ""}</button>
    <div class="item-content"><div class="item-title-row"><strong>${escapeHtml(item.title)}</strong><span class="kind-label">${item.kind}</span></div>
    <span class="cadence">${cadenceLabel(item)}</span>
    ${item.subtasks.length ? `<div class="subtasks">${item.subtasks.map(sub => `<button class="${sub.done ? "done" : ""}" data-item="${item.id}" data-subtask="${sub.id}"><i>${sub.done ? "✓" : ""}</i>${escapeHtml(sub.title)}</button>`).join("")}</div>` : ""}
    </div></div></article>`;
}
function toggleItem(id) {
  const item = state.planner.items.find(item => item.id === id);
  if (!item) return;
  item.completed = !item.completed;
  item.completions = item.completed ? [...item.completions,new Date().toISOString()] : item.completions.slice(0,-1);
  state.planner.updatedAt = new Date().toISOString(); save();
}
function toggleSubtask(itemId, subtaskId) {
  const subtask = state.planner.items.find(item => item.id === itemId)?.subtasks.find(sub => sub.id === subtaskId);
  if (!subtask) return;
  subtask.done = !subtask.done; state.planner.updatedAt = new Date().toISOString(); save();
}
function openModal(selector) { $(selector).classList.remove("hidden"); setTimeout(() => $(selector+" textarea")?.focus(), 50); }
function closeModals() { $$(".modal-backdrop").forEach(modal => modal.classList.add("hidden")); }
function toast(text) { $("#toast").textContent = text; $("#toast").classList.remove("hidden"); setTimeout(() => $("#toast").classList.add("hidden"),2200); }

async function syncPull() {
  if (!state.syncCode || !workerUrl()) return;
  state.syncStatus = "Syncing…"; render();
  try {
    const response = await fetch(`${workerUrl()}/sync?code=${state.syncCode}`);
    if (response.status === 404) { state.syncStatus = "Ready to sync"; render(); return; }
    if (!response.ok) throw new Error();
    state.planner = (await response.json()).data;
    state.syncStatus = "Synced just now"; save(false);
  } catch { state.syncStatus = "Saved on this device"; render(); }
}
async function syncPush() {
  if (!workerUrl()) { state.syncStatus = "Worker URL needed"; render(); return; }
  state.syncStatus = "Syncing…"; render();
  try {
    const response = await fetch(workerUrl()+"/sync",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({code:state.syncCode,data:state.planner})});
    if (!response.ok) throw new Error();
    state.syncStatus = "Synced just now";
  } catch { state.syncStatus = "Saved on this device"; }
  render();
}
function showSync() {
  $("#syncHeading").textContent = state.syncCode ? "Your sync code" : "Keep every device together";
  $("#syncBody").innerHTML = state.syncCode ? `
    <div class="code-display">${state.syncCode.slice(0,4)} ${state.syncCode.slice(4)}</div>
    <p class="modal-note">Enter this code on your iPhone or iPad to open the same planner.</p>
    <button class="primary full" id="copyCode">Copy code</button>` : `
    <p class="modal-note">Create a private code on your first device, then enter it on the other one.</p>
    <button class="primary full" id="createCode">Create my sync code</button><div class="or-divider"><span>or</span></div>
    <label class="code-input-label">I already have a code<input id="existingCode" maxlength="8" placeholder="ABCD1234"></label>
    <button class="secondary full" id="connectCode">Connect this device</button>`;
  $("#copyCode")?.addEventListener("click", () => navigator.clipboard.writeText(state.syncCode).then(() => toast("Sync code copied")));
  $("#createCode")?.addEventListener("click", () => connect(randomCode()));
  $("#connectCode")?.addEventListener("click", () => connect($("#existingCode").value));
  openModal("#syncModal");
}
function connect(code) {
  const clean = code.toUpperCase().replace(/[^A-Z2-9]/g,"").slice(0,8);
  if (clean.length !== 8) return toast("Enter all 8 characters");
  state.syncCode = clean; localStorage.setItem(CODE_KEY,clean); closeModals(); syncPull();
}

$("#addButton").addEventListener("click", () => openModal("#addModal"));
$("#syncButton").addEventListener("click", showSync);
$("#settingsButton").addEventListener("click", showSync);
$$("[data-close]").forEach(button => button.addEventListener("click", closeModals));
$$(".modal-backdrop").forEach(modal => modal.addEventListener("click", event => { if (event.target === modal) closeModals(); }));
$$("[data-coming]").forEach(button => button.addEventListener("click", () => toast(button.dataset.coming+" is coming next")));
$("#naturalEntry").addEventListener("input", event => {
  const value = event.target.value.trim();
  $("#entryPreview").classList.toggle("hidden", !value);
  if (value) { const item = parseEntry(value); $("#entryPreview").innerHTML = `<strong>${escapeHtml(item.title)}</strong><span>${cadenceLabel(item)} · ${item.subtasks.length} subtask${item.subtasks.length===1?"":"s"}</span>`; }
});
$("#addForm").addEventListener("submit", event => {
  event.preventDefault(); const value = $("#naturalEntry").value.trim(); if (!value) return;
  state.planner.items.push(parseEntry(value)); state.planner.updatedAt = new Date().toISOString();
  $("#naturalEntry").value = ""; $("#entryPreview").classList.add("hidden"); closeModals(); save();
});
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") syncPull(); });
window.addEventListener("focus", syncPull);
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js");
render(); if (state.syncCode) syncPull();

const HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};
const json = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), { status, headers: { ...HEADERS, ...extra } });
const validCode = code => typeof code === "string" && /^[A-Z2-9]{8}$/.test(code);
// Match the app's connect() behavior so a copied/displayed code such as
// "ABCD EFGH" resolves to the same stored eight-character sync code.
const normalizeCode = code => String(code || "").toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 8);
const CACHE_HEADERS = { "Cache-Control": "public, max-age=900" };
const VAPID = {
  publicKey: "BNtvrXiz9-qpLKkdiaa3fp8c7ZU1akqh7cX2aLZuej5LeASGwBo7pvawZXq7uLJfKNVj9YHtth3md7BhhZyR5rM",
  x: "22-teLP36qksqR2Jprd-nxztlTVqSqHtxfZotm56Pks",
  y: "eASGwBo7pvawZXq7uLJfKNVj9YHtth3md7BhhZyR5rM",
  d: "uvROSVuSTaAjcfFNvJYGeBsXnlN20cnezICTHqvU97I",
  subject: "https://jedavid33-design.github.io/OpalDay/"
};

const clean = value => String(value || "").replace(/&#8211;|&ndash;/g, "–").replace(/&#8217;|&rsquo;/g, "’").replace(/&amp;/g, "&").replace(/<[^>]*>/g, "").trim();
const isoDate = date => [date.getUTCFullYear(), String(date.getUTCMonth() + 1).padStart(2, "0"), String(date.getUTCDate()).padStart(2, "0")].join("-");
const addDays = (date, days) => new Date(date.getTime() + days * 86400000);
const first = value => value?.default || Object.values(value || {})[0] || "";

async function fetchJSON(url) {
  const response = await fetch(url, { headers: { "User-Agent": "OpalDay/0.5 sports calendar" }, cf: { cacheTtl: 900, cacheEverything: true } });
  if (!response.ok) throw new Error("Schedule source returned " + response.status);
  return response.json();
}

async function astrosSchedule() {
  const now = new Date(), start = isoDate(addDays(now, -120)), end = isoDate(addDays(now, 365));
  const url = "https://statsapi.mlb.com/api/v1/schedule?sportId=1&teamId=117&startDate=" + start + "&endDate=" + end + "&hydrate=team,venue";
  const raw = await fetchJSON(url);
  return (raw.dates || []).flatMap(day => (day.games || []).map(game => ({
    uid: "mlb-" + game.gamePk,
    title: clean(game.teams?.away?.team?.name) + " at " + clean(game.teams?.home?.team?.name),
    start: game.gameDate,
    status: game.status?.detailedState || "",
    url: "https://www.mlb.com/gameday/" + game.gamePk
  })));
}

async function vgkSchedule() {
  const now = new Date(), year = now.getUTCFullYear(), startYear = now.getUTCMonth() >= 6 ? year : year - 1;
  const raw = await fetchJSON("https://api-web.nhle.com/v1/club-schedule-season/VGK/" + startYear + (startYear + 1));
  return (raw.games || []).map(game => {
    const away = [first(game.awayTeam?.placeName), first(game.awayTeam?.commonName)].filter(Boolean).join(" ");
    const home = [first(game.homeTeam?.placeName), first(game.homeTeam?.commonName)].filter(Boolean).join(" ");
    return {
      uid: "nhl-" + game.id,
      title: away + " at " + home,
      start: game.startTimeUTC || game.gameDate + "T12:00:00Z",
      status: game.gameState || "",
      url: "https://www.nhl.com/gamecenter/" + game.id
    };
  });
}

async function pwhlGames(teamNeedle) {
  const key = "446521baf8c38984";
  const url = "https://lscluster.hockeytech.com/feed/index.php?feed=modulekit&view=scorebar&numberofdaysback=120&numberofdaysahead=365&key=" + key + "&client_code=pwhl&lang=en&fmt=json";
  const raw = await fetchJSON(url), games = raw?.SiteKit?.Scorebar;
  if (!Array.isArray(games)) throw new Error("PWHL schedule format changed");
  const needle = teamNeedle.toLowerCase(), min = Date.now() - 120 * 86400000, max = Date.now() + 365 * 86400000;
  return games.filter(game => {
    const start = Date.parse(game.GameDateISO8601 || "");
    return start >= min && start <= max && (String(game.HomeLongName || "").toLowerCase().includes(needle) || String(game.VisitorLongName || "").toLowerCase().includes(needle));
  }).map(game => ({
    uid: "pwhl-" + game.ID,
    title: clean(game.VisitorLongName) + " at " + clean(game.HomeLongName),
    start: game.GameDateISO8601,
    status: game.GameStatusStringLong || game.GameStatusString || "",
    url: game.GameSummaryUrl ? "https://www.thepwhl.com/en/stats/game-center/" + game.GameSummaryUrl : "https://www.thepwhl.com/en/schedule"
  }));
}

function zonedLocalToISO(dateText, timeText, timeZone) {
  const date = String(dateText || "").replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3");
  const time = String(timeText || "12:00:00").slice(0, 8);
  let guess = Date.parse(date + "T" + time + "Z");
  if (!Number.isFinite(guess)) return null;
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone: timeZone || "America/Chicago", hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const parts = Object.fromEntries(formatter.formatToParts(new Date(guess)).filter(x => x.type !== "literal").map(x => [x.type, x.value]));
  const represented = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second);
  return new Date(guess - (represented - guess)).toISOString();
}

async function wpblSchedule() {
  const raw = await fetchJSON("https://www.womensprobaseballleague.com/wp-json/wp/v2/wpbl_game?per_page=100&_fields=id,title,link,acf");
  if (!Array.isArray(raw)) throw new Error("WPBL schedule format changed");
  const teams = { "2485": "Boston", "5222": "Los Angeles", "5229": "San Francisco", "5233": "New York" };
  return raw.map(game => {
    const acf = game.acf || {}, away = teams[String(acf.away_team?.value || "")], home = teams[String(acf.home_team?.value || "")];
    const title = away && home ? away + " at " + home : clean(game.title?.rendered);
    const start = zonedLocalToISO(acf.game_date?.value || acf.game_date?.simple_value_formatted, acf.game_time?.value || acf.game_time?.simple_value_formatted, acf.game_timezone?.value || "America/Chicago");
    if (!start) return null;
    return { uid: "wpbl-" + game.id, title, start, status: clean(acf.game_status?.value || acf.game_status?.simple_value_formatted), url: game.link || "https://www.womensprobaseballleague.com/schedule/" };
  }).filter(Boolean);
}

async function sports(id) {
  if (id === "astros") return astrosSchedule();
  if (id === "vgk") return vgkSchedule();
  if (id === "pwhl-vegas") return pwhlGames("Las Vegas");
  if (id === "boston-fleet") return pwhlGames("Boston Fleet");
  if (id === "wpbl") return wpblSchedule();
  throw new Error("Unknown sports calendar");
}

const te = new TextEncoder();
const concat = (...parts) => { const length = parts.reduce((n, x) => n + x.length, 0), out = new Uint8Array(length); let at = 0; for (const part of parts) { out.set(part, at); at += part.length; } return out; };
const unb64 = value => { const text = String(value || "").replace(/-/g, "+").replace(/_/g, "/") + "===".slice((String(value || "").length + 3) % 4); const raw = atob(text); return Uint8Array.from(raw, c => c.charCodeAt(0)); };
const b64 = value => { let raw = ""; for (const byte of new Uint8Array(value)) raw += String.fromCharCode(byte); return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
async function hmac(key, data) { const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, data)); }
async function hkdfExtract(salt, ikm) { return hmac(salt, ikm); }
async function hkdfExpand(prk, info, length) { const out = await hmac(prk, concat(info, new Uint8Array([1]))); return out.slice(0, length); }
async function vapidHeaders(endpoint) {
  const audience = new URL(endpoint).origin, header = b64(te.encode(JSON.stringify({ typ: "JWT", alg: "ES256" }))), payload = b64(te.encode(JSON.stringify({ aud: audience, exp: Math.floor(Date.now() / 1000) + 43200, sub: VAPID.subject })));
  const key = await crypto.subtle.importKey("jwk", { kty: "EC", crv: "P-256", x: VAPID.x, y: VAPID.y, d: VAPID.d, ext: true }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, te.encode(header + "." + payload));
  return { Authorization: "vapid t=" + header + "." + payload + "." + b64(signature) + ", k=" + VAPID.publicKey, TTL: "86400" };
}
async function encryptPush(subscription, payload) {
  const clientPublic = unb64(subscription.p256dh), auth = unb64(subscription.auth), pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]), clientKey = await crypto.subtle.importKey("raw", clientPublic, { name: "ECDH", namedCurve: "P-256" }, false, []), shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: clientKey }, pair.privateKey, 256)), serverPublic = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const prkKey = await hkdfExtract(auth, shared), ikm = await hkdfExpand(prkKey, concat(te.encode("WebPush: info\0"), clientPublic, serverPublic), 32), salt = crypto.getRandomValues(new Uint8Array(16)), prk = await hkdfExtract(salt, ikm), cek = await hkdfExpand(prk, te.encode("Content-Encoding: aes128gcm\0"), 16), nonce = await hkdfExpand(prk, te.encode("Content-Encoding: nonce\0"), 12), aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]), plaintext = concat(te.encode(JSON.stringify(payload)), new Uint8Array([2])), ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aes, plaintext)), size = new Uint8Array(4);
  new DataView(size.buffer).setUint32(0, 4096); return concat(salt, size, new Uint8Array([serverPublic.length]), serverPublic, ciphertext);
}
async function sendPush(row, payload) {
  const subscription = { p256dh: row.p256dh, auth: row.auth }, body = await encryptPush(subscription, payload), headers = await vapidHeaders(row.endpoint);
  return fetch(row.endpoint, { method: "POST", headers: { ...headers, "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream" }, body });
}
function zoneParts(date, timeZone) { const formatter = new Intl.DateTimeFormat("en-CA", { timeZone, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short" }), p = Object.fromEntries(formatter.formatToParts(date).filter(x => x.type !== "literal").map(x => [x.type, x.value])); return { year: +p.year, month: +p.month, day: +p.day, hour: +p.hour % 24, minute: +p.minute, weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday) }; }
const fakeStamp = p => Date.UTC(p.year, p.month - 1, p.day, p.hour || 0, p.minute || 0), keyFrom = p => [p.year, String(p.month).padStart(2, "0"), String(p.day).padStart(2, "0")].join("-");
const plusLocalDays = (key, days) => { const d = new Date(key + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
const localCompletionKey = (value, timeZone) => keyFrom(zoneParts(new Date(value), timeZone));
const completionOn = (item, key, timeZone) => (item.completions || []).some(value => localCompletionKey(value, timeZone) === key);
const utcSundayKey = key => { const d = new Date(key + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() - d.getUTCDay()); return d.toISOString().slice(0, 10); };
const itemTarget = item => item.cadence === "weekly" ? Number(item.target || 1) : 1;
function itemOccurrenceKey(item, key) { if (item.cadence === "daily") return "day:" + key; if (item.cadence === "weekly") return item.fixedDay !== null && item.fixedDay !== undefined && itemTarget(item) === 1 ? "day:" + key : "week:" + utcSundayKey(key); if (item.cadence === "monthly") return "month:" + key.slice(0, 7); if (item.cadence === "once") return "once:" + (item.hardDate || String(item.createdAt || "").slice(0, 10) || "undated"); if (item.cadence === "interval") return "day:" + key; return "day:" + key; }
const itemOccurrenceState = (item, key) => (item.occurrenceStates || {})[itemOccurrenceKey(item, key)] || null;
function legacyPeriodCount(item, key, timeZone) { const completions = item.completions || []; if (item.cadence === "daily" || item.cadence === "interval" || (item.cadence === "weekly" && item.fixedDay !== null && item.fixedDay !== undefined && itemTarget(item) === 1)) return completions.filter(value => localCompletionKey(value, timeZone) === key).length; if (item.cadence === "monthly") return completions.filter(value => localCompletionKey(value, timeZone).slice(0, 7) === key.slice(0, 7)).length; if (item.cadence === "once") return completions.length; const start = utcSundayKey(key), end = plusLocalDays(start, 7); return completions.filter(value => { const local = localCompletionKey(value, timeZone); return local >= start && local < end; }).length; }
function periodComplete(item, key, timeZone) { const target = itemTarget(item), parent = item.kind === "medication" ? null : itemOccurrenceState(item, key)?.parent; if (parent && typeof parent.completed === "boolean" && target === 1) return parent.completed; return legacyPeriodCount(item, key, timeZone) >= target; }
function addMonthsKey(key, months) { const d = new Date(key + "T12:00:00Z"), wanted = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + Number(months || 0)); const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12)).getUTCDate(); d.setUTCDate(Math.min(wanted, last)); return d.toISOString().slice(0,10); }
function latestCompletionKey(item) { return (item.completions || []).map(v => new Date(v)).filter(d => !Number.isNaN(d.getTime())).sort((a,b)=>b-a)[0]?.toISOString().slice(0,10) || null; }
function reminderDueKey(item) { if (item.cadence === "interval_months") { const completed = latestCompletionKey(item), anchor = completed || item.hardDate || String(item.createdAt || "").slice(0,10); return anchor ? addMonthsKey(anchor, completed ? Number(item.intervalMonths || 3) : 0) : null; } return item.hardDate || null; }
function itemOccurs(item, key) { const d = new Date(key + "T12:00:00Z"); if (item.cadence === "daily") return true; if (item.cadence === "once") return !item.hardDate || item.hardDate === key; if (item.cadence === "weekly") return item.fixedDay === null || item.fixedDay === undefined || Number(item.fixedDay) === d.getUTCDay(); if (item.cadence === "monthly") { const anchor = new Date((item.hardDate || String(item.createdAt || "").slice(0, 10) || key) + "T12:00:00Z"); return d.getUTCDate() === anchor.getUTCDate(); } if (item.cadence === "interval") { const anchor = new Date((item.hardDate || String(item.createdAt || "").slice(0, 10) || key) + "T12:00:00Z"), days = Math.round((d - anchor) / 86400000); return days >= 0 && days % ((Number(item.intervalWeeks) || 1) * 7) === 0; } if (item.cadence === "interval_months") return reminderDueKey(item) === key; return item.kind !== "medication"; }
const eventDateDiff = (a, b) => Math.round((new Date(a + "T12:00:00Z") - new Date(b + "T12:00:00Z")) / 86400000);
function eventRecurrenceRule(event) {
  const legacy = event.calendarId === "birthdays" ? "yearly" : event.recurrence;
  if (!legacy && !event.recurrenceRule?.frequency) return null;
  const saved = event.recurrenceRule || {}, frequency = saved.frequency || legacy, interval = Math.max(1, Number(saved.interval) || 1), startDay = new Date(event.date + "T12:00:00Z").getUTCDay();
  const weekdays = frequency === "weekly" ? (Array.isArray(saved.weekdays) && saved.weekdays.length ? [...new Set(saved.weekdays.map(Number).filter(n => n >= 0 && n <= 6))] : [startDay]) : [];
  const legacyDate = event.recurrenceUntil || null, end = saved.end?.type ? { type: saved.end.type, date: saved.end.date || null, count: Math.max(1, Number(saved.end.count) || 1) } : legacyDate ? { type: "date", date: legacyDate, count: null } : { type: "never", date: null, count: null };
  return { frequency, interval, weekdays, end };
}
const eventMonthDiff = (a, b) => { const x = new Date(a + "T12:00:00Z"), y = new Date(b + "T12:00:00Z"); return (x.getUTCFullYear() - y.getUTCFullYear()) * 12 + x.getUTCMonth() - y.getUTCMonth(); };
const validUTCMonthDay = (year, month, day) => { const d = new Date(Date.UTC(year, month, day, 12)); return d.getUTCFullYear() === year && d.getUTCMonth() === month && d.getUTCDate() === day; };
const utcWeekStart = key => { const d = new Date(key + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() - d.getUTCDay()); return d; };
function matchesEventRecurrence(event, key, rule) {
  const diff = eventDateDiff(key, event.date), candidate = new Date(key + "T12:00:00Z"), start = new Date(event.date + "T12:00:00Z");
  if (rule.frequency === "daily") return diff % rule.interval === 0;
  if (rule.frequency === "weekly") { const weeks = Math.round((utcWeekStart(key) - utcWeekStart(event.date)) / (7 * 86400000)); return weeks >= 0 && weeks % rule.interval === 0 && rule.weekdays.includes(candidate.getUTCDay()); }
  if (rule.frequency === "monthly") { const months = eventMonthDiff(key, event.date); return months >= 0 && months % rule.interval === 0 && candidate.getUTCDate() === start.getUTCDate(); }
  if (rule.frequency === "yearly") { const years = candidate.getUTCFullYear() - start.getUTCFullYear(); return years >= 0 && years % rule.interval === 0 && candidate.getUTCMonth() === start.getUTCMonth() && candidate.getUTCDate() === start.getUTCDate(); }
  return false;
}
function eventOccurrenceOrdinal(event, key, rule) {
  if (rule.frequency === "daily") return Math.floor(eventDateDiff(key, event.date) / rule.interval) + 1;
  let count = 0, start = new Date(event.date + "T12:00:00Z"), candidate = new Date(key + "T12:00:00Z");
  if (rule.frequency === "weekly") { const firstWeek = utcWeekStart(event.date), weeks = Math.round((utcWeekStart(key) - firstWeek) / (7 * 86400000)); for (let w = 0; w <= weeks; w += rule.interval) for (const weekday of rule.weekdays) { const day = new Date(firstWeek); day.setUTCDate(day.getUTCDate() + w * 7 + weekday); const dayKey = day.toISOString().slice(0, 10); if (dayKey >= event.date && dayKey <= key) count++; } return count; }
  if (rule.frequency === "monthly") { const anchorDay = start.getUTCDate(), months = eventMonthDiff(key, event.date); for (let m = 0; m <= months; m += rule.interval) { const total = start.getUTCMonth() + m, year = start.getUTCFullYear() + Math.floor(total / 12), month = ((total % 12) + 12) % 12; if (validUTCMonthDay(year, month, anchorDay)) { const day = new Date(Date.UTC(year, month, anchorDay, 12)).toISOString().slice(0, 10); if (day <= key) count++; } } return count; }
  if (rule.frequency === "yearly") { const years = candidate.getUTCFullYear() - start.getUTCFullYear(); for (let y = 0; y <= years; y += rule.interval) if (validUTCMonthDay(start.getUTCFullYear() + y, start.getUTCMonth(), start.getUTCDate())) { const day = new Date(Date.UTC(start.getUTCFullYear() + y, start.getUTCMonth(), start.getUTCDate(), 12)).toISOString().slice(0, 10); if (day <= key) count++; } return count; }
  return 1;
}
function recurrenceStartsOn(event, key) { if (!event.date || key < event.date) return false; const rule = eventRecurrenceRule(event); if (!rule) return key === event.date; if (rule.end.type === "date" && rule.end.date && key > rule.end.date) return false; if (!matchesEventRecurrence(event, key, rule)) return false; return rule.end.type !== "count" || eventOccurrenceOrdinal(event, key, rule) <= rule.end.count; }
function eventOccurrenceStart(event, key) { const span = event.endDate ? Math.max(0, eventDateDiff(event.endDate, event.date)) : 0; for (let back = 0; back <= span; back++) { const candidate = plusLocalDays(key, -back); if (recurrenceStartsOn(event, candidate)) return candidate; } return null; }
function eventOccurs(event, key) { return !!eventOccurrenceStart(event, key); }

// Read-only Widgy feed helpers. These intentionally work from the existing
// planner payload without changing its shape, storage key, or sync behavior.
function validTimeZone(value) {
  try { new Intl.DateTimeFormat("en-US", { timeZone: value }).format(); return true; }
  catch { return false; }
}
function widgetDateLabels(key) {
  const date = new Date(key + "T12:00:00Z");
  return {
    weekday: new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long" }).format(date),
    short: new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }).format(date),
    long: new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" }).format(date)
  };
}
function clockMinutes(value, fallback = 0) {
  if (!/^\d{1,2}:\d{2}$/.test(String(value || ""))) return fallback;
  const [hour, minute] = String(value).split(":").map(Number);
  return hour * 60 + minute;
}
const DAILY_QUOTES = [
  { text: "Small steps still move you forward.", author: "OpalDay" },
  { text: "Rest is part of the rhythm, too.", author: "OpalDay" },
  { text: "You do not have to hurry to make progress.", author: "OpalDay" },
  { text: "A gentle day can still be a meaningful one.", author: "OpalDay" },
  { text: "Notice the small things going right.", author: "OpalDay" },
  { text: "Curiosity is a quiet kind of courage.", author: "OpalDay" },
  { text: "Begin with what feels possible today.", author: "OpalDay" },
  { text: "Ordinary progress is still worth celebrating.", author: "OpalDay" },
  { text: "You can pause without losing your way.", author: "OpalDay" },
  { text: "One kind choice can soften a whole day.", author: "OpalDay" },
  { text: "There is room to grow at your own pace.", author: "OpalDay" },
  { text: "Today only asks you to meet it where you are.", author: "OpalDay" },
  { text: "Quiet resilience counts, even when no one sees it.", author: "OpalDay" },
  { text: "A little progress and a little rest can coexist.", author: "OpalDay" },
  { text: "Let enough be enough for today.", author: "OpalDay" },
  { text: "Small victories deserve a moment of light.", author: "OpalDay" },
  { text: "You are allowed to take the gentler path.", author: "OpalDay" },
  { text: "Keep what helped; release what did not.", author: "OpalDay" },
  { text: "Your pace is still a pace.", author: "OpalDay" },
  { text: "There is wisdom in beginning again softly.", author: "OpalDay" },
  { text: "Make space for one good thing.", author: "OpalDay" },
  { text: "Even a quiet day can hold something lovely.", author: "OpalDay" },
  { text: "You have already made it through every yesterday.", author: "OpalDay" },
  { text: "Let today be useful, restful, or simply yours.", author: "OpalDay" }
];
function dailyQuoteForDate(key) {
  const index = Math.floor(Date.parse(key + "T00:00:00Z") / 86400000) % DAILY_QUOTES.length;
  return { ...DAILY_QUOTES[index], date: key };
}
const allDayDismissalKey = (event, occurrenceStart) => String(event.id || "") + "@" + occurrenceStart;
function widgetPeriodCount(item, key, timeZone) {
  const parent = item.kind === "medication" ? null : itemOccurrenceState(item, key)?.parent;
  if (parent && typeof parent.completed === "boolean" && itemTarget(item) === 1) return parent.completed ? 1 : 0;
  return legacyPeriodCount(item, key, timeZone);
}
function widgetItemDue(item, key, timeZone) {
  if (item.kind === "medication") return itemOccurs(item, key) || completionOn(item, key, timeZone);
  if (item.kind === "reminder") { const due = reminderDueKey(item); return !!due && due === key; }
  return itemOccurs(item, key);
}
function widgetMedicationStatus(item, key, parts, timeZone, now) {
  if (completionOn(item, key, timeZone)) return "taken";
  if (item.snoozedUntil && new Date(item.snoozedUntil) > now) return "snoozed";
  if (!item.fixedTime) return "due";
  return parts.hour * 60 + parts.minute > clockMinutes(item.fixedTime) ? "overdue" : "scheduled";
}
function nthUTCWeekday(year, month, weekday, n) {
  const date = new Date(Date.UTC(year, month, 1, 12));
  date.setUTCDate(1 + ((weekday - date.getUTCDay() + 7) % 7) + (n - 1) * 7);
  return date;
}
function lastUTCWeekday(year, month, weekday) {
  const date = new Date(Date.UTC(year, month + 1, 0, 12));
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() - weekday + 7) % 7));
  return date;
}
function widgetUSHolidays(year) {
  const entries = [
    ["New Year’s Day", new Date(Date.UTC(year, 0, 1, 12))],
    ["Martin Luther King Jr. Day", nthUTCWeekday(year, 0, 1, 3)],
    ["Presidents’ Day", nthUTCWeekday(year, 1, 1, 3)],
    ["Memorial Day", lastUTCWeekday(year, 4, 1)],
    ["Juneteenth", new Date(Date.UTC(year, 5, 19, 12))],
    ["Independence Day", new Date(Date.UTC(year, 6, 4, 12))],
    ["Labor Day", nthUTCWeekday(year, 8, 1, 1)],
    ["Columbus Day", nthUTCWeekday(year, 9, 1, 2)],
    ["Veterans Day", new Date(Date.UTC(year, 10, 11, 12))],
    ["Thanksgiving", nthUTCWeekday(year, 10, 4, 4)],
    ["Christmas Day", new Date(Date.UTC(year, 11, 25, 12))]
  ];
  return entries.map(([title, date], index) => ({ id: "us-holiday-" + year + "-" + index, title, date: date.toISOString().slice(0, 10), allDay: true, calendarId: "holidays", source: "builtin" }));
}
function widgetEventInterval(event, key, occurrenceStart) {
  const span = event.endDate ? Math.max(0, eventDateDiff(event.endDate, event.date)) : 0;
  const occurrenceEnd = plusLocalDays(occurrenceStart, span);
  const start = key === occurrenceStart && event.time ? clockMinutes(event.time) : 0;
  let end = key === occurrenceEnd && event.end ? clockMinutes(event.end) : 1440;
  if (key === occurrenceStart && key === occurrenceEnd && event.time && event.end && end <= start) end += 1440;
  if (!event.allDay && !event.end && key === occurrenceStart) end = Math.min(1440, start + 60);
  return { start, end, occurrenceEnd };
}
function widgetEventRecord(event, key, occurrenceStart, calendar, nowMinute) {
  const interval = widgetEventInterval(event, key, occurrenceStart), allDay = !!event.allDay || !event.time;
  const isMultiDay = interval.occurrenceEnd !== occurrenceStart;
  const status = allDay ? "all-day" : nowMinute < interval.start ? "upcoming" : nowMinute < interval.end ? "ongoing" : "past";
  const continuation = key === occurrenceStart ? (isMultiDay ? "starts-today" : null) : key === interval.occurrenceEnd ? "ends-today" : "continues";
  const timeLabel = allDay ? "All day" : event.end ? clockLabel(event.time) + "–" + clockLabel(event.end) : clockLabel(event.time);
  return {
    id: String(event.id || ""),
    occurrenceId: String(event.id || "") + "@" + occurrenceStart,
    title: String(event.title || "Untitled event"),
    calendar: { id: calendar.id, name: calendar.name, color: calendar.color },
    source: event.source || "manual",
    occurrenceDate: key,
    occurrenceStartDate: occurrenceStart,
    allDay,
    startTime: event.time || null,
    startTimeLabel: allDay ? "All day" : clockLabel(event.time),
    endTime: event.end || null,
    endTimeLabel: allDay || !event.end ? null : clockLabel(event.end),
    timeLabel,
    status,
    durationMinutes: allDay ? null : Math.max(0, interval.end - interval.start),
    isMultiDay,
    continuation,
    repeating: !!eventRecurrenceRule(event),
    sportStatus: event.status || null,
    url: event.url || null
  };
}
function widgetLayout(events) {
  const ranked = [...events].sort((a, b) => {
    const priority = { ongoing: 0, upcoming: 1, "all-day": 2, past: 3 };
    return priority[a.status] - priority[b.status] || clockMinutes(a.startTime, 1500) - clockMinutes(b.startTime, 1500) || a.title.localeCompare(b.title);
  });
  const slots = ranked.slice(0, 4).map((event, index) => {
    const role = ranked.length === 1 ? "spotlight" : index === 0 ? "featured" : ranked.length === 2 ? "standard" : "compact";
    return {
      occurrenceId: event.occurrenceId,
      title: event.title,
      timeLabel: event.timeLabel,
      status: event.status,
      calendarName: event.calendar.name,
      calendarColor: event.calendar.color,
      allDay: event.allDay,
      continuation: event.continuation,
      durationMinutes: event.durationMinutes,
      role,
      heightUnits: role === "spotlight" ? 3 : role === "compact" ? 1 : 2,
      maxTitleLines: role === "compact" ? 1 : 2
    };
  });
  return {
    strategy: "adaptive-event-stack",
    primary: slots[0] || null,
    secondary: slots.slice(1),
    slots,
    overflowCount: Math.max(0, ranked.length - slots.length),
    emptyMessage: slots.length ? null : "No events today"
  };
}
function widgetTimedLayout(items) {
  const slots = items.slice(0, 4).map((item, index) => ({
    id: item.id,
    title: item.title,
    startTimeLabel: item.startTimeLabel,
    endTimeLabel: item.endTimeLabel,
    timeLabel: item.timeLabel,
    kind: item.kind,
    status: item.status,
    calendarName: item.calendar?.name || (item.kind === "medication" ? "Medication" : "Habit"),
    calendarColor: item.calendar?.color || (item.kind === "medication" ? "#a7354f" : "#8b6bb5"),
    role: items.length === 1 ? "spotlight" : index === 0 ? "featured" : items.length === 2 ? "standard" : "compact",
    maxTitleLines: index === 0 && items.length > 1 ? 2 : 1
  }));
  return { strategy: "chronological-timed-stack", primary: slots[0] || null, secondary: slots.slice(1), slots, overflowCount: Math.max(0, items.length - slots.length), emptyMessage: slots.length ? null : "Nothing else scheduled" };
}
function buildWidgetToday(planner, now, timeZone) {
  const parts = zoneParts(now, timeZone), key = keyFrom(parts), nowMinute = parts.hour * 60 + parts.minute;
  const calendars = new Map((planner.calendars || []).map(calendar => [calendar.id, calendar]));
  const fallbackCalendar = (planner.calendars || [])[0] || { id: "calendar", name: "Calendar", color: "#7f3659", visible: true };
  const calendarFor = id => calendars.get(id) || fallbackCalendar;
  const dismissedAllDay = new Set(planner.dismissedAllDayOccurrences || []);
  const savedEvents = (planner.events || []).map(event => {
    const calendar = calendarFor(event.calendarId);
    if (calendar.visible === false) return null;
    const occurrenceStart = eventOccurrenceStart(event, key);
    if (!occurrenceStart) return null;
    const record = widgetEventRecord(event, key, occurrenceStart, calendar, nowMinute);
    return record.allDay && dismissedAllDay.has(allDayDismissalKey(event, occurrenceStart)) ? null : record;
  }).filter(Boolean);
  const holidaysCalendar = calendarFor("holidays"), holidays = holidaysCalendar.visible === false ? [] : widgetUSHolidays(parts.year)
    .filter(event => event.date === key)
    .filter(event => !dismissedAllDay.has(allDayDismissalKey(event, key)))
    .map(event => widgetEventRecord(event, key, key, holidaysCalendar, nowMinute));
  const resolvedEvents = savedEvents.concat(holidays);
  const events = resolvedEvents.filter(event => event.allDay || event.status !== "past").sort((a, b) => Number(!a.allDay) - Number(!b.allDay) || clockMinutes(a.startTime, 1500) - clockMinutes(b.startTime, 1500) || a.title.localeCompare(b.title));
  const items = (planner.items || []).filter(item => widgetItemDue(item, key, timeZone));
  const allHabits = items.filter(item => item.kind === "habit").map(item => {
    const progress = widgetPeriodCount(item, key, timeZone), target = item.cadence === "weekly" ? Number(item.target || 1) : 1;
    return { id: String(item.id || ""), kind: "habit", title: String(item.title || "Untitled habit"), time: item.fixedTime || null, startTimeLabel: item.fixedTime ? clockLabel(item.fixedTime) : null, timeLabel: item.fixedTime ? clockLabel(item.fixedTime) : "Anytime", completed: progress >= target, progress, target, cadence: item.cadence || "weekly" };
  });
  const allMedications = items.filter(item => item.kind === "medication").map(item => {
    const status = widgetMedicationStatus(item, key, parts, timeZone, now);
    return { id: String(item.id || ""), kind: "medication", title: String(item.title || "Untitled medication"), time: item.fixedTime || null, startTimeLabel: item.fixedTime ? clockLabel(item.fixedTime) : null, timeLabel: item.fixedTime ? clockLabel(item.fixedTime) : "Anytime", completed: status === "taken", status };
  });
  const allReminders = items.filter(item => item.kind === "reminder").map(item => ({
    id: String(item.id || ""), kind: "reminder", title: String(item.title || "Untitled reminder"),
    time: item.fixedTime || null, startTimeLabel: item.fixedTime ? clockLabel(item.fixedTime) : null,
    timeLabel: item.fixedTime ? clockLabel(item.fixedTime) : "Anytime",
    completed: periodComplete(item, key, timeZone), status: "due"
  }));
  const otherTimedItems = items.filter(item => !["habit", "medication", "reminder"].includes(item.kind) && item.fixedTime && !periodComplete(item, key, timeZone)).map(item => ({ id: String(item.id || ""), kind: item.kind || "item", title: String(item.title || "Untitled item"), time: item.fixedTime, startTimeLabel: clockLabel(item.fixedTime), timeLabel: clockLabel(item.fixedTime), completed: false, status: "due" }));
  const habits = allHabits.filter(item => !item.completed), medications = allMedications.filter(item => !item.completed), reminders = allReminders.filter(item => !item.completed);
  const timedFeed = events.filter(event => !event.allDay).map(event => ({
    id: event.occurrenceId, kind: "event", title: event.title, startTimeLabel: event.startTimeLabel,
    endTimeLabel: event.endTimeLabel, timeLabel: event.timeLabel, status: event.status,
    calendar: event.calendar, durationMinutes: event.durationMinutes
  })).concat(medications.filter(item => item.time).map(item => ({
    id: item.id, kind: "medication", title: item.title, startTimeLabel: item.startTimeLabel,
    endTimeLabel: null, timeLabel: item.startTimeLabel, status: item.status
  }))).concat(habits.filter(item => item.time).map(item => ({
    id: item.id, kind: "habit", title: item.title, startTimeLabel: item.startTimeLabel,
    endTimeLabel: null, timeLabel: item.startTimeLabel, status: "due"
  }))).concat(otherTimedItems.map(item => ({
    id: item.id, kind: item.kind, title: item.title, startTimeLabel: item.startTimeLabel,
    endTimeLabel: null, timeLabel: item.startTimeLabel, status: item.status
  }))).sort((a, b) => clockMinutes(a.kind === "event" ? resolvedEvents.find(event => event.occurrenceId === a.id)?.startTime : (items.find(item => String(item.id || "") === a.id)?.fixedTime), 1500) - clockMinutes(b.kind === "event" ? resolvedEvents.find(event => event.occurrenceId === b.id)?.startTime : (items.find(item => String(item.id || "") === b.id)?.fixedTime), 1500) || a.title.localeCompare(b.title));
  const habitsDone = allHabits.filter(item => item.completed).length, medicationsDone = allMedications.filter(item => item.completed).length;
  const total = allHabits.length + allMedications.length, complete = habitsDone + medicationsDone;
  // Medications belong in the widget's Events/“What’s happening” section and
  // always win the limited event slots. Include anytime medications too.
  const medicationEventRows = medications.map(item => ({
    id: item.id, kind: "medication", title: item.title,
    startTimeLabel: item.startTimeLabel || "Anytime", endTimeLabel: null,
    timeLabel: item.startTimeLabel || "Anytime", status: item.status,
    calendar: { id: "medications", name: "Medication", color: "#a7354f" }, durationMinutes: null
  }));
  const reminderEventRows = reminders.map(item => ({
    id: item.id, kind: "reminder", title: item.title,
    startTimeLabel: item.startTimeLabel || "Anytime", endTimeLabel: null,
    timeLabel: item.startTimeLabel || "Anytime", status: "due",
    calendar: { id: "reminders", name: "Reminder", color: "#7a6685" }, durationMinutes: null
  }));
  const nonMedicationTimedFeed = timedFeed.filter(item => !["medication", "reminder"].includes(item.kind));
  const whatsHappening = medicationEventRows.concat(events.filter(event => event.allDay).map(event => ({
    id: event.occurrenceId, kind: "event", title: event.title, startTimeLabel: "All day",
    endTimeLabel: null, timeLabel: "All day", status: "all-day", calendar: event.calendar,
    durationMinutes: null
  })), nonMedicationTimedFeed, reminderEventRows);
  const widgetHabits = habits.filter(item => !item.time);
  const widgetHabitSelection = widgetHabits.map((item, index) => ({ item, index, priority: ({ high: 0, medium: 1, low: 2 })[(items.find(raw => String(raw.id || "") === item.id)?.priority || "medium")] ?? 1 })).sort((a, b) => a.priority - b.priority || Number(b.item.cadence === "daily") - Number(a.item.cadence === "daily") || a.index - b.index).map(entry => entry.item);
  const stats = { events: whatsHappening.length, habits: widgetHabits.length, streak: null, streakLabel: "-" };
  const widgetSlots = {
    events: Array.from({ length: 3 }, (_, index) => {
      const item = whatsHappening[index];
      return item ? { startTimeLabel: String(item.startTimeLabel || ""), title: String(item.title || "") } : { startTimeLabel: "", title: "" };
    }),
    habits: Array.from({ length: 2 }, (_, index) => {
      const item = widgetHabitSelection[index];
      return item ? { timeLabel: String(item.timeLabel || ""), title: String(item.title || "") } : { timeLabel: "", title: "" };
    })
  };
  return {
    schemaVersion: 2,
    generatedAt: now.toISOString(),
    date: key,
    timezone: timeZone,
    labels: { ...widgetDateLabels(key), sections: { timed: "What’s happening", habits: "Habits", allDay: "All day" } },
    events,
    allDayEvents: events.filter(event => event.allDay),
    timedFeed,
    habits,
    medications,
    reminders,
    otherTimedItems,
    dailyQuote: dailyQuoteForDate(key),
    eventCount: whatsHappening.length,
    habitCount: widgetHabits.length,
    stats,
    widgetSlots,
    widget: {
      events: whatsHappening.slice(0, 3),
      habits: widgetHabitSelection.slice(0, 2),
      eventCount: whatsHappening.length,
      habitCount: widgetHabits.length,
      eventOverflowCount: Math.max(0, whatsHappening.length - 3),
      habitOverflowCount: Math.max(0, widgetHabits.length - 2),
      stats
    },
    summary: {
      events: events.length,
      timedItems: timedFeed.length,
      habits: { complete: habitsDone, total: allHabits.length },
      medications: { complete: medicationsDone, total: allMedications.length },
      tasks: { complete, total, percent: total ? Math.round(complete / total * 100) : 0 }
    },
    layout: { events: widgetLayout(events), timedFeed: widgetTimedLayout(timedFeed) }
  };
}
function dueNow(nowStamp, dateKey, time, offset) { const [year, month, day] = dateKey.split("-").map(Number), [hour, minute] = String(time || "12:00").split(":").map(Number), target = Date.UTC(year, month - 1, day, hour || 0, minute || 0) + offset * 60000, delta = Math.floor((nowStamp - target) / 60000); return delta >= 0 && delta < 5; }
function clockLabel(time) { let [hour, minute] = String(time || "12:00").split(":").map(Number); const period = hour >= 12 ? "PM" : "AM"; hour = hour % 12 || 12; return hour + ":" + String(minute || 0).padStart(2, "0") + " " + period; }
function collectJobs(planner, now, timeZone) {
  const parts = zoneParts(now, timeZone), today = keyFrom(parts), tomorrow = plusLocalDays(today, 1), nowStamp = fakeStamp(parts), dayReminders = planner.dayReminders?.[today] || { items: [], events: [] }, jobs = [];
  for (const item of planner.items || []) { if (periodComplete(item, today, timeZone) || !itemOccurs(item, today)) continue; const bulk = dayReminders.items?.includes(item.id), enabled = !!item.notification?.enabled; if (!bulk && !enabled) continue; const time = item.notification?.time || item.fixedTime || "12:00", medication = item.kind === "medication", offsets = medication && enabled ? [-60, 0, 30, 60, 120, 180, 240, 300, 360, 420, 480] : [0]; for (const offset of offsets) if (dueNow(nowStamp, today, time, offset)) { const bucket = offset < 0 ? "early" : offset === 0 ? "due" : "overdue-" + offset, title = medication ? offset < 0 ? "Medication due in one hour" : offset === 0 ? "Medication due now" : "Medication overdue" : "OpalDay reminder"; jobs.push({ id: "item:" + item.id + ":" + today + ":" + bucket, title, body: item.title, tag: "opalday-" + item.id + "-" + bucket, url: "./" }); } }
  for (const event of planner.events || []) { const individual=!!event.notification?.enabled,bulk=dayReminders.events?.includes(event.id);if(!individual&&!bulk)continue;const candidates=bulk&&!individual?[today]:[today,tomorrow];for(const occurrence of candidates){const occurrenceStart=eventOccurrenceStart(event,occurrence);if(!occurrenceStart)continue;if(individual&&event.notification?.scope==="once"&&occurrence!==event.notification?.occurrenceDate)continue;if(individual&&event.notification?.days!=="daily"&&occurrence!==occurrenceStart)continue;const legacy=individual&&!event.notification?.time,reminderTime=individual?(event.notification?.time||event.time||"12:00"):(event.time||"12:00"),lead=legacy?Number(event.notification?.leadMinutes||0):0;if(dueNow(nowStamp,occurrence,reminderTime,-lead)){const body=legacy?(lead===1440?"Tomorrow":lead===60?"In one hour":lead===15?"In 15 minutes":event.time?"Starting now":"All day"):(event.time?"Starts at "+clockLabel(event.time):"Reminder for today");jobs.push({id:"event:"+event.id+":"+occurrence+":"+(legacy?"lead-"+lead:"time-"+reminderTime),title:legacy&&lead?"Upcoming: "+event.title:event.title,body,tag:"opalday-event-"+event.id+"-"+occurrence,url:"./"})}}}
  for (const custom of dayReminders.custom || []) if (dueNow(nowStamp, today, custom.time || "12:00", 0)) jobs.push({ id: "custom:" + custom.id + ":" + today, title: custom.title, body: custom.time ? "Reminder for today" : "All day", tag: "opalday-custom-" + custom.id + "-" + today, url: "./" });
  return jobs;
}
async function runNotifications(env) {
  const { results: subscriptions = [] } = await env.DB.prepare("SELECT endpoint, sync_code, p256dh, auth, timezone FROM push_subscriptions").all(), groups = new Map();
  for (const row of subscriptions) { const key = row.sync_code + "|" + row.timezone; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(row); }
  for (const [groupKey, rows] of groups) { const [code, timeZone] = groupKey.split("|"), stored = await env.DB.prepare("SELECT data FROM planner_sync WHERE sync_code = ?").bind(code).first(); if (!stored) continue; let planner; try { planner = JSON.parse(stored.data); } catch { continue; } for (const job of collectJobs(planner, new Date(), timeZone || "America/New_York")) { const logId = code + "|" + (timeZone || "America/New_York") + "|" + job.id, prior = await env.DB.prepare("SELECT id FROM notification_log WHERE id = ?").bind(logId).first(); if (prior) continue; let delivered = false; for (const row of rows) { try { const response = await sendPush(row, job); if (response.ok) delivered = true; else if (response.status === 404 || response.status === 410) await env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").bind(row.endpoint).run(); } catch {} } if (delivered) await env.DB.prepare("INSERT OR IGNORE INTO notification_log (id, sent_at) VALUES (?, CURRENT_TIMESTAMP)").bind(logId).run(); } }
  await env.DB.prepare("DELETE FROM notification_log WHERE sent_at < datetime('now', '-45 days')").run();
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: HEADERS });
    const url = new URL(request.url);
    if (url.pathname === "/health") return json({ ok: true, app: "OpalDay", version: "1.5.3", notifications: true, reminderTimes: "individual-first", recurringEvents: "advanced", habitOccurrences: true, widgetToday: true, widgetSchema: 2, widgetSlots: "display-safe" });
    if (url.pathname === "/push/vapid-key" && request.method === "GET") return json({ publicKey: VAPID.publicKey });
    if (url.pathname === "/push/subscribe" && request.method === "POST") {
      const payload = await request.json(), code = String(payload.code || "").toUpperCase(), subscription = payload.subscription || {}, keys = subscription.keys || {};
      if (!validCode(code) || !subscription.endpoint || !keys.p256dh || !keys.auth) return json({ error: "A sync code and push subscription are required." }, 400);
      await env.DB.prepare("INSERT INTO push_subscriptions (endpoint, sync_code, p256dh, auth, timezone, updated_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(endpoint) DO UPDATE SET sync_code=excluded.sync_code,p256dh=excluded.p256dh,auth=excluded.auth,timezone=excluded.timezone,updated_at=CURRENT_TIMESTAMP").bind(subscription.endpoint, code, keys.p256dh, keys.auth, payload.timezone || "America/New_York").run();
      return json({ ok: true });
    }
    if (url.pathname === "/push/subscribe" && request.method === "DELETE") { const payload = await request.json(); if (payload.endpoint) await env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").bind(payload.endpoint).run(); return json({ ok: true }); }
    if (url.pathname === "/sports" && request.method === "GET") {
      const id = url.searchParams.get("id") || "";
      try {
        const events = await sports(id);
        return json({ id, events, refreshedAt: new Date().toISOString() }, 200, CACHE_HEADERS);
      } catch (error) {
        return json({ error: error.message || "Schedule unavailable" }, 502);
      }
    }
    if (url.pathname === "/widget/today" && request.method === "GET") {
      const code = normalizeCode(url.searchParams.get("code"));
      if (!validCode(code)) return json({ error: "A valid sync code is required." }, 400, { "Cache-Control": "private, no-store" });
      let timeZone = url.searchParams.get("tz") || "";
      if (!validTimeZone(timeZone)) {
        const subscription = await env.DB.prepare("SELECT timezone FROM push_subscriptions WHERE sync_code = ? ORDER BY updated_at DESC LIMIT 1").bind(code).first();
        timeZone = validTimeZone(subscription?.timezone) ? subscription.timezone : "America/New_York";
      }
      const row = await env.DB.prepare("SELECT data FROM planner_sync WHERE sync_code = ?").bind(code).first();
      if (!row) return json({ error: "Sync code not found." }, 404, { "Cache-Control": "private, no-store" });
      try {
        return json(buildWidgetToday(JSON.parse(row.data), new Date(), timeZone), 200, { "Cache-Control": "private, no-store" });
      } catch {
        return json({ error: "Widget data is temporarily unavailable." }, 500, { "Cache-Control": "private, no-store" });
      }
    }
    if (url.pathname !== "/sync") return json({ error: "Not found" }, 404);

    if (request.method === "GET") {
      const code = (url.searchParams.get("code") || "").toUpperCase();
      if (!validCode(code)) return json({ error: "A valid sync code is required." }, 400);
      const row = await env.DB.prepare("SELECT data, version, updated_at FROM planner_sync WHERE sync_code = ?").bind(code).first();
      if (!row) return json({ error: "Sync code not found." }, 404);
      return json({ data: JSON.parse(row.data), version: row.version, updatedAt: row.updated_at });
    }

    if (request.method === "POST") {
      const payload = await request.json();
      const code = String(payload.code || "").toUpperCase();
      if (!validCode(code) || !payload.data || typeof payload.data !== "object") return json({ error: "A sync code and planner data are required." }, 400);
      const data = JSON.stringify(payload.data);
      if (data.length > 750000) return json({ error: "Planner data is too large." }, 413);
      await env.DB.prepare(`
        INSERT INTO planner_sync (sync_code, data, version, updated_at)
        VALUES (?, ?, 1, CURRENT_TIMESTAMP)
        ON CONFLICT(sync_code) DO UPDATE SET
          data = excluded.data,
          version = planner_sync.version + 1,
          updated_at = CURRENT_TIMESTAMP
      `).bind(code, data).run();
      return json({ ok: true });
    }
    return json({ error: "Method not allowed" }, 405);
  },
  async scheduled(controller, env, ctx) { ctx.waitUntil(runNotifications(env)); }
};

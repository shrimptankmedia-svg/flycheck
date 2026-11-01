// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: yellow; icon-glyph: plane;

// FlyCheck SA — Home Screen widget for Scriptable.
// Set SITE_URL to your GitHub Pages address (with the trailing slash).
// Widget parameter (optional): drone|rules|unit|yellow, e.g. mini-4-pro|private|kmh|70
// The FlyCheck web app's Settings screen shows the exact parameter to paste.
const SITE_URL = "https://shrimptankmedia-svg.github.io/flycheck/";

const fm = FileManager.local();
const dir = fm.joinPath(fm.documentsDirectory(), "flycheck");
if (!fm.fileExists(dir)) fm.createDirectory(dir);
const file = (name) => fm.joinPath(dir, name);
const age = (name) => (fm.fileExists(file(name)) ? Date.now() - fm.modificationDate(file(name)).getTime() : Infinity);

function readJson(name) {
  try { return JSON.parse(fm.readString(file(name))); } catch (e) { return null; }
}
function writeJson(name, v) { fm.writeString(file(name), JSON.stringify(v)); }

// --- Load shared rating logic from the web app (cached for offline) ---------
async function loadCore() {
  let code = null;
  try {
    const r = new Request(SITE_URL + "core.js");
    r.timeoutInterval = 10;
    code = await r.loadString();
    if (!/DroneCore/.test(code)) throw new Error("bad core.js");
    fm.writeString(file("core.js"), code);
  } catch (e) {
    if (fm.fileExists(file("core.js"))) code = fm.readString(file("core.js"));
    else throw new Error("Can't reach " + SITE_URL + " — check SITE_URL");
  }
  new Function(code)();
  return globalThis.DroneCore;
}

// Static files from the site, refreshed at most every `maxAgeH` hours.
async function cachedJson(path, name, maxAgeH) {
  if (age(name) < maxAgeH * 3600 * 1000) return readJson(name);
  try {
    const r = new Request(SITE_URL + path);
    r.timeoutInterval = 15;
    const j = await r.loadJSON();
    writeJson(name, j);
    return j;
  } catch (e) { return readJson(name); }
}

async function droneImage(family) {
  const name = "illus-" + family + ".png";
  if (age(name) < 7 * 24 * 3600 * 1000) return fm.readImage(file(name));
  try {
    const r = new Request(SITE_URL + "illus/" + family + ".png");
    r.timeoutInterval = 10;
    const img = await r.loadImage();
    fm.writeImage(file(name), img);
    return img;
  } catch (e) { return fm.fileExists(file(name)) ? fm.readImage(file(name)) : null; }
}

// --- Location ----------------------------------------------------------------
async function location() {
  try {
    Location.setAccuracyToThreeKilometers();
    const loc = await Location.current();
    writeJson("location.json", { lat: loc.latitude, lon: loc.longitude });
    return { lat: loc.latitude, lon: loc.longitude };
  } catch (e) {
    const last = readJson("location.json");
    if (last) return Object.assign({ stale: true }, last);
    throw new Error("No location — allow Location for Scriptable");
  }
}

async function getJson(url) {
  const r = new Request(url);
  r.timeoutInterval = 15;
  return r.loadJSON();
}
async function getText(url) {
  const r = new Request(url);
  r.timeoutInterval = 15;
  return r.loadString();
}

// --- Data --------------------------------------------------------------------
async function loadData(C, loc) {
  try {
    const [fc, kp3, kp27] = await Promise.all([
      getJson(C.forecastUrl(loc.lat, loc.lon)),
      getJson(C.KP_3DAY_URL).catch(() => null),
      getText(C.KP_27DAY_URL).catch(() => null),
    ]);
    if (!fc.hourly) throw new Error("Forecast error");
    const raw = { fc, kp3, kp27, at: Date.now() };
    writeJson("last.json", raw);
    return raw;
  } catch (e) {
    const last = readJson("last.json");
    if (last) return Object.assign({ offline: true }, last);
    throw e;
  }
}

// --- Widget (matches the app: status-coloured card, black ink) --------------
const INK = new Color("#111111");
const MUTED = new Color("#111111", 0.7);
const WHITE = Color.white();
const BG = { green: new Color("#8EDDA6"), yellow: new Color("#F6D365"), red: new Color("#F2785C") };
const TITLES = { green: "GO FLY", yellow: "CAUTION", red: "NO-FLY" };

function text(stack, s, font, color) {
  const t = stack.addText(s);
  t.font = font;
  t.textColor = color || INK;
  t.lineLimit = 1;
  t.minimumScaleFactor = 0.6;
  return t;
}

function dot(stack, level, size) {
  const d = stack.addStack();
  d.size = new Size(size, size);
  d.cornerRadius = size / 2;
  d.backgroundColor = BG[level] || new Color("#D9D9D2");
  d.borderWidth = 1.5;
  d.borderColor = INK;
  return d;
}

function weekRow(w, r, small) {
  const row = w.addStack();
  row.backgroundColor = WHITE;
  row.cornerRadius = small ? 14 : 18;
  row.setPadding(small ? 6 : 7, 10, small ? 6 : 6, 10);
  row.layoutHorizontally();
  row.centerAlignContent();
  // Skip days already past (an offline forecast can be a day or more old).
  const today = r.now.time.slice(0, 10);
  r.days.filter((d) => d.date >= today).slice(0, 7).forEach((d, i) => {
    if (i > 0) row.addSpacer();
    const col = row.addStack();
    col.layoutVertically();
    col.centerAlignContent();
    const ds = col.addStack();
    ds.addSpacer(); dot(ds, d.level, small ? 11 : 14); ds.addSpacer();
    if (!small) {
      col.addSpacer(2);
      const ls = col.addStack();
      ls.addSpacer();
      const label = d.date === today ? "Tdy" : new Date(d.date + "T12:00").toLocaleDateString("en-ZA", { weekday: "short" }).slice(0, 3);
      text(ls, label, Font.semiboldSystemFont(9));
      ls.addSpacer();
    }
  });
}

function build(C, r, kp, img, zone, opts) {
  const n = r.now;
  const w = new ListWidget();
  w.backgroundColor = BG[n.level] || BG.yellow;
  w.url = SITE_URL;
  w.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);
  const small = config.widgetFamily === "small";
  w.setPadding(small ? 12 : 14, small ? 14 : 16, small ? 12 : 12, small ? 14 : 16);

  const top = w.addStack();
  top.layoutHorizontally();
  const left = top.addStack();
  left.layoutVertically();
  if (small) left.addSpacer(26);
  text(left, TITLES[n.level], Font.heavySystemFont(small ? 24 : 30));
  const name = r.drone.name.replace("DJI ", "");
  text(left, (n.daylight ? "Now " : "Night ") + n.time.slice(11, 16) + " · " + name, Font.semiboldSystemFont(small ? 10 : 12));
  if (!small) {
    const kpToday = kp.byDate[n.time.slice(0, 10)];
    text(left, "Gust " + C.fmtWind(n.windMax, opts.unit) + " · Kp " + (kpToday != null ? kpToday.toFixed(1) : "–"), Font.systemFont(12), MUTED);
    if (zone) text(left, "⚠︎ " + zone, Font.semiboldSystemFont(11));
    else if (opts.note) text(left, opts.note, Font.systemFont(10), MUTED);
  }
  top.addSpacer();
  if (img) {
    const im = top.addImage(img);
    im.imageSize = small ? new Size(76, 34) : new Size(128, 58);
  }

  w.addSpacer();
  weekRow(w, r, small);
  return w;
}

function errorWidget(msg) {
  const w = new ListWidget();
  w.backgroundColor = new Color("#F2F2EE");
  w.url = SITE_URL;
  text(w, "FLYCHECK", Font.heavySystemFont(16));
  w.addSpacer(4);
  const t = w.addText(msg);
  t.font = Font.systemFont(12);
  t.textColor = MUTED;
  return w;
}

// --- Main --------------------------------------------------------------------
let widget;
try {
  const [drone, rules, unit, yellow] = (args.widgetParameter || "").split("|").map((s) => s && s.trim());
  const opts = { drone: (drone || "mini-4-pro").toLowerCase(), rules: (rules || "private").toLowerCase(), unit: (unit || "kmh").toLowerCase(), yellow: +yellow || 70 };
  const C = await loadCore();
  const loc = await location();
  const [raw, airspace] = await Promise.all([loadData(C, loc), cachedJson("data/airspace.json", "airspace.json", 72)]);
  const fc = C.parseForecast(raw.fc);
  const r = C.rateForecast(fc, opts.drone, { rules: opts.rules, yellowRatio: opts.yellow / 100 });
  const kp = C.parseKp(raw.kp3, raw.kp27);
  const img = await droneImage(C.illusFor(r.drone));
  let zone = null;
  if (airspace && C.zonesAt) {
    const zones = C.zonesAt(airspace, loc.lat, loc.lon);
    if (zones.length) zone = zones.slice(0, 2).map((z) => z.properties.name.split(" : ")[0]).join(" · ");
  }
  if (raw.offline) opts.note = "Offline · " + new Date(raw.at).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" });
  else if (loc.stale) opts.note = "Using last known location";
  widget = build(C, r, kp, img, zone, opts);
} catch (e) {
  widget = errorWidget(String(e.message || e));
}

if (config.runsInWidget) Script.setWidget(widget);
else await widget.presentMedium();
Script.complete();

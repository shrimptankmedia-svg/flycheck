(function () {
  "use strict";
  const C = window.DroneCore;
  const $ = (id) => document.getElementById(id);
  const STORE = "flycheck.settings.v1";
  const CACHE = "flycheck.last.v1";

  // ---------------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------------
  const defaults = { drone: "mini-4-pro", rules: "private", unit: "kmh", yellow: 70, place: null };
  function load(key, fallback) {
    try { return Object.assign({}, fallback, JSON.parse(localStorage.getItem(key)) || {}); } catch (e) { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode */ }
  }
  const settings = load(STORE, defaults);
  let data = null;      // { fc, kp, aviation, place, fetchedAt }
  let staticData = {};  // { airspace, aerodromes }
  let rated = null;     // rateForecast() result for the current settings
  let selectedDay = 0;

  // ---------------------------------------------------------------------------
  // Location
  // ---------------------------------------------------------------------------
  function gps() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error("No GPS in this browser"));
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude, mode: "gps" }),
        (e) => reject(new Error(e.code === 1 ? "Location permission denied" : "Couldn't get your location")),
        { enableHighAccuracy: false, timeout: 12000, maximumAge: 10 * 60 * 1000 }
      );
    });
  }

  async function placeName(lat, lon) {
    try {
      const r = await fetch("https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=" + lat + "&longitude=" + lon + "&localityLanguage=en");
      const j = await r.json();
      return [j.locality || j.city, j.principalSubdivision].filter(Boolean).join(", ") || null;
    } catch (e) { return null; }
  }

  async function resolvePlace() {
    if (settings.place && settings.place.mode === "manual") return settings.place;
    try {
      const p = await gps();
      p.name = (await placeName(p.lat, p.lon)) || p.lat.toFixed(3) + ", " + p.lon.toFixed(3);
      settings.place = p; save(STORE, settings);
      return p;
    } catch (e) {
      if (settings.place) return Object.assign({ stale: e.message }, settings.place);
      throw e;
    }
  }

  // ---------------------------------------------------------------------------
  // Fetching
  // ---------------------------------------------------------------------------
  const getJson = (url) => fetch(url).then((r) => { if (!r.ok) throw new Error(url + " → " + r.status); return r.json(); });
  const getText = (url) => fetch(url).then((r) => { if (!r.ok) throw new Error(url + " → " + r.status); return r.text(); });

  async function loadStatic() {
    const [airspace, aerodromes] = await Promise.allSettled([getJson("data/airspace.json"), getJson("data/aerodromes.json")]);
    staticData = {
      airspace: airspace.status === "fulfilled" ? airspace.value : null,
      aerodromes: aerodromes.status === "fulfilled" ? aerodromes.value : null,
    };
  }

  async function refresh() {
    $("statusCard").classList.add("loading");
    let place;
    try {
      place = await resolvePlace();
    } catch (e) {
      showError(e.message + ". Tap the location bar to search for a place.");
      return;
    }
    const [fc, kp3, kp27, aviation] = await Promise.allSettled([
      getJson(C.forecastUrl(place.lat, place.lon)),
      getJson(C.KP_3DAY_URL),
      getText(C.KP_27DAY_URL),
      getJson("data/aviation.json"),
    ]);
    if (fc.status !== "fulfilled") {
      const cached = load(CACHE, null);
      if (cached && cached.fcRaw) {
        data = hydrate(cached);
        render("Offline · forecast from " + new Date(cached.fetchedAt).toLocaleString("en-ZA"));
      } else showError("Couldn't load the forecast. Check your connection.");
      return;
    }
    const raw = {
      fcRaw: fc.value,
      kp3: kp3.status === "fulfilled" ? kp3.value : null,
      kp27: kp27.status === "fulfilled" ? kp27.value : null,
      aviation: aviation.status === "fulfilled" ? aviation.value : null,
      place, fetchedAt: Date.now(),
    };
    save(CACHE, raw);
    data = hydrate(raw);
    render(place.stale ? place.stale + " · using last known location" : "");
  }

  function hydrate(raw) {
    return { fc: C.parseForecast(raw.fcRaw), kp: C.parseKp(raw.kp3, raw.kp27), aviation: raw.aviation, place: raw.place, fetchedAt: raw.fetchedAt };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  const LABEL = { green: "Go fly", yellow: "Caution", red: "No-fly", night: "Night" };
  const SHORT = { green: "Go", yellow: "Caution", red: "No-fly" };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const unitVal = (ms) => (ms == null ? "–" : Math.round(C.UNITS[settings.unit].f(ms)));
  const unitLabel = () => C.UNITS[settings.unit].label;
  const hhmm = (iso) => iso.slice(11, 16);
  const endHour = (iso) => String(+iso.slice(11, 13) + 1).padStart(2, "0") + ":00";
  const dayShort = (date, i) => (i === 0 ? "Today" : new Date(date + "T12:00").toLocaleDateString("en-ZA", { weekday: "short" }));
  const dayLong = (date) => new Date(date + "T12:00").toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" });
  const levelRank = { green: 0, yellow: 1, red: 2 };
  const arrowSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8"/></svg>';

  function zoneInfo() {
    if (!data || !staticData.airspace) return { zones: [], level: null };
    const zones = C.zonesAt(staticData.airspace, data.place.lat, data.place.lon);
    let level = null;
    for (const z of zones) {
      const l = C.AIRSPACE[z.properties.cat][settings.rules];
      if (!level || levelRank[l] > levelRank[level]) level = l;
    }
    return { zones, level };
  }

  function nearby(km) {
    if (!data || !staticData.aerodromes) return [];
    return C.nearestAerodromes(staticData.aerodromes, data.place.lat, data.place.lon, 8).filter((a) => a.km < km);
  }

  function showError(msg) {
    const card = $("statusCard");
    card.className = "status-card";
    $("nowLabel").textContent = "No data";
    $("nowSub").textContent = msg;
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  function render(note) {
    if (!data) return;
    rated = C.rateForecast(data.fc, settings.drone, { rules: settings.rules, yellowRatio: settings.yellow / 100 });
    if (selectedDay >= rated.days.length) selectedDay = 0;
    $("placeName").textContent = data.place.name;
    $("placeMode").textContent = data.place.mode === "manual" ? "Set" : "GPS";
    renderNow(note);
    renderWeek();
    renderHangar();
    renderAirspace();
    renderSettings();
  }

  function renderNow(note) {
    const r = rated, n = r.now, d = r.drone;
    const card = $("statusCard");
    card.className = "status-card " + n.level;
    $("nowWhen").textContent = (n.daylight ? "Right now · " : "Night · ") + hhmm(n.time);
    $("nowLabel").textContent = LABEL[n.level];
    $("nowSub").textContent = n.reasons.length ? n.reasons[0].text + (n.reasons.length > 1 ? " (+" + (n.reasons.length - 1) + " more)" : "") : "Everything is well inside the " + d.name.replace("DJI ", "") + " and Part 101 limits.";
    $("nowIllus").src = "illus/" + C.illusFor(d) + ".png";
    $("nowIllus").alt = d.name + " illustration";

    const pct = Math.min(1, n.ratio) * 100;
    $("meterFill").style.width = pct + "%";
    $("meterMark").style.left = settings.yellow + "%";
    $("meterLeft").textContent = "Gusts " + unitVal(n.windMax) + " " + unitLabel();
    $("meterRight").textContent = "DJI limit " + unitVal(d.maxWindMs) + " " + unitLabel();

    // Airspace banner
    const zi = zoneInfo(), near = nearby(10);
    const banner = $("zoneBanner");
    if (zi.zones.length) {
      const names = zi.zones.slice(0, 3).map((z) => z.properties.name.split(" : ")[0]).join(" · ");
      const what = zi.level === "red" ? (settings.rules === "private" ? "Private: no-fly here" : "No flying here") : "Approval needed here";
      banner.className = "zone-banner " + zi.level;
      banner.innerHTML = "<div><b>Inside " + esc(names) + "</b>" + what + "</div><span class='round dark'>" + arrowSvg + "</span>";
      banner.hidden = false;
    } else if (near.length) {
      banner.className = "zone-banner yellow";
      banner.innerHTML = "<div><b>Within 10 km of " + esc(near[0].name) + "</b>" + near[0].km.toFixed(1) + " km away · Part 101 aerodrome rule</div><span class='round dark'>" + arrowSvg + "</span>";
      banner.hidden = false;
    } else banner.hidden = true;

    // Conditions
    $("droneChip").textContent = d.name.replace("DJI ", "") + " · " + (settings.rules === "private" ? "Private" : "RPL");
    const today = r.days[0] && r.days[0].date;
    const kp = data.kp.byDate[today];
    const metrics = [
      [unitVal(n.wind10), "Wind " + unitLabel()],
      [unitVal(n.wind120), "At 120 m"],
      [Math.round(n.temp) + "°", "Temp"],
      [(n.precipProb ?? 0) + "%", "Rain"],
      [n.visibility != null ? Math.round(n.visibility / 1000) : "–", "Vis km"],
      [kp != null ? kp.toFixed(1) : "–", "Kp info", true],
    ];
    $("metrics").innerHTML = metrics.map(([v, l, info]) =>
      '<div class="metric"><b' + (info ? ' class="info"' : "") + ">" + esc(v) + "</b><span>" + l + "</span></div>").join("");

    // Best window
    const day0 = r.days[0];
    const win = day0 && day0.bestWindow;
    $("bestWindow").textContent = win ? hhmm(win.from) + " – " + endHour(win.to) : "None today";
    $("bestNote").textContent = day0 ? day0.greenHours + " of " + day0.daylightHours + " daylight hours are green" : "";

    $("updated").textContent = (note ? note + " · " : "") + "Updated " +
      new Date(data.fetchedAt).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" }) + " · Open-Meteo · NOAA SWPC";
  }

  function renderWeek() {
    const r = rated;
    $("weekDrone").textContent = r.drone.name.replace("DJI ", "");
    $("weekRules").textContent = r.rules.id === "private" ? "Private" : "RPL / ROC";

    const maxH = Math.max(1, ...r.days.map((d) => d.daylightHours));
    $("bars").innerHTML = r.days.map((d, i) =>
      '<button type="button" class="bar" data-day="' + i + '" aria-pressed="' + (i === selectedDay) + '" aria-label="' + esc(dayLong(d.date) + ": " + LABEL[d.level] + ", " + d.greenHours + " green hours") + '">' +
      "<b>" + d.greenHours + "h</b>" +
      '<i style="height:' + Math.round(24 + (d.greenHours / maxH) * 100) + "px;background:" + C.COLORS[d.level] + '"></i>' +
      "<span>" + dayShort(d.date, i) + "</span></button>").join("");

    $("stack").innerHTML = r.days.map((d, i) => {
      const kp = data.kp.byDate[d.date];
      const win = d.bestWindow ? hhmm(d.bestWindow.from) + "–" + endHour(d.bestWindow.to) : "No green window";
      if (i !== selectedDay) {
        return '<button type="button" class="day-card ' + d.level + '" data-day="' + i + '" style="z-index:' + (i + 1) + '">' +
          '<span class="condensed">' + esc(dayLong(d.date)) + " · " + SHORT[d.level] + "</span>" +
          '<span class="meta">' + win + "<br>" + unitVal(d.windMax) + " " + unitLabel() + " · " + d.rainMax + "% rain</span></button>";
      }
      const hours = r.hours.filter((h) => h.time.startsWith(d.date) && +h.time.slice(11, 13) >= 5 && +h.time.slice(11, 13) <= 19);
      return '<article class="day-card day-open ' + d.level + '" style="z-index:' + (i + 1) + '">' +
        '<div class="row top-align"><div><div class="condensed">' + (i === 0 ? "Today" : esc(dayLong(d.date))) + "<br>" + LABEL[d.level] + "</div>" +
        '<span class="small" style="margin-top:6px">' + esc(dayLong(d.date)) + " · sunrise " + hhmm(d.sunrise) + " · sunset " + hhmm(d.sunset) + "</span></div></div>" +
        '<div class="hours">' + hours.map((h) =>
          '<div class="hour' + (h.daylight ? "" : " dark") + '" title="' + esc(h.time.slice(11, 16) + " " + (h.reasons.map((x) => x.text).join("; ") || "Inside limits")) + '">' +
          '<i style="height:' + ({ green: 36, yellow: 48, red: 60 }[h.level]) + "px;background:" + C.COLORS[h.level] + '"></i><span>' + h.time.slice(11, 13) + "</span></div>").join("") + "</div>" +
        (d.reasons.length ? '<ul class="reasons">' + d.reasons.map((x) => "<li>" + esc(x.text) + "</li>").join("") + "</ul>" : "") +
        '<div class="chips"><span class="chip dark static">Best ' + win + '</span><span class="chip translucent">Gust ' + unitVal(d.windMax) + " " + unitLabel() +
        '</span><span class="chip translucent">Rain ' + d.rainMax + '%</span><span class="chip translucent">Kp ' + (kp != null ? kp.toFixed(1) : "–") + "</span></div></article>";
    }).join("");
  }

  function renderHangar() {
    const d = C.droneById(settings.drone);
    const fam = C.DRONES.filter((x) => x.family === d.family);
    const families = [...new Set(C.DRONES.map((x) => x.family))];
    $("families").innerHTML = families.map((f) =>
      '<button type="button" role="tab" class="chip outline' + (f === d.family ? " on" : "") + '" aria-selected="' + (f === d.family) + '" data-family="' + esc(f) + '">' + esc(f) + "</button>").join("");
    const ill = C.illusFor(d);
    $("droneCard").className = "drone-card " + ({ mini: "mini", air: "air", mavic: "mavic" }[ill] || "");
    $("droneName").textContent = d.name.replace("DJI ", "");
    $("droneWeight").textContent = d.weightG + " g";
    $("droneCount").textContent = fam.findIndex((x) => x.id === d.id) + 1 + " / " + fam.length;
    $("droneModels").textContent = fam.map((x) => x.name.replace("DJI ", "")).join(" · ");
    $("droneIllus").src = "illus/" + ill + ".png";
    $("droneIllus").alt = d.name + " illustration";
    $("specTiles").innerHTML = [
      ["Max wind", C.fmtWind(d.maxWindMs, settings.unit), d.maxWindMs + " m/s"],
      ["Temperature", d.tempMinC + "–" + d.tempMaxC + "°", "operating"],
      ["Source", "DJI", d.verified ? "checked Oct 2026" : "spec sheet"],
    ].map(([k, v, s]) => '<div class="tile"><span class="k">' + k + '</span><span class="v">' + esc(v) + '</span><span class="s">' + s + "</span></div>").join("");
    document.querySelectorAll("[data-rules]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.rules === settings.rules)));
    $("ruleList").innerHTML = C.RULES[settings.rules].items.map((x) => "<li>" + esc(x) + "</li>").join("");
    $("yellowSel").value = settings.yellow;
    $("yellowVal").textContent = settings.yellow;
  }

  // ---------------------------------------------------------------------------
  // Airspace
  // ---------------------------------------------------------------------------
  const LAYERS = [
    { id: "ctr", name: "Control zones", cats: ["ctr"], sw: "rgba(143,141,244,0.55)" },
    { id: "atz", name: "ATZ", cats: ["atz"], sw: "rgba(143,141,244,0.3)", dashed: true },
    { id: "p", name: "Prohibited", cats: ["prohibited"], sw: "#F2785C" },
    { id: "rd", name: "Restricted · Danger", cats: ["restricted", "danger"], sw: "rgba(242,120,92,0.35)", dashed: true },
    { id: "gl", name: "Glider · Other", cats: ["glider", "other"], sw: "rgba(142,221,166,0.5)", dashed: true },
    { id: "ad", name: "Aerodromes", cats: [], sw: "#111111" },
  ];
  const STYLE = {
    ctr: { color: "#111111", weight: 1.8, fillColor: "#8F8DF4", fillOpacity: 0.28 },
    atz: { color: "#111111", weight: 1.6, dashArray: "5 4", fillColor: "#8F8DF4", fillOpacity: 0.18 },
    prohibited: { color: "#111111", weight: 2, fillColor: "#F2785C", fillOpacity: 0.8 },
    restricted: { color: "#111111", weight: 1.5, dashArray: "5 3", fillColor: "#F2785C", fillOpacity: 0.2 },
    danger: { color: "#9C7A12", weight: 1.5, dashArray: "6 4", fillColor: "#F6D365", fillOpacity: 0.16 },
    glider: { color: "#111111", weight: 1.2, dashArray: "2 4", fillColor: "#8EDDA6", fillOpacity: 0.25 },
    other: { color: "#111111", weight: 1.2, dashArray: "2 4", fillColor: "#D9D9D2", fillOpacity: 0.3 },
  };
  const layerOff = {};
  let map = null, groups = {}, youMarker = null;

  function initMap() {
    if (map || !window.L || !data) return;
    map = L.map("map", { zoomControl: true, attributionControl: true }).setView([data.place.lat, data.place.lon], 11);
    // Standard OSM tiles, greyed out in CSS (.leaflet-tile-pane) to suit the design.
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 17,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · Airspace: ATNS',
    }).addTo(map);
    const order = ["danger", "glider", "other", "restricted", "ctr", "atz", "prohibited"];
    if (staticData.airspace) {
      for (const cat of order) {
        const feats = staticData.airspace.features.filter((f) => f.properties.cat === cat);
        groups[cat] = L.geoJSON({ type: "FeatureCollection", features: feats }, {
          style: () => STYLE[cat],
          onEachFeature: (f, layer) => {
            const p = f.properties;
            layer.bindPopup("<b>" + esc(p.name) + "</b><br>" + esc(p.low + " – " + p.high) + (p.freq ? "<br>" + esc(p.freq) : "") + "<br><i>" + esc(C.AIRSPACE[cat].note) + "</i>");
            if (cat === "ctr" || cat === "atz" || cat === "prohibited") {
              const short = p.name.split(" : ")[0].replace(/^FAP(\d+)/, "P$1");
              layer.bindTooltip(short, { permanent: true, direction: "center", className: "zone-tip " + (cat === "prohibited" ? "p" : cat) });
            }
          },
        }).addTo(map);
      }
    }
    if (staticData.aerodromes) {
      const markers = staticData.aerodromes.rows.map(([ident, name, lat, lon, type]) =>
        L.marker([lat, lon], {
          icon: L.divIcon({ className: "", html: '<div class="' + (type === "helistop" ? "ad-heli" : "ad-dia") + '"></div>', iconSize: [10, 10] }),
          keyboard: false,
        }).bindPopup("<b>" + esc(name) + "</b>" + (ident ? " (" + esc(ident) + ")" : "") + "<br>" + esc(type)));
      groups.ad = L.layerGroup(markers).addTo(map);
    }
    youMarker = L.marker([data.place.lat, data.place.lon], {
      icon: L.divIcon({ className: "", html: '<div class="you-dot"></div>', iconSize: [26, 26] }), zIndexOffset: 1000,
    }).addTo(map);
    // Labels clutter at low zoom; show them from zoom 10.
    const labels = () => document.getElementById("map").classList.toggle("no-tips", map.getZoom() < 10);
    map.on("zoomend", labels); labels();
    applyLayers();
  }

  function applyLayers() {
    if (!map) return;
    for (const l of LAYERS) {
      const cats = l.id === "ad" ? ["ad"] : l.cats;
      for (const c of cats) {
        const g = groups[c];
        if (!g) continue;
        if (layerOff[l.id]) map.removeLayer(g); else if (!map.hasLayer(g)) g.addTo(map);
      }
    }
  }

  function renderAirspace() {
    $("layerChips").innerHTML = LAYERS.map((l) =>
      '<button type="button" class="chip outline" data-layer="' + l.id + '" aria-pressed="' + !layerOff[l.id] + '">' +
      '<span class="swatch' + (l.dashed ? " dashed" : "") + '" style="background:' + l.sw + '"></span>' + l.name + "</button>").join("");

    if (map) {
      const moved = !youMarker.getLatLng().equals([data.place.lat, data.place.lon]);
      youMarker.setLatLng([data.place.lat, data.place.lon]);
      if (moved) map.setView([data.place.lat, data.place.lon], 11);
    }

    const zi = zoneInfo(), card = $("zoneCard");
    if (!staticData.airspace) {
      card.className = "zone-card";
      card.innerHTML = '<div class="condensed">Airspace data unavailable</div><span class="small">Check the DJI GEO map and NOTAMs before flying.</span>';
    } else if (zi.zones.length) {
      const controlled = zi.zones.some((z) => ["ctr", "atz"].includes(z.properties.cat));
      const prohibited = zi.zones.some((z) => z.properties.cat === "prohibited");
      const title = prohibited ? "You’re in a prohibited area" : controlled ? "You’re in controlled airspace" : "You’re in special-use airspace";
      const rule = settings.rules === "private"
        ? (zi.level === "red" ? "Private: no-fly here" : "Private: check before flying")
        : (prohibited ? "RPL: no flying" : "RPL: ATC / authority clearance needed");
      card.className = "zone-card " + zi.level;
      card.innerHTML = '<div class="row top-align"><div><span class="chip dark static">' + rule + '</span>' +
        '<div class="condensed" style="margin-top:8px">' + title + "</div></div></div>" +
        '<div class="zone-grid">' + zi.zones.map((z) => {
          const p = z.properties;
          return "<div><b>" + esc(p.name.split(" : ").join(" · ")) + "</b><br>" + esc(p.low + " – " + p.high) + (p.freq ? "<br>" + esc(p.freq.replace(/\s*\(.*\)/, "")) : "") + "</div>";
        }).join("") + "</div>";
    } else {
      card.className = "zone-card";
      card.innerHTML = '<span class="chip dark static" style="align-self:flex-start">Ground to 500 ft</span><div class="condensed">No controlled or restricted airspace here</div>' +
        '<span class="small">Part 101 limits still apply. Check the nearby aerodromes below and NOTAMs.</span>';
    }

    const near = nearby(15);
    $("nearbyCard").innerHTML = '<div class="row"><h3 class="condensed">Aerodromes nearby</h3><span class="small muted">10 km rule</span></div>' +
      (near.length ? '<ul class="near-list">' + near.slice(0, 5).map((a) =>
        "<li><span>" + esc(a.name) + (a.ident ? " (" + esc(a.ident) + ")" : "") + ' <span class="muted">· ' + esc(a.type) + "</span></span>" +
        "<b" + (a.km < 10 ? ' class="warn"' : "") + ">" + a.km.toFixed(1) + " km</b></li>").join("") + "</ul>"
        : '<span class="small muted">None within 15 km.</span>');

    // Nearest official weather report (METAR/TAF)
    const mc = $("metarCard");
    if (data.aviation && data.aviation.metars && data.aviation.metars.length) {
      const st = data.aviation.metars
        .map((m) => Object.assign({ km: C.distanceKm(data.place.lat, data.place.lon, m.lat, m.lon) }, m))
        .sort((a, b) => a.km - b.km)[0];
      const taf = (data.aviation.tafs || []).find((t) => t.icaoId === st.icaoId);
      mc.innerHTML = '<div class="row"><h3 class="condensed">' + esc(st.icaoId) + " · " + st.km.toFixed(0) + " km</h3>" +
        (st.fltCat ? '<span class="chip static" style="background:' + (st.fltCat === "VFR" ? "#8EDDA6" : "#F6D365") + ';color:#111;height:24px;font-size:11px;font-weight:800">' + esc(st.fltCat) + "</span>" : "") + "</div>" +
        '<p class="metar">' + esc(st.rawOb) + (taf ? "\n" + esc(taf.rawTAF) : "") + "</p>";
      mc.hidden = false;
    } else mc.hidden = true;

    const { lat, lon } = data.place;
    $("sourceLinks").innerHTML = [
      ["DJI FlySafe", "https://fly-safe.dji.com/nfz/nfz-query"],
      ["Windy", "https://www.windy.com/?gust," + lat.toFixed(3) + "," + lon.toFixed(3) + ",11"],
      ["Windguru", "https://www.windguru.cz/map/"],
      ["SAWS Aviation", "https://aviation.weathersa.co.za/"],
      ["NOAA Kp", "https://www.swpc.noaa.gov/products/planetary-k-index"],
      ["ATNS data", "https://www.atns.com/products/aim/RSA%20Airspaces%20in%203D"],
      ["SACAA", "https://www.caa.co.za/industry-information/uas/"],
    ].map(([t, u]) => '<a class="chip outline" href="' + u + '" target="_blank" rel="noopener">' + t + arrowSvg.replace(/16/g, "11") + "</a>").join("");
    if (staticData.airspace && staticData.airspace.source) {
      $("airSource").textContent = "Airspace: " + staticData.airspace.source + ", ground to 500 ft layers. A planning aid only — check the AIP, NOTAMs and the DJI GEO map before you fly.";
    }
  }

  // ---------------------------------------------------------------------------
  // Settings sheet
  // ---------------------------------------------------------------------------
  function renderSettings() {
    document.querySelectorAll("input[name=unit]").forEach((i) => (i.checked = i.value === settings.unit));
    $("widgetParam").textContent = settings.drone + "|" + settings.rules + "|" + settings.unit + "|" + settings.yellow;
    const y = settings.yellow / 100, L = C.LIMITS;
    $("howto").innerHTML = [
      "Each daylight hour is rated; a day takes its worst hour.",
      "<b>Wind:</b> the highest of ground wind, gusts and wind at 120 m vs your drone's DJI max. Yellow from " + settings.yellow + "%.",
      "<b>Rain:</b> red at ≥" + L.rainProbPct + "% chance or ≥" + L.rainMm + " mm/h; yellow from " + Math.round(L.rainProbPct * y) + "%.",
      "<b>Temperature:</b> red outside the drone's range; yellow within " + L.tempMarginC + " °C of it.",
      "<b>Visibility:</b> red under " + L.visibilityM + " m; yellow under " + Math.round(L.visibilityM / y) + " m.",
      "<b>Low cloud:</b> red under " + L.cloudBaseM + " m; yellow under " + Math.round(L.cloudBaseM / y) + " m.",
      "<b>Kp</b> is information only. <b>Night:</b> red on Private rules, yellow on RPL.",
      "<b>Airspace</b> is shown separately and doesn't change the weather colour.",
    ].map((x) => "<li>" + x + "</li>").join("");
  }

  function changed() { save(STORE, settings); if (data) render(); else renderSettings(); }

  function initEvents() {
    document.querySelectorAll("[data-open-settings]").forEach((b) => b.addEventListener("click", () => $("settings").showModal()));
    $("settings").addEventListener("click", (e) => { if (e.target === $("settings")) $("settings").close(); });
    document.querySelectorAll("input[name=unit]").forEach((i) => i.addEventListener("change", (e) => { settings.unit = e.target.value; changed(); }));

    $("useGps").addEventListener("click", () => { settings.place = null; save(STORE, settings); $("settings").close(); refresh(); });
    let t;
    $("placeSearch").addEventListener("input", (e) => {
      clearTimeout(t);
      const q = e.target.value.trim();
      if (q.length < 2) { $("placeResults").innerHTML = ""; return; }
      t = setTimeout(async () => {
        try {
          const j = await getJson("https://geocoding-api.open-meteo.com/v1/search?count=6&language=en&name=" + encodeURIComponent(q));
          $("placeResults").innerHTML = (j.results || []).map((p, i) =>
            '<li><button type="button" data-i="' + i + '">' + esc(p.name) + ' <span class="muted">' + esc([p.admin1, p.country].filter(Boolean).join(", ")) + "</span></button></li>").join("") || '<li class="small muted">No matches</li>';
          $("placeResults").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
            const p = j.results[+b.dataset.i];
            settings.place = { lat: p.latitude, lon: p.longitude, name: [p.name, p.admin1].filter(Boolean).join(", "), mode: "manual" };
            save(STORE, settings);
            $("placeSearch").value = ""; $("placeResults").innerHTML = "";
            $("settings").close(); refresh();
          }));
        } catch (err) { $("placeResults").innerHTML = '<li class="small muted">Search failed</li>'; }
      }, 300);
    });
    $("copyParam").addEventListener("click", async () => {
      try { await navigator.clipboard.writeText($("widgetParam").textContent); $("copyParam").textContent = "Copied"; }
      catch (e) { $("copyParam").textContent = "Select & copy"; }
      setTimeout(() => ($("copyParam").textContent = "Copy"), 1500);
    });

    // Week: pick a day from the bars or the stack
    document.addEventListener("click", (e) => {
      const day = e.target.closest("[data-day]");
      if (day && rated) { selectedDay = +day.dataset.day; renderWeek(); }
    });

    // Hangar
    $("families").addEventListener("click", (e) => {
      const b = e.target.closest("[data-family]");
      if (!b) return;
      const cur = C.droneById(settings.drone);
      if (cur.family !== b.dataset.family) { settings.drone = C.DRONES.find((x) => x.family === b.dataset.family).id; changed(); }
    });
    const step = (dir) => {
      const cur = C.droneById(settings.drone), fam = C.DRONES.filter((x) => x.family === cur.family);
      const i = fam.findIndex((x) => x.id === cur.id);
      settings.drone = fam[(i + dir + fam.length) % fam.length].id; changed();
    };
    $("prevModel").addEventListener("click", () => step(-1));
    $("nextModel").addEventListener("click", () => step(1));
    document.querySelectorAll("[data-rules]").forEach((b) => b.addEventListener("click", () => { settings.rules = b.dataset.rules; changed(); }));
    $("yellowSel").addEventListener("input", (e) => { settings.yellow = +e.target.value; $("yellowVal").textContent = settings.yellow; changed(); });

    // Airspace layers
    $("layerChips").addEventListener("click", (e) => {
      const b = e.target.closest("[data-layer]");
      if (!b) return;
      layerOff[b.dataset.layer] = !layerOff[b.dataset.layer];
      b.setAttribute("aria-pressed", String(!layerOff[b.dataset.layer]));
      applyLayers();
    });
    $("locateBtn").addEventListener("click", () => map && data && map.setView([data.place.lat, data.place.lon], 12));
  }

  // ---------------------------------------------------------------------------
  // Routing between the four views
  // ---------------------------------------------------------------------------
  function route() {
    const name = (location.hash || "#now").slice(1);
    const view = ["now", "week", "hangar", "airspace"].includes(name) ? name : "now";
    document.querySelectorAll(".view").forEach((v) => (v.hidden = v.dataset.view !== view));
    document.querySelectorAll("[data-tab]").forEach((a) => {
      if (a.dataset.tab === view) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    window.scrollTo(0, 0);
    if (view === "airspace") {
      initMap();
      if (map) setTimeout(() => map.invalidateSize(), 0);
    }
  }

  // ---------------------------------------------------------------------------
  initEvents();
  renderSettings();
  window.addEventListener("hashchange", route);
  route();
  loadStatic().then(() => {
    const cached = load(CACHE, null);
    if (cached && cached.fcRaw && !data) { data = hydrate(cached); render("Refreshing…"); }
    return refresh();
  }).then(() => { if (location.hash === "#airspace") route(); });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && data && Date.now() - data.fetchedAt > 15 * 60 * 1000) refresh();
  });
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
})();

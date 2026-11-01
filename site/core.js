// Shared logic for the web app and the Scriptable widget.
// No DOM access here: this file is also downloaded and evaluated by the widget.
(function (root) {
  "use strict";

  // ---------------------------------------------------------------------------
  // DJI drones. Figures from DJI's official spec pages ("Max Wind Speed
  // Resistance", "Operating Temperature", "Takeoff Weight").
  // verified: re-checked on dji.com/<model>/specs on 2026-10-31.
  // ---------------------------------------------------------------------------
  const DRONES = [
    { id: "mini-2",      family: "Mini",  name: "DJI Mini 2",       weightG: 249,  maxWindMs: 10.5, tempMinC: 0,   tempMaxC: 40, verified: false },
    { id: "mini-3",      family: "Mini",  name: "DJI Mini 3",       weightG: 248,  maxWindMs: 10.7, tempMinC: -10, tempMaxC: 40, verified: true },
    { id: "mini-3-pro",  family: "Mini",  name: "DJI Mini 3 Pro",   weightG: 249,  maxWindMs: 10.7, tempMinC: -10, tempMaxC: 40, verified: false },
    { id: "mini-4-pro",  family: "Mini",  name: "DJI Mini 4 Pro",   weightG: 249,  maxWindMs: 10.7, tempMinC: -10, tempMaxC: 40, verified: true },
    { id: "mini-5-pro",  family: "Mini",  name: "DJI Mini 5 Pro",   weightG: 250,  maxWindMs: 12,   tempMinC: -10, tempMaxC: 40, verified: true },
    { id: "neo",         family: "Mini",  name: "DJI Neo",          weightG: 135,  maxWindMs: 8,    tempMinC: -10, tempMaxC: 40, verified: true },
    { id: "air-2s",      family: "Air",   name: "DJI Air 2S",       weightG: 595,  maxWindMs: 10.7, tempMinC: 0,   tempMaxC: 40, verified: false },
    { id: "air-3",       family: "Air",   name: "DJI Air 3",        weightG: 720,  maxWindMs: 12,   tempMinC: -10, tempMaxC: 40, verified: false },
    { id: "air-3s",      family: "Air",   name: "DJI Air 3S",       weightG: 724,  maxWindMs: 12,   tempMinC: -10, tempMaxC: 40, verified: true },
    { id: "mavic-3",     family: "Mavic", name: "DJI Mavic 3",      weightG: 895,  maxWindMs: 12,   tempMinC: -10, tempMaxC: 40, verified: false },
    { id: "mavic-3-classic", family: "Mavic", name: "DJI Mavic 3 Classic", weightG: 895, maxWindMs: 12, tempMinC: -10, tempMaxC: 40, verified: false },
    { id: "mavic-3-pro", family: "Mavic", name: "DJI Mavic 3 Pro",  weightG: 958,  maxWindMs: 12,   tempMinC: -10, tempMaxC: 40, verified: true },
    { id: "mavic-4-pro", family: "Mavic", name: "DJI Mavic 4 Pro",  weightG: 1063, maxWindMs: 12,   tempMinC: -10, tempMaxC: 40, verified: true },
    { id: "avata",       family: "Avata / FPV", name: "DJI Avata",   weightG: 410,  maxWindMs: 10.7, tempMinC: -10, tempMaxC: 40, verified: false },
    { id: "avata-2",     family: "Avata / FPV", name: "DJI Avata 2", weightG: 377,  maxWindMs: 10.7, tempMinC: -10, tempMaxC: 40, verified: true },
    // DJI lists 39–49 km/h; the lower bound is used.
    { id: "fpv",         family: "Avata / FPV", name: "DJI FPV",     weightG: 795,  maxWindMs: 10.8, tempMinC: -10, tempMaxC: 40, verified: false },
    { id: "phantom-4-pro-v2", family: "Phantom", name: "DJI Phantom 4 Pro V2.0", weightG: 1375, maxWindMs: 10, tempMinC: 0, tempMaxC: 40, verified: false },
    { id: "phantom-4-adv",    family: "Phantom", name: "DJI Phantom 4 Advanced", weightG: 1368, maxWindMs: 10, tempMinC: 0, tempMaxC: 40, verified: false },
    { id: "phantom-4-rtk",    family: "Phantom", name: "DJI Phantom 4 RTK",      weightG: 1391, maxWindMs: 10, tempMinC: 0, tempMaxC: 40, verified: false },
    { id: "phantom-4-ms",     family: "Phantom", name: "DJI Phantom 4 Multispectral", weightG: 1487, maxWindMs: 10, tempMinC: 0, tempMaxC: 40, verified: false },
  ];

  // ---------------------------------------------------------------------------
  // SACAA Part 101 rule sets. These are shown as reference; only `daylight`
  // feeds the rating. Always check the current regulations and your ROC.
  // ---------------------------------------------------------------------------
  const RULES = {
    private: {
      id: "private",
      name: "Private / recreational",
      night: "red",
      items: [
        "Max height 400 ft (≈120 m) above ground",
        "Restricted visual line of sight (R-VLOS), within about 500 m",
        "Daylight only, in clear weather",
        "No closer than 10 km to an aerodrome",
        "No closer than 50 m to people, property or public roads",
        "Not in controlled or restricted airspace",
        "Max take-off mass 7 kg, no commercial gain",
      ],
    },
    rpl: {
      id: "rpl",
      name: "RPL / ROC holder",
      night: "yellow",
      items: [
        "Max height 400 ft (≈120 m) unless approved",
        "VLOS within 500 m unless approved for E-VLOS / BVLOS",
        "Night operations need SACAA approval in your ROC",
        "No closer than 10 km to an aerodrome without ATC / SACAA approval",
        "No closer than 50 m to people or structures unless approved",
        "Operate within your Operations Manual and ROC conditions",
        "Aircraft must be registered (RLA) and pilot hold a valid RPL",
      ],
    },
  };

  // Thresholds that aren't drone-specific. "Lower is worse" factors turn
  // yellow once the value drops below limit / yellowRatio.
  const LIMITS = {
    rainProbPct: 60,      // red at or above this hourly precipitation probability
    rainMm: 0.5,          // red at or above this hourly precipitation
    visibilityM: 1000,    // red below this
    cloudBaseM: 120,      // red below this (need to fly up to 120 m under cloud)
    lowCloudPct: 50,      // cloud base only counts when low cloud cover is at least this
    tempMarginC: 5,       // yellow within this many °C of the drone's range
  };

  const LEVEL = { green: 0, yellow: 1, red: 2, night: -1 };
  const worst = (a, b) => (LEVEL[b] > LEVEL[a] ? b : a);

  function droneById(id) {
    return DRONES.find((d) => d.id === id) || DRONES.find((d) => d.id === "mini-4-pro");
  }

  // ---------------------------------------------------------------------------
  // Data URLs
  // ---------------------------------------------------------------------------
  function forecastUrl(lat, lon) {
    const hourly = [
      "wind_speed_10m", "wind_gusts_10m", "wind_direction_10m", "wind_speed_120m",
      "precipitation_probability", "precipitation", "temperature_2m", "dew_point_2m",
      "visibility", "cloud_cover_low", "weather_code",
    ].join(",");
    return "https://api.open-meteo.com/v1/forecast?latitude=" + lat.toFixed(4) + "&longitude=" + lon.toFixed(4) +
      "&hourly=" + hourly + "&daily=sunrise,sunset&forecast_days=7&timezone=auto&wind_speed_unit=ms";
  }
  const KP_3DAY_URL = "https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json";
  const KP_27DAY_URL = "https://services.swpc.noaa.gov/text/27-day-outlook.txt";

  // ---------------------------------------------------------------------------
  // Rating
  // ---------------------------------------------------------------------------
  function rateHour(h, drone, yellowRatio) {
    const reasons = [];
    let level = "green";
    const add = (lvl, key, text, score) => { level = worst(level, lvl); if (lvl !== "green") reasons.push({ level: lvl, key, text, score: score || 0 }); };

    // Wind: worst of ground gusts and wind at 120 m vs the drone's max.
    const wind = Math.max(h.gust ?? 0, h.wind120 ?? 0, h.wind10 ?? 0);
    const ratio = wind / drone.maxWindMs;
    if (h.gust == null && h.wind120 == null && h.wind10 == null) add("yellow", "wind", "No wind data for this hour");
    else if (ratio >= 1) add("red", "wind", "Wind/gusts over " + drone.name + " max (" + drone.maxWindMs + " m/s)", ratio);
    else if (ratio >= yellowRatio) add("yellow", "wind", "Wind/gusts up to " + Math.round(ratio * 100) + "% of drone max", ratio);

    // Rain
    const rainYellow = LIMITS.rainProbPct * yellowRatio;
    if ((h.precip ?? 0) >= LIMITS.rainMm || (h.precipProb ?? 0) >= LIMITS.rainProbPct) add("red", "rain", "Rain likely (DJI drones aren't waterproof)");
    else if ((h.precipProb ?? 0) >= rainYellow || (h.precip ?? 0) > 0) add("yellow", "rain", "Chance of rain");

    // Temperature
    if (h.temp != null) {
      if (h.temp < drone.tempMinC || h.temp > drone.tempMaxC) add("red", "temp", "Outside operating temperature (" + drone.tempMinC + "–" + drone.tempMaxC + " °C)");
      else if (h.temp < drone.tempMinC + LIMITS.tempMarginC || h.temp > drone.tempMaxC - LIMITS.tempMarginC) add("yellow", "temp", "Near operating temperature limit");
    }

    // Visibility (VLOS)
    if (h.visibility != null) {
      if (h.visibility < LIMITS.visibilityM) add("red", "vis", "Poor visibility for line of sight");
      else if (h.visibility < LIMITS.visibilityM / yellowRatio) add("yellow", "vis", "Reduced visibility");
    }

    // Cloud base, estimated from temperature/dew point spread, only with real low cloud.
    if (h.cloudBase != null && (h.lowCloud ?? 0) >= LIMITS.lowCloudPct) {
      if (h.cloudBase < LIMITS.cloudBaseM) add("red", "cloud", "Low cloud below 120 m");
      else if (h.cloudBase < LIMITS.cloudBaseM / yellowRatio) add("yellow", "cloud", "Low cloud base");
    }
    return { level, reasons, windMax: wind, ratio };
  }

  function parseForecast(json) {
    const H = json.hourly;
    // A variable can be missing entirely or hold nulls; keep both as null.
    const v = (k, i) => (H[k] ? H[k][i] ?? null : null);
    const hours = H.time.map((t, i) => {
      const temp = v("temperature_2m", i), dew = v("dew_point_2m", i);
      return {
        time: t,
        wind10: v("wind_speed_10m", i),
        gust: v("wind_gusts_10m", i),
        dir: v("wind_direction_10m", i),
        wind120: v("wind_speed_120m", i),
        precipProb: v("precipitation_probability", i),
        precip: v("precipitation", i),
        temp,
        visibility: v("visibility", i),
        lowCloud: v("cloud_cover_low", i),
        cloudBase: temp != null && dew != null ? Math.max(0, (temp - dew) * 125) : null,
        code: v("weather_code", i),
      };
    });
    const days = json.daily.time.map((d, i) => ({ date: d, sunrise: json.daily.sunrise[i], sunset: json.daily.sunset[i] }));
    return { hours, days, tz: json.timezone, utcOffset: json.utc_offset_seconds, elevation: json.elevation };
  }

  // Times from Open-Meteo are local ISO strings without offset; compare as strings.
  function isDaylight(time, day) { return time >= day.sunrise.slice(0, 13) + ":00" && time < day.sunset; }

  function rateForecast(fc, droneId, opts) {
    opts = opts || {};
    const drone = droneById(droneId);
    const rules = RULES[opts.rules] || RULES.private;
    const yellowRatio = opts.yellowRatio || 0.7;

    const hours = fc.hours.map((h) => {
      const day = fc.days.find((d) => d.date === h.time.slice(0, 10));
      const daylight = day ? isDaylight(h.time, day) : true;
      return Object.assign({}, h, { daylight }, rateHour(h, drone, yellowRatio));
    });

    const days = fc.days.map((d) => {
      const dh = hours.filter((h) => h.time.startsWith(d.date) && h.daylight);
      let level = "green";
      // Keep the worst reason of each kind (wind, rain, ...) across the day.
      const byKey = new Map();
      for (const h of dh) {
        level = worst(level, h.level);
        for (const r of h.reasons) {
          const prev = byKey.get(r.key);
          if (!prev || LEVEL[r.level] > LEVEL[prev.level] || (r.level === prev.level && r.score > prev.score)) byKey.set(r.key, r);
        }
      }
      const reasons = [...byKey.values()].sort((a, b) => LEVEL[b.level] - LEVEL[a.level]);
      const temps = dh.map((h) => h.temp).filter((t) => t != null);
      return Object.assign({}, d, {
        level,
        reasons,
        greenHours: dh.filter((h) => h.level === "green").length,
        daylightHours: dh.length,
        bestWindow: bestWindow(dh),
        windMax: Math.max(0, ...dh.map((h) => h.windMax)),
        tempMin: temps.length ? Math.min(...temps) : null,
        tempMax: temps.length ? Math.max(...temps) : null,
        rainMax: Math.max(0, ...dh.map((h) => h.precipProb ?? 0)),
      });
    });

    // "Now" = the current local hour at the forecast location.
    const nowIso = new Date(Date.now() + fc.utcOffset * 1000).toISOString().slice(0, 16);
    const nowLocal = nowIso.slice(0, 13) + ":00";
    // Exact hour, else the latest hour already started (e.g. an old cached forecast), else the first.
    const now = hours.find((h) => h.time === nowLocal) || hours.filter((h) => h.time <= nowLocal).pop() || hours[0];
    let nowLevel = now.level;
    const nowReasons = now.reasons.slice();
    // Hour flags count the sunrise and sunset hours as daylight; "now" uses the actual minute.
    const nowDay = fc.days.find((d) => d.date === now.time.slice(0, 10));
    const nowDaylight = nowDay && now.time === nowLocal ? nowIso >= nowDay.sunrise && nowIso < nowDay.sunset : now.daylight;
    if (!nowDaylight) {
      nowLevel = worst(nowLevel, rules.night);
      nowReasons.unshift({ level: rules.night, key: "night", text: rules.id === "private" ? "Night: private flights are daylight only" : "Night: needs SACAA night approval" });
    }
    return { drone, rules, yellowRatio, hours, days, now: Object.assign({}, now, { daylight: nowDaylight, level: nowLevel, reasons: nowReasons }) };
  }

  // Longest run of consecutive green daylight hours.
  function bestWindow(dayHours) {
    let best = null, start = null;
    dayHours.forEach((h, i) => {
      if (h.level === "green") {
        if (start === null) start = i;
        const len = i - start + 1;
        if (!best || len > best.len) best = { len, from: dayHours[start].time, to: h.time };
      } else start = null;
    });
    return best;
  }

  // ---------------------------------------------------------------------------
  // Kp index: 3-hourly forecast for ~3 days, then the 27-day outlook's daily max.
  // Returned as { "YYYY-MM-DD": maxKp } in UTC dates.
  // ---------------------------------------------------------------------------
  function parseKp(json3day, text27) {
    const out = {}, source = {}, rows3 = {};
    if (Array.isArray(json3day)) {
      // Older format was an array of arrays with a header row; current is an array of objects.
      const rows = Array.isArray(json3day[0]) ? json3day.slice(1).map((r) => ({ time_tag: r[0], kp: r[1], observed: r[2] })) : json3day;
      for (const r of rows) {
        const date = String(r.time_tag).slice(0, 10), kp = r.kp == null || r.kp === "" ? NaN : Number(r.kp);
        if (isNaN(kp)) continue;
        out[date] = Math.max(out[date] ?? 0, kp);
        source[date] = "3-day";
        rows3[date] = (rows3[date] || 0) + 1;
      }
    }
    if (typeof text27 === "string") {
      const months = { Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06", Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12" };
      for (const line of text27.split("\n")) {
        const m = line.match(/^(\d{4})\s+(\w{3})\s+(\d{2})\s+\d+\s+\d+\s+(\d+)/);
        if (!m) continue;
        const date = m[1] + "-" + months[m[2]] + "-" + m[3];
        // The 3-day forecast's last date often has only one or two 3-hour slots; don't let that hide the outlook.
        if (!(date in out) || (rows3[date] < 8 && Number(m[4]) > out[date])) { out[date] = Number(m[4]); source[date] = "27-day"; }
      }
    }
    return { byDate: out, source };
  }

  function kpLabel(kp) {
    if (kp == null) return { text: "n/a", level: "green" };
    if (kp >= 7) return { text: "Severe storm (G3+)", level: "red" };
    if (kp >= 5) return { text: "Geomagnetic storm (G" + (Math.floor(kp) - 4) + ")", level: "red" };
    if (kp >= 4) return { text: "Active", level: "yellow" };
    return { text: "Quiet", level: "green" };
  }

  // ---------------------------------------------------------------------------
  // Aerodromes / METAR
  // ---------------------------------------------------------------------------
  function distanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371, toRad = (x) => (x * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  function nearestAerodromes(aerodromes, lat, lon, n) {
    return aerodromes.rows
      .map(([ident, name, alat, alon, type]) => ({ ident, name, type, lat: alat, lon: alon, km: distanceKm(lat, lon, alat, alon) }))
      .sort((a, b) => a.km - b.km)
      .slice(0, n || 3);
  }

  // ---------------------------------------------------------------------------
  // Airspace (data/airspace.json, built from the ATNS RSA DATA KMZ)
  // ---------------------------------------------------------------------------
  const AIRSPACE = {
    ctr: { label: "Control zone", short: "CTR", private: "red", rpl: "yellow", note: "ATC clearance needed" },
    atz: { label: "Aerodrome traffic zone", short: "ATZ", private: "red", rpl: "yellow", note: "Aerodrome approval needed" },
    prohibited: { label: "Prohibited area", short: "P", private: "red", rpl: "red", note: "No flying" },
    restricted: { label: "Restricted area", short: "R", private: "red", rpl: "yellow", note: "Only with the controlling authority's permission" },
    danger: { label: "Danger area", short: "D", private: "yellow", rpl: "yellow", note: "Check activity times and NOTAMs" },
    glider: { label: "Glider area", short: "Glider", private: "yellow", rpl: "yellow", note: "Watch for gliders" },
    other: { label: "Special area", short: "Other", private: "yellow", rpl: "yellow", note: "Check the AIP" },
  };

  function inRing(lon, lat, ring) {
    let c = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [x1, y1] = ring[i], [x2, y2] = ring[j];
      if ((y1 > lat) !== (y2 > lat) && lon < ((x2 - x1) * (lat - y1)) / (y2 - y1) + x1) c = !c;
    }
    return c;
  }

  // Airspace features whose outline contains the point, most restrictive first.
  function zonesAt(airspace, lat, lon) {
    const order = ["prohibited", "restricted", "ctr", "atz", "danger", "glider", "other"];
    return airspace.features
      .filter((f) => {
        const g = f.geometry;
        const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
        // Inside the outer ring and not inside any hole.
        return polys.some((p) => inRing(lon, lat, p[0]) && !p.slice(1).some((h) => inRing(lon, lat, h)));
      })
      .sort((a, b) => order.indexOf(a.properties.cat) - order.indexOf(b.properties.cat));
  }

  function illusFor(drone) {
    if (drone.id === "neo") return "avata";
    return { Mini: "mini", Air: "air", Mavic: "mavic", Phantom: "phantom" }[drone.family] || "avata";
  }

  // ---------------------------------------------------------------------------
  // Formatting
  // ---------------------------------------------------------------------------
  const UNITS = {
    kmh: { label: "km/h", f: (ms) => ms * 3.6 },
    ms: { label: "m/s", f: (ms) => ms },
    kn: { label: "kn", f: (ms) => ms * 1.943844 },
  };
  function fmtWind(ms, unit) {
    const u = UNITS[unit] || UNITS.kmh;
    return ms == null ? "–" : Math.round(u.f(ms)) + " " + u.label;
  }
  function compass(deg) {
    if (deg == null) return "";
    return ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"][Math.round(deg / 22.5) % 16];
  }

  // Card colours of the app's design: mint = go, butter = caution, coral = no-fly.
  const COLORS = { green: "#8EDDA6", yellow: "#F6D365", red: "#F2785C", night: "#D9D9D2", info: "#8F8DF4" };

  root.DroneCore = {
    DRONES, RULES, LIMITS, COLORS, UNITS, AIRSPACE,
    droneById, illusFor, forecastUrl, KP_3DAY_URL, KP_27DAY_URL,
    parseForecast, rateForecast, parseKp, kpLabel,
    distanceKm, nearestAerodromes, zonesAt, fmtWind, compass,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);

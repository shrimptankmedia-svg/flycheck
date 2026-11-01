# FlyCheck SA

A 7-day drone flying forecast for DJI pilots in South Africa. It has two parts:

- **Web app** (`site/`): add it to your iPhone Home Screen. It has four tabs:
  - **Now:** a green/yellow/red status card for your drone, the gust meter, conditions, the best flying window, and an airspace warning.
  - **7-day:** a flyable-hours chart and a stack of day cards with hourly bars.
  - **Hangar:** pick your DJI drone (Mini, Air, Mavic, Avata/FPV or Phantom 4) and SACAA rules (Private or RPL/ROC) and set the yellow threshold.
  - **Airspace:** a live map of ground-to-500 ft airspace from ATNS, which zones you're inside, aerodromes within 10 km, and the nearest METAR/TAF.
- **Scriptable widget** (`scriptable/FlyCheck.js`): a Home Screen widget in the status colour, with the drone illustration, an airspace warning and a dot for each of the next 7 days.

## Setup (about 15 minutes)

### 1. Put the app on GitHub Pages
1. On github.com, create a new **public** repository called `flycheck`.
2. Upload everything in this folder: `site/`, `scripts/`, `scriptable/`, `.github/`, `README.md`, `SPEC.md`.
   The easiest way is **Add file → Upload files** on the repo page; drag the folder contents in.
   Turn on hidden files in Finder (⌘⇧.) so the `.github` folder is visible.
3. In the repo, go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
4. Open the **Actions** tab. The "Deploy to GitHub Pages" run should go green in about a minute.
   If it didn't start, click it, then **Run workflow**.
5. Your app is now at `https://<your-github-name>.github.io/flycheck/`.

The workflow re-runs every 30 minutes. That refreshes the METAR/TAF data, and the ATNS airspace file once a day.
GitHub pauses scheduled runs after 60 days with no commits. If that happens, the Actions tab shows a banner;
click **Enable workflow**.

### 2. Add the web app to your iPhone
1. Open the URL in **Safari** and allow Location.
2. Tap **Share → Add to Home Screen**.
3. Open the **Hangar** tab to pick your drone and rules.

### 3. Add the widget
1. Install **Scriptable** from the App Store (free).
2. In Scriptable, tap **+**, paste the whole of `scriptable/FlyCheck.js`, and name it `FlyCheck`.
3. Change the `SITE_URL` line near the top to your Pages URL, with the trailing slash.
4. Tap ▶︎ once to test, and allow Location when asked.
5. On the Home Screen, long-press → **Edit → Add Widget → Scriptable** → small or medium.
6. Long-press the new widget → **Edit Widget**:
   - **Script:** FlyCheck
   - **When Interacting:** Open URL (opens the web app)
   - **Parameter:** copy it from the web app's Settings (⚙︎ on the Now tab) → *Widget parameter*,
     e.g. `avata-2|rpl|kmh|70`

iOS decides when widgets refresh, usually every 15–60 minutes.

## How the colours work
Each daylight hour (sunrise to sunset) is rated, and a day takes its worst hour.
**Mint** = go, **butter yellow** = caution, **coral** = no-fly.

| Factor | No-fly | Caution |
|---|---|---|
| Wind (worst of ground wind, gusts, wind at 120 m) | ≥ drone's DJI max wind resistance | ≥ 70% of it |
| Rain | ≥ 60% chance or ≥ 0.5 mm/h | ≥ 42% chance or any rain |
| Temperature | outside the drone's operating range | within 5 °C of it |
| Visibility | < 1000 m | < 1430 m |
| Low cloud base (only when low cloud ≥ 50%) | < 120 m | < 171 m |
| Night (for "right now") | Private rules | RPL rules (needs approval) |
| Kp index | information only | information only |

You can change the 70% threshold in the Hangar tab. The other limits are in `LIMITS` in `site/core.js`.

**Airspace is shown separately** and doesn't change the weather colour. Inside a CTR, ATZ, prohibited or
restricted area you get a coral or yellow warning, depending on your rules (`AIRSPACE` in `site/core.js`).

## Data sources
- **Forecast:** [Open-Meteo](https://open-meteo.com). It's free, uses the same global models that Windy and Windguru show, and includes wind at 120 m. Windy and Windguru have no free API, so the app links to them.
- **Kp index:** NOAA SWPC 3-day forecast, then their 27-day outlook for days 4–7.
- **METAR/TAF:** aviationweather.gov, fetched by the GitHub workflow because that API blocks direct requests from a browser.
- **Airspace and aerodromes:** the [ATNS RSA DATA KMZ](https://www.atns.com/products/aim/RSA%20Airspaces%20in%203D), which follows the AIRAC cycle. ATNS publishes it for free use, and it is the official SA airspace file. `scripts/build_airspace.py` keeps only what a drone under 400 ft can enter (lower limit GND or ≤ 500 ft AGL):
  - CTRs and ATZs
  - prohibited, restricted and danger areas
  - glider and special areas
  - all 861 SACAA-listed aerodromes and helistops

  TMAs, CTAs and routes start far higher and are dropped. ATNS calls the file a "gross representation", so always check the AIP and NOTAMs.
- **Map:** OpenStreetMap tiles, shown in greyscale.
- **Drone specs:** dji.com spec pages. Each model in `site/core.js` is marked `verified: true` if it was re-checked for this build.
- **Drone illustrations:** drawn by `scripts/draw_drones.py` from DJI product photos (Mini 4 Pro, Air 3S, Mavic 4 Pro, Avata 2, Phantom 4 Pro V2.0). Each family shares one drawing, so the Mavic 3 uses the Mavic 4 Pro's round camera pod and the Neo and FPV use the Avata's.

## Files
- `site/core.js`: drones, SACAA rules, rating and airspace logic. The widget downloads this file too.
- `site/app.js`, `site/index.html`, `site/style.css`: the web app.
- `site/data/`: airspace, aerodromes, METAR/TAF (the last is generated by the workflow).
- `site/illus/`: drone illustrations (SVG, plus PNG for the widget).
- `scriptable/FlyCheck.js`: the widget.
- `scripts/build_airspace.py`: ATNS KMZ → `airspace.json` + `aerodromes.json`.
- `scripts/fetch-aviation.mjs`: METAR/TAF fetcher used by the workflow.
- `scripts/draw_drones.py`, `scripts/make_icons.py`: regenerate the illustrations and app icons.

Run locally with `python3 -m http.server 8765 --directory site`.

*A planning aid, not a flight clearance. Always check NOTAMs, airspace, the DJI GEO map, and the current SACAA Part 101 rules before you fly.*

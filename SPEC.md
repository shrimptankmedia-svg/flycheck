# Drone Flying Conditions — Build Spec

Web app (iPhone, Add to Home Screen) + Scriptable widget showing a 7-day
green / yellow / red drone-flying outlook for the phone's current location.

## Platform
- Static web app (HTML/JS, PWA), hosted on **GitHub Pages**.
- **Scriptable** widget (medium size) on the iPhone Home Screen.
- No backend: all data fetched from the phone.

## Location
- Current GPS location (browser geolocation in the app; Scriptable `Location` in the widget).

## Data sources
| Need | Source |
|---|---|
| 7-day hourly wind, gusts, wind at ~120 m, rain, temp, visibility, cloud | Open-Meteo (free, no key) |
| Windy / Windguru | Deep links that open their forecasts for your location (they have no free API) |
| Official SA aviation weather | METAR/TAF for the nearest SA aerodrome (aviationweather.gov API). SAWS aviation portal linked (needs login) |
| Kp index | NOAA SWPC 3-day forecast + 27-day outlook |
| Sunrise / sunset | Open-Meteo daily |

## Drone picker (DJI)
Mini (Mini 2, 3, 3 Pro, 4 Pro, 5 Pro, Neo), Air (2S, 3, 3S),
Mavic (3, 3 Classic, 3 Pro, 4 Pro), Avata / FPV (Avata, Avata 2, FPV).
For each: max wind resistance, operating temperature, weight class, from DJI's official spec pages.

## Rules (both selectable)
- **SACAA Part 101 private / recreational**
- **SACAA RPL / ROC**
- Shown: 120 m / 400 ft AGL, VLOS, daylight, 10 km from aerodromes, etc.
- Legal limits and DJI manufacturer limits are labelled separately.

## Rating logic
- Daylight hours only (sunrise to sunset).
- **Red:** any factor over its limit.
- **Yellow:** any factor at ≥ 70% of its limit.
- **Green:** otherwise.
- Factors: wind + gusts (ground and ~120 m), precipitation chance, temperature range, visibility / cloud base.
- **Kp is shown for information only** and does not change the colour.

## Airspace
- Nearest SA aerodrome is looked up; a warning appears within 10 km, and that aerodrome's METAR/TAF is shown.

## Widget (Scriptable, medium)
- Big dot for right now, wind, and Kp.
- A row of 7 small daily dots for the next week.
- Tapping it opens the web app.

## User setup still needed
- Install Scriptable (App Store, free).
- Create a GitHub repo for Pages hosting.

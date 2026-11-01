// Fetches current METARs and TAFs for South Africa (and neighbouring
// border stations) from aviationweather.gov and writes them as JSON for the
// web app. Run by the GitHub Pages workflow, because that API doesn't allow
// browser (CORS) requests.
import { writeFile } from "node:fs/promises";

const BBOX = "-35,16,-22,33";
const base = "https://aviationweather.gov/api/data/";
const get = async (what) => {
  const r = await fetch(`${base}${what}?bbox=${BBOX}&format=json`, { headers: { "User-Agent": "FlyCheck-SA (GitHub Pages)" } });
  if (!r.ok) throw new Error(`${what}: HTTP ${r.status}`);
  return r.json();
};

const [metars, tafs] = await Promise.all([get("metar"), get("taf")]);
// An empty or odd reply must not replace the last good file in the deploy.
if (!Array.isArray(metars) || !Array.isArray(tafs) || !metars.length) {
  console.error("No METARs returned; keeping the existing file");
  process.exit(1);
}
const out = {
  generated: new Date().toISOString(),
  source: "aviationweather.gov",
  metars: metars.map(({ icaoId, name, lat, lon, rawOb, fltCat, obsTime }) => ({ icaoId, name, lat, lon, rawOb, fltCat, obsTime })),
  tafs: tafs.map(({ icaoId, rawTAF, validTimeFrom, validTimeTo }) => ({ icaoId, rawTAF, validTimeFrom, validTimeTo })),
};
await writeFile(process.argv[2] || "site/data/aviation.json", JSON.stringify(out));
console.log(`Wrote ${out.metars.length} METARs, ${out.tafs.length} TAFs`);

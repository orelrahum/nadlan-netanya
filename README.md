# מפת נדל"ן נתניה · Netanya Real-Estate Deals Map

אתר אינטראקטיבי המציג עסקאות נדל"ן בעיר **נתניה** על גבי מפה לחיצה, יחד עם נקודות
עניין בסביבה: בתי ספר, גני ילדים, מינימרקטים, סופרמרקטים, פארקים, מרפאות ועוד.

An interactive website that plots real-estate transactions in **Netanya, Israel** on a
clickable map, alongside nearby amenities (schools, kindergartens, mini-markets,
supermarkets, parks, clinics, etc.).

## ✨ Features

- 🗺️ **Clickable Leaflet map** with clustered deal markers, colored by price-per-m².
- 🏫 **Amenity layers** — schools, kindergartens, mini/super-markets, pharmacies,
  clinics, parks, playgrounds, places of worship, banks and more (toggleable).
- 🔎 **Filters** — date range, number of rooms, price range and property type.
- 📊 **Live stats** — number of deals shown, median price, median ₪/m².
- 📋 **Deals table** synced to the current filters (click a row to fly to it on the map).
- 📱 Responsive, right-to-left (Hebrew) UI.

## 🚀 Run it

It is a fully static site. Serve the folder with any static server:

```bash
python3 -m http.server 8099
# open http://localhost:8099/
```

(Internet access is needed for the map tiles and the Leaflet CDN scripts.)

## 🗃️ Data sources

| Data                | Source                                             |
|---------------------|----------------------------------------------------|
| Real-estate deals   | אתר הנדל"ן הממשלתי — `api.nadlan.gov.il`            |
| Address coordinates | ממשל זמין — `govmap.gov.il` search service         |
| Amenities / POIs    | OpenStreetMap (Overpass API)                       |
| Map tiles           | CARTO / OpenStreetMap                              |

The deal data is the official government real-estate transaction registry for
Netanya (CBS settlement code **7400**).

## 🔧 Data pipeline (regenerating `data/`)

The site reads three files in `data/`: `deals.json`, `amenities.json`, `meta.json`.
They are produced by the Node scripts in the repo root:

```bash
npm install                      # installs puppeteer-core (for harvesting)

# 1. Harvest deals (last 3 years) from the government API into netanya_deals_raw.json
node harvest.js                  # rate-limit-friendly, resumable, checkpoints each page
# tip: COOLDOWN=600000 PACE=90000 node harvest.js   # gentler pacing if you hit limits

# 2. Geocode deal addresses  -> geocode_cache.json
node build_geocode.js
node build_geocode_neigh.js      # neighborhood-level fallback for address-less deals

# 3. Fetch amenities from OpenStreetMap -> netanya_amenities.json
#    (overpass.ql holds the query)
node process_amenities.js

# 4. Build the site data files in data/
node build_data.js
```

### A note on the deal harvester

`nadlan.gov.il` protects its data with reCAPTCHA Enterprise and a strict per-IP
rate limit. `harvest.js` drives the real site headlessly to obtain valid tokens,
reproduces the site's request-signing scheme, and fetches deals page by page. It
**checkpoints** every page to `netanya_deals_raw.json`, so it can be stopped and
resumed, and it gradually extends the historical coverage backwards over time.
Because of the rate limit, a full multi-year backfill is best run slowly in the
background. After it collects more data, re-run `node build_data.js` to refresh the
site.

## 📁 Structure

```
index.html              # app shell (RTL Hebrew)
css/style.css           # styling
js/app.js               # map, filters, layers, popups, stats
data/                   # deals.json, amenities.json, meta.json  (consumed by the site)
favicon.svg
harvest.js              # deal harvester (resumable, checkpoints)
build_geocode.js        # address geocoder (govmap)
build_geocode_neigh.js  # neighborhood geocoder (fallback)
overpass.ql             # OpenStreetMap amenity query
process_amenities.js    # amenity cleaner/categorizer
build_data.js           # builds data/ from the raw caches
```

## ⚠️ Disclaimer

Data is provided for general information only. Some deals that lack a precise street
address (e.g. units in projects still under construction) are shown at the **center
of their neighborhood** and flagged as an approximate location in the popup.

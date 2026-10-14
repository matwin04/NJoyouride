import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { initResize } from "./re-size.js";

let maps = [];
let currentMap = null;
const list = document.getElementById("list");

initResize();
initTheme();
loadMaps();

// ==============================
// HELPERS
// ==============================

function delayClass(delaySec) {
    if (delaySec == null) return "";
    const min = delaySec / 60;
    if (min < -1) return "early";
    if (min > 10) return "very-late";
    if (min > 3) return "late";
    return "on-time";
}

function formatTime(iso) {
    if (!iso) return null;
    return new Date(iso).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
    });
}

function delayText(delaySec) {
    if (delaySec == null) return "Scheduled";
    const min = Math.round(delaySec / 60);
    if (min === 0) return "On time";
    return min > 0 ? `${min} min late` : `${-min} min early`;
}

// ==============================
// THEME
// ==============================

function initTheme() {
    const btn = document.getElementById("theme-toggle");
    if (!btn) return;

    const render = () => {
        const dark = document.body.classList.contains("dark");
        btn.innerHTML = dark
            ? '<span class="mdi mdi-weather-sunny"></span>'
            : '<span class="mdi mdi-weather-night"></span>';
    };

    if (localStorage.getItem("theme") === "dark") {
        document.body.classList.add("dark");
    }
    render();

    btn.addEventListener("click", () => {
        const dark = document.body.classList.toggle("dark");
        localStorage.setItem("theme", dark ? "dark" : "light");
        render();
    });
}

// ==============================
// LOAD MAPS
// ==============================

async function loadMaps() {
    try {
        const response = await fetch("/api/maps");
        if (!response.ok) {
            throw new Error(`Failed to load maps: ${response.status}`);
        }

        maps = await response.json();

        const select = document.getElementById("map-select");
        if (!select) return;

        select.innerHTML = "";
        for (const map of maps) {
            select.appendChild(new Option(map.name, map.id));
        }

        select.addEventListener("change", (event) => {
            loadSelectedMap(event.target.value);
        });

        if (maps.length > 0) {
            await loadSelectedMap(maps[0].id);
        }
    } catch (error) {
        console.error("Failed to load maps:", error);
    }
}

// ==============================
// LOAD SELECTED MAP
// ==============================

async function loadSelectedMap(mapId) {
    // <select> values are always strings, so compare as strings
    const map = maps.find((m) => String(m.id) === String(mapId));
    if (!map) return;

    currentMap = map;
    console.log("Selected map:", currentMap);

    document.getElementById("svg-container").innerHTML = "";

    if (map.type === "svg") {
        await loadSVG(map.file);
    } else if (map.type === "api") {
        await loadApiMap(map);
    }
}

// ==============================
// LOAD SVG
// ==============================

async function loadSVG(url) {
    try {
        const svgDoc = await d3.xml(url);
        const container = document.getElementById("svg-container");
        const svg = container.appendChild(svgDoc.documentElement);

        const svgSel = d3
            .select(svg)
            .attr("width", "100%")
            .attr("height", "100%")
            .style("cursor", "grab");

        // Wrap all existing SVG children in a single group for zooming
        const content = svgSel.append("g").attr("id", "map-layer");
        const layer = content.node();

        while (svg.firstChild && svg.firstChild !== layer) {
            layer.appendChild(svg.firstChild);
        }

        enableZoom(svgSel, content);
        hookMap(content);
    } catch (error) {
        console.error("Failed to load SVG:", error);
    }
}

// ==============================
// API MAP
// ==============================

async function loadApiMap(map) {
    console.log("API map:", map);
}

// ==============================
// ZOOM
// ==============================

function enableZoom(svg, content) {
    const zoom = d3
        .zoom()
        .scaleExtent([0.5, 10])
        .on("zoom", (event) => {
            content.attr("transform", event.transform);
        });

    svg.call(zoom);
}

// ==============================
// MAP STATIONS
// ==============================

function hookMap(map) {
    map.selectAll("g.station")
        .style("cursor", "pointer")
        .on("click", async function () {
            const station = d3.select(this);

            const stopId = station.attr("id");
            const agencyId = station.attr("data-agency-id");
            console.log("Agency:", agencyId);
            console.log("Stop:", stopId);
            await getDepartures(stopId, agencyId);
        })
        .on("mouseenter", function () {
            d3.select(this).selectAll("rect").attr("fill", "#ffcc00");
        })
        .on("mouseleave", function () {
            d3.select(this).selectAll("rect").attr("fill", "white");
        });
}

// ==============================
// DEPARTURES (Transitland)
// ==============================

// Merge every platform at the station (e.g. A + C line platforms), dedupe, sort, drop departed trains
function collectDepartures(data) {
    const stop = data.stops?.[0];
    if (!stop) return [];

    const platforms = stop.parent?.children?.length ? stop.parent.children : [stop];
    const seen = new Set();
    const all = [];

    for (const p of platforms) {
        for (const d of p.departures || []) {
            const key = `${d.trip?.trip_id}-${d.service_date}`;
            if (seen.has(key)) continue;
            seen.add(key);
            all.push(d);
        }
    }

    const t = (d) =>
        new Date(d.departure?.estimated_utc || d.departure?.scheduled_utc).getTime();
    const cutoff = Date.now() - 60_000;

    return all.filter((d) => t(d) >= cutoff).sort((a, b) => t(a) - t(b));
}

function renderDepartures(data) {
    const departures = collectDepartures(data);
    list.innerHTML = "";

    if (!departures.length) {
        list.innerHTML = `<div class="empty">No upcoming departures</div>`;
        return;
    }

    departures.slice(0, 5).forEach((dep) => {
        const route = dep.trip?.route ?? {};
        const times = dep.departure ?? dep.arrival ?? {};
        const delay = times.estimated_delay;
        const cls = delayClass(delay);

        const routeName =
            route.route_short_name || route.route_long_name || route.route_id || "—";

        // "Metro A Line - Pomona Station" -> "Pomona Station"
        let headsign = dep.trip?.trip_headsign || dep.stop_headsign || "";
        const prefix = route.route_long_name ? `${route.route_long_name} - ` : null;
        if (prefix && headsign.startsWith(prefix)) headsign = headsign.slice(prefix.length);

        const div = document.createElement("div");
        div.className = "departure";
        div.innerHTML = `
        <div class="row-top">
          <span class="route" style="background:#${route.route_color || "666"};color:#${route.route_text_color || "fff"}">
            ${routeName}
          </span>
          <span class="headsign">${headsign}</span>
        </div>
        <div class="row-bottom">
          <span class="sched">Sched ${formatTime(times.scheduled_local)}</span>
          ${times.estimated_local
            ? `<span class="live ${cls}">Live ${formatTime(times.estimated_local)}</span>`
            : ""}
          <span class="delay ${cls}">${delayText(delay)}</span>
        </div>
      `;
        list.appendChild(div);
    });
}

function renderStationInfo(data) {
    const stop = data.stops?.[0];
    if (!stop) return;
    const h = document.createElement("h2");
    h.className = "station-name";
    h.textContent = stop.parent?.stop_name || stop.stop_name;
    list.prepend(h);
}

async function getDepartures(stopId, agencyId) {
    const url = `/api/departures/${agencyId}/${stopId}`;
    console.log(url);

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to load departures: ${response.status}`);
        }
        const data = await response.json();
        renderDepartures(data);
        renderStationInfo(data); // after renderDepartures, since that clears the list
        console.log(data);
    } catch (error) {
        console.error(error);
        list.innerHTML = `<div class="empty">Couldn't load departures</div>`;
    }
}
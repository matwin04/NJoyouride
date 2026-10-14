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

function delayClass(delaySec, cancelled) {
    if (cancelled) return "cancelled";
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

function delayText(delaySec, cancelled) {
    if (cancelled) return "Cancelled";
    if (delaySec == null) return "Scheduled";
    const min = Math.round(delaySec / 60);
    if (min === 0) return "On time";
    return min > 0 ? `${min} min late` : `${-min} min early`;
}

// MOTIS colors come as bare hex ("0072BC"); tolerate a leading "#" just in case
function hex(color, fallback) {
    return `#${(color || fallback).replace(/^#/, "")}`;
}

function escapeHtml(str = "") {
    return String(str).replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[c]);
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
            // MOTIS stop IDs are feed-prefixed, e.g. "<feed>_80112S".
            // Put the full ID in data-stop-id; falls back to the element id.
            const stopId = station.attr("data-stop-id") || station.attr("id");
            console.log("Stop:", stopId);
            await getDepartures(stopId);
        })
        .on("mouseenter", function () {
            d3.select(this).selectAll("rect").attr("fill", "#ffcc00");
        })
        .on("mouseleave", function () {
            d3.select(this).selectAll("rect").attr("fill", "white");
        });
}

// ==============================
// DEPARTURES (MOTIS / Transitous)
// ==============================

// Flatten a MOTIS StopTime into the fields the board needs
function normalizeStopTime(st) {
    const p = st.place ?? {};
    const scheduled = p.scheduledDeparture || p.scheduledArrival;
    const live = st.realTime ? p.departure || p.arrival : null;
    const delay =
        live && scheduled ? Math.round((new Date(live) - new Date(scheduled)) / 1000) : null;

    return {
        route: st.routeShortName || st.displayName || st.routeLongName || "—",
        routeLong: st.routeLongName || "",
        color: hex(st.routeColor, "666666"),
        textColor: hex(st.routeTextColor, "FFFFFF"),
        headsign: st.headsign || st.tripTo?.name || "",
        track: p.track || p.scheduledTrack || null,
        scheduled,
        live,
        delay,
        cancelled: Boolean(st.cancelled || st.tripCancelled),
    };
}

function renderDepartures(data) {
    const departures = (data.stopTimes || []).map(normalizeStopTime);
    list.innerHTML = "";

    if (!departures.length) {
        list.innerHTML = `<div class="empty">No upcoming departures</div>`;
        return;
    }

    departures.slice(0, 8).forEach((dep) => {
        const cls = delayClass(dep.delay, dep.cancelled);

        // "Metro A Line - Pomona Station" -> "Pomona Station"
        let headsign = dep.headsign;
        const prefix = dep.routeLong ? `${dep.routeLong} - ` : null;
        if (prefix && headsign.startsWith(prefix)) headsign = headsign.slice(prefix.length);

        const div = document.createElement("div");
        div.className = `departure ${dep.cancelled ? "is-cancelled" : ""}`;
        div.innerHTML = `
        <div class="row-top">
          <span class="route" style="background:${dep.color};color:${dep.textColor}">
            ${escapeHtml(dep.route)}
          </span>
          <span class="headsign">${escapeHtml(headsign)}</span>
          ${dep.track ? `<span class="track">Plat ${escapeHtml(dep.track)}</span>` : ""}
        </div>
        <div class="row-bottom">
          <span class="sched">Sched ${formatTime(dep.scheduled)}</span>
          ${dep.live && !dep.cancelled
              ? `<span class="live ${cls}">Live ${formatTime(dep.live)}</span>`
              : ""}
          <span class="delay ${cls}">${delayText(dep.delay, dep.cancelled)}</span>
        </div>
      `;
        list.appendChild(div);
    });
}

function renderStationInfo(data) {
    const name = data.place?.name;
    if (!name) return;
    const h = document.createElement("h2");
    h.className = "station-name";
    h.textContent = name;
    list.prepend(h);
}

async function getDepartures(stopId) {
    const url = `/api/stoptimes/${encodeURIComponent(stopId)}`;
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
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
function delayClass(scheduled, realtime) {
    if (!scheduled || !realtime) return "";
    const delayMin = (new Date(realtime) - new Date(scheduled)) / 60000;
    if (delayMin < 0) return "early";
    if (delayMin > 10) return "very-late";
    if (delayMin > 3) return "late";
    return "on-time";
}

function formatTime(unixSeconds) {
    if (!unixSeconds) return null;
    return new Date(unixSeconds * 1000).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
    });
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
            const chateauId = station.attr("data-chateau-id");
            //const stopName = station.attr("data-name") || station.attr("name") || stopId;
            console.log("Chateau:", chateauId);
            console.log("Stop:", stopId);
            await getDepartures(stopId, chateauId);
        })
        .on("mouseenter", function () {
            d3.select(this).selectAll("rect").attr("fill", "#ffcc00");
        })
        .on("mouseleave", function () {
            d3.select(this).selectAll("rect").attr("fill", "white");
        });
}

// ==============================
// LOAD DEPARTURES
function renderStationInfo(data) {
    const primary = data.primary || [];
    const div = document.createElement("div");
    div.innerHTML = `
        <h1></h1>
    `;
}
function renderDepartures(data) {
    const events = data.events || [];
    list.innerHTML = "";
    events.slice(0, 5).forEach((event) => {
        const scheduled = event?.scheduled_departure;
        const realtime = event?.realtime_departure;
        const cls = delayClass(scheduled, realtime);

        const div = document.createElement("div");
        div.className = "departure";
        div.innerHTML = `
        <div class="row-top">
          <span class="route">${event.route_id || "—"}</span>
          <span>${event.headsign}</span>
        </div>
        <div class="row-bottom">
          <span class="rt">${event.realtime}</span><br>
          <span class="sched">Sched ${formatTime(event.scheduled_departure)}</span>
          <span class="live ${cls}">Live ${formatTime(realtime)}</span>
        </div>
       
      `;
        list.appendChild(div);
    });
}


// ==============================
async function getDepartures(stopId,chateauId) {
    const url = `/api/departures/${chateauId}/${stopId}`;
    const options = { method: "GET" };
    console.log(url);

    try {
        const response = await fetch(url, options);
        const data = await response.json();
        renderDepartures(data);
        renderStationInfo(data);
        console.log(data);
        //console.log(data.primary.stop_name);
    } catch (error) {
        console.error(error);
    }
}

// ==============================
// RENDER: SELECTED STOP
// ==============================


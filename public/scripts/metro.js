import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { initResize } from "./re-size.js";
// ==============================
// INIT
// ==============================

loadSVG("/public/maps/bart.svg");
initResize();
initTabs();
// ==============================
// LOAD SVG
// ==============================

async function loadSVG(url) {
    const svgDoc = await d3.xml(url);

    const svg = d3.select("#svg-container").node().appendChild(svgDoc.documentElement);

    const svgSel = d3.select(svg).attr("width", "100%").attr("height", "100%").style("cursor", "grab");

    const content = svgSel.append("g").attr("id", "map-layer");

    // Move all original SVG nodes into group
    while (svg.firstChild && svg.firstChild !== content.node()) {
        content.node().appendChild(svg.firstChild);
    }

    enableZoom(svgSel, content);
    hookMap(content);
}

// ==============================
// ZOOM / PAN
// ==============================

function initTabs() {
    const tabs = document.querySelectorAll(".tab");

    tabs.forEach((btn) => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
            document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));

            btn.classList.add("active");
            document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
        });
    });
}
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
// MAP INTERACTION
// ==============================

function hookMap(map) {
    map.selectAll("g.station")
        .style("cursor", "pointer")

        .on("click", async function () {
            const stationId = d3.select(this).attr("id");

            // 1. Load station info
            const infoData = await fetchStationInfo(stationId);
            renderStationInfo(stationId, infoData);

            // 2. Load departures
            const etaData = await fetchDepartures(stationId);
            renderDepartures(etaData);
        })

        .on("mouseenter", function () {
            d3.select(this).selectAll("rect").attr("fill", "#ffcc00");
        })

        .on("mouseleave", function () {
            d3.select(this).selectAll("rect").attr("fill", "white");
        });
}

// ==============================
// FETCH FUNCTIONS
// ==============================

async function fetchStationInfo(stationId) {
    const res = await fetch(`/api/station-info?stationId=${stationId}`);
    return await res.json();
}

async function fetchDepartures(stationId) {
    const res = await fetch(`/api/eta?stationId=${stationId}`);
    return await res.json();
}
// ==============================
// RENDER STATION INFO
// ==============================

function renderStationInfo(stationId, data) {
    document.getElementById("station-id").innerHTML = stationId;
    document.getElementById("station-name").innerHTML = data.root.stations.station.name;
    document.getElementById("station-addr").innerHTML = data.root.stations.station.address;
}
// ==============================
// RENDER DEPARTURES (MAIN)
// ==============================


function renderDepartures(etaData) {
    const container = document.getElementById("departures");
    container.innerHTML = "";

    const station = etaData.root.station[0];
    const etdList = station?.etd || [];

    if (etdList.length === 0) {
        container.innerHTML = "<p>No departures</p>";
        return;
    }

    etdList.forEach((route) => {
        const group = createDepartureGroup(route);
        container.appendChild(group);
    });
}

// ==============================
// CREATE GROUP (DESTINATION BLOCK)
// ==============================

function createDepartureGroup(route) {
    const group = document.createElement("div");
    group.className = "departure-group";

    const header = createDepartureHeader(route);
    const times = createDepartureTimes(route);
    const meta = createDepartureMeta(route);
    group.appendChild(header);
    group.appendChild(times);
    group.appendChild(meta);
    return group;
}

// ==============================
// HEADER (DESTINATION + COLOR)
// ==============================

function createDepartureHeader(route) {
    const header = document.createElement("div");
    header.className = "departure-header";

    const color = route.estimate[0]?.hexcolor || "#ccc";
    const routename = route.estimate[0]?.color;
    header.innerHTML = `
        <img class="route-icon" src="/public/icons/BAY/${routename}.svg">
        <strong>${route.destination}</strong>
    `;

    return header;
}

// ==============================
// TIMES ROW
// ==============================

function createDepartureTimes(route) {
    const times = document.createElement("div");
    times.className = "departure-times";

    route.estimate.forEach((est) => {
        const t = document.createElement("span");
        t.className = "train-etd";

        t.textContent = est.minutes === "Leaving" ? "Leaving" : `${est.minutes} min`;

        times.appendChild(t);
    });

    return times;
}

// ==============================
// META (PLATFORM + DIRECTION)
// ==============================

function createDepartureMeta(route) {
    const meta = document.createElement("div");
    meta.className = "departure-meta";

    const first = route.estimate[0];

    meta.textContent = `Platform ${first.platform} • ${first.direction}`;

    return meta;
}

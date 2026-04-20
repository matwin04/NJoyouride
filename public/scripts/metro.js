import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { initResize } from "./re-size.js";
// ==============================
// INIT
// ==============================

loadSVG("/public/maps/bart.svg");
initResize();
initTabs();
initTheme();
function initTheme() {
    const btn = document.getElementById("theme-toggle");

    // load saved theme
    if (localStorage.getItem("theme") === "dark") {
        document.body.classList.add("dark");
    }

    btn.addEventListener("click", () => {
        document.body.classList.toggle("dark");

        const isDark = document.body.classList.contains("dark");

        localStorage.setItem("theme", isDark ? "dark" : "light");

        // change icon
        btn.innerHTML = isDark
            ? '<span class="mdi mdi-weather-sunny"></span>'
            : '<span class="mdi mdi-weather-night"></span>';
    });
}

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

            // ======================
            // STATION INFO
            // ======================
            const infoRes = await fetch(`/api/station-info?stationId=${stationId}`);
            const infoData = await infoRes.json();
            renderStationInfo(stationId, infoData);

            // ======================
            // ACCESS INFO (NEW)
            // ======================
            const accessRes = await fetch(`/api/station-info/access?stationId=${stationId}`);
            const accessData = await accessRes.json();
            renderAccess(accessData);
            const discoveryRes = await fetch(`/api/station-info/discovery?stationId=${stationId}`);
            const discoveryData = await discoveryRes.json();
            renderDiscovery(discoveryData);
            // ======================
            // DEPARTURES
            // ======================
            const etaRes = await fetch(`/api/eta?stationId=${stationId}`);
            const etaData = await etaRes.json();
            renderDepartures(etaData);

            loadBikeShare(stationId);
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

// ==============================
// RENDER STATION INFO
// ==============================
async function loadBikeShare(stationId) {
    const container = document.getElementById("bikeshare");
    container.innerHTML = "Loading bikes...";

    const res = await fetch(`/api/station-info/bikeshare?stationId=${stationId}`);
    const stations = await res.json();

    if (!stations || stations.length === 0) {
        container.innerHTML = "No bikeshare available";
        return;
    }

    container.innerHTML = "";

    stations.forEach((data) => {
        const bikes = data.status.num_bikes_available;
        const ebikes = data.status.num_ebikes_available;
        const capacity = data.info.capacity;

        const percent = Math.round(((bikes + ebikes) / capacity) * 100);

        const card = document.createElement("div");
        card.className = "bikeshare-card";
        const total = bikes + ebikes;
        const docks = capacity - total;

        const bikesPercent = (bikes / capacity) * 100;
        const ebikesPercent = (ebikes / capacity) * 100;
        card.innerHTML = `
            <div class="bike-card-grid">
        
                <div class="bike-name">
                    ${data.name}
                </div>
        
                <!-- SPLIT METER -->
                <div class="bike-meter">
                    <div class="bike-fill bike-classic" style="width:${bikesPercent}%"></div>
                    <div class="bike-fill bike-ebike" style="width:${ebikesPercent}%"></div>
                </div>
        
                <!-- STATS -->
                <div class="bike-stat classic">
                    <span class="mdi mdi-bicycle"></span>
                    <span>${bikes}</span>
                </div>
        
                <div class="bike-stat ebike">
                    <span class="mdi mdi-bicycle-electric"></span>
                    <span>${ebikes}</span>
                </div>
        
                <div class="bike-stat docks">
                    <span class="mdi mdi-parking"></span>
                    <span>${docks}</span>
                </div>
        
            </div>
        `;
        container.appendChild(card);
    });
}
function renderDiscovery(data) {
    const container = document.getElementById("discover");
    container.innerHTML = "";
    const station = data.root.stations.station;
    const getHTML = (field) =>
        field && field["#cdata-section"] ? field["#cdata-section"] : "<p>No information available</p>";
    container.innerHTML = `
        <div class="info-group">
            <h3>${station.name}</h3>
        </div>
        <div class="info-group">
            <h4>
             <span class="mdi mdi-information-variant"></span> Intro </h4>
            ${getHTML(station.intro)}
        </div>
        <div class="info-group">
            <h4>
             <span class="mdi mdi-information-variant"></span> Food </h4>
            ${getHTML(station.food)}
        </div>
        <div class="info-group">
            <h4>
             <span class="mdi mdi-map-marker"></span> Cross Streets </h4>
            ${getHTML(station.cross_street)}
        </div>
        <div class="info-group">
            <h4>
             <span class="mdi mdi-shopping"></span> Shopping </h4>
            ${getHTML(station.shopping)}
        </div>
        <div class="info-group">
            <h4>
             <span class="mdi mdi-ticket"></span> Attractions </h4>
            ${getHTML(station.shopping)}
        </div>
    </div>
    `;
}
function renderAccess(data) {
    const container = document.getElementById("info");
    container.innerHTML = "";

    const station = data.root.stations.station;

    // helper to safely extract HTML
    const getHTML = (field) =>
        field && field["#cdata-section"] ? field["#cdata-section"] : "<p>No information available</p>";

    container.innerHTML = `
        <div class="info-group">
            <h3>${station.name}</h3>
        </div>

        <div class="info-group">
            <h4>
             <span class="mdi mdi-human"></span> Station Access</h4>
            ${getHTML(station.entering)}
        </div>

        <div class="info-group">
            <h4><span class="mdi mdi-parking"> Parking</h4>
            ${getHTML(station.parking)}
        </div>

        <div class="info-group">
            <h4>
             <span class="mdi mdi-bike"></span> Bike / Lockers</h4>
            ${getHTML(station.lockers)}
        </div>

        <div class="info-group">
            <h4><span class="mdi mdi-subway-variant"></span> Transit Connections</h4>
            ${getHTML(station.transit_info)}
        </div>
    `;
}
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
    group.addEventListener("click", () => {
        highlightRoute(route);
    });

    group.appendChild(header);
    group.appendChild(times);
    group.appendChild(meta);
    return group;
}
function resetHighlight() {
    const svg = d3.select("#svg-container svg");

    svg.selectAll("path")
        .classed("dimmed", false)
        .classed("active-line", false)
        .style("opacity", 1)
        .style("stroke-width", 5);

    svg.selectAll("g.station").classed("active-station", false).style("opacity", 1);
}
function highlightRoute(route) {
    const routeClass = route.estimate[0]?.color;

    const svg = d3.select("#svg-container svg");

    svg.selectAll("path").classed("dimmed", true).classed("active-line", false);

    svg.selectAll(`path.${routeClass}`).classed("dimmed", false).classed("active-line", true);
} // HEADER (DESTINATION + COLOR)
// ==============================
function createDepartureHeader(route) {
    const header = document.createElement("div");
    header.className = "departure-header";

    const color = route.estimate[0]?.hexcolor || "#ccc";
    const routename = route.estimate[0]?.color;
    header.innerHTML = `
        <img class="route-icon" src="/public/icons/BAY/${routename}.svg" alt="${routename}">
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

    meta.textContent = `Platform ${first.platform} • ${first.direction} ${first.length} Car`;

    return meta;
}
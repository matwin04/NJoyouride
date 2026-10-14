// Metro Live Map - improved MapLibre + Metro real-time vehicle feed
// Keeps the original functions, route metadata, popups, and vehicle GeoJSON layer,
// while fixing update flow, input validation, stale vehicles, and reconnect handling.

const vehicles = {};
// DOM markers keyed by Metro vehicle ID.
const markers = {};
let params = new URLSearchParams(window.location.search);

const routeColors = {
  801: "#0072BC",
  802: "#EB131B",
  803: "#58A738",
  804: "#FDB913",
  805: "#A05DA5",
  806: "#A05DA5",
  807: "#E56DB1",
  901: "#F58220",
  910: "#00A6A6",
  950: "#888888",
  unknown: "#888888"
};

const routeIcons = {
  801: "https://lacmta.github.io/metro-iconography/Service_ALine.svg",
  802: "https://lacmta.github.io/metro-iconography/Service_BLine.svg",
  803: "https://lacmta.github.io/metro-iconography/Service_CLine.svg",
  804: "https://lacmta.github.io/metro-iconography/Service_ELine2.svg",
  806: "https://lacmta.github.io/metro-iconography/Service_LLine.svg",
  807: "https://lacmta.github.io/metro-iconography/Service_KLine.svg",
  805: "https://lacmta.github.io/metro-iconography/Service_DLine.svg",
  901: "https://lacmta.github.io/metro-iconography/Service_GLine.svg",
  910: "https://lacmta.github.io/metro-iconography/Service_JLine.svg"
};

const VEHICLE_SOURCE_ID = "vehicles";
const VEHICLE_LAYER_ID = "vehicles-layer";
const VEHICLE_MAX_AGE_MS = 2 * 60 * 1000;
const RECONNECT_DELAY_MS = 5000;
const VEHICLE_FEED_URL = "wss://api.metro.net/ws/LACMTA_Rail/vehicle_positions";

let map;
let vehicleSocket;
let reconnectTimer;
let cleanupTimer;
let mapIsLoaded = false;

function initMap() {
  if (typeof maplibregl === "undefined") {
    throw new Error(
      "MapLibre GL JS did not load. Check the MapLibre script URL and make sure it loads before map.js."
    );
  }

  const requestedZoom = Number(params.get("zoom"));
  const initialZoom = Number.isFinite(requestedZoom) && requestedZoom >= 0
    ? requestedZoom
    : (window.innerWidth <= 768 ? 8 : window.innerWidth <= 1280 ? 9 : 10);

  const newMap = new maplibregl.Map({
    container: "map",
    style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
    center: [-118.25, 34.05],
    zoom: initialZoom,
    minZoom: 7,
    maxZoom: 20,
    pitch: 0,
    bearing: 0,
    antialias: true
  });

  newMap.addControl(new maplibregl.NavigationControl(), "top-left");

  newMap.on("load", () => {
    mapIsLoaded = true;

    if (!newMap.getSource(VEHICLE_SOURCE_ID)) {
      newMap.addSource(VEHICLE_SOURCE_ID, {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: []
        }
      });
    }

    if (!newMap.getLayer(VEHICLE_LAYER_ID)) {
      newMap.addLayer({
        id: VEHICLE_LAYER_ID,
        type: "circle",
        source: VEHICLE_SOURCE_ID,
        paint: {
          "circle-radius": [
            "interpolate", ["linear"], ["zoom"],
            7, 4,
            14, 7,
            18, 9
          ],
          "circle-color": ["coalesce", ["get", "color"], routeColors.unknown],
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#ffffff",
          "circle-opacity": 0
        }
      });
    }

    updateMap(buildVehicleFeatures());
    updateConnectionStatus("Connecting to live vehicle feed…");
  });

  newMap.on("error", (event) => {
    if (event && event.error) {
      console.error("MapLibre error:", event.error);
    }
  });

  return newMap;
}

function updateMap(features) {
  if (!map || !mapIsLoaded || !map.getStyle()) return;

  const source = map.getSource(VEHICLE_SOURCE_ID);
  const featureCollection = {
    type: "FeatureCollection",
    features: Array.isArray(features) ? features : []
  };

  if (source) {
    source.setData(featureCollection);
    return;
  }

  // Defensive fallback in case the source was not created by the load handler.
  map.addSource(VEHICLE_SOURCE_ID, {
    type: "geojson",
    data: featureCollection
  });

  if (!map.getLayer(VEHICLE_LAYER_ID)) {
    map.addLayer({
      id: VEHICLE_LAYER_ID,
      type: "circle",
      source: VEHICLE_SOURCE_ID,
      paint: {
        "circle-radius": 6,
        "circle-color": ["coalesce", ["get", "color"], routeColors.unknown],
        "circle-stroke-width": 1.5,
        "circle-stroke-color": "#ffffff",
        "circle-opacity": 0
      }
    });
  }
}

function processAndUpdate(data) {
  const vehicle = data && data.vehicle;
  const position = vehicle && vehicle.position;
  const vehicleId = vehicle && vehicle.vehicle && vehicle.vehicle.id != null
    ? String(vehicle.vehicle.id)
    : (data && data.id != null ? String(data.id) : "");

  if (!vehicle || !position || !vehicleId) return;

  const latitude = Number(position.latitude);
  const longitude = Number(position.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
      latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    console.warn("Ignoring vehicle update with invalid coordinates:", data);
    return;
  }

  const routeCode = data.route_code != null ? String(data.route_code) : "unknown";
  const timestampValue = Number(vehicle.timestamp);
  const timestamp = Number.isFinite(timestampValue) && timestampValue > 0
    ? timestampValue
    : Math.floor(Date.now() / 1000);

  const feature = {
    type: "Feature",
    properties: {
      id: vehicleId,
      vehicle_id: vehicleId,
      currentStatus: vehicle.currentStatus,
      currentStopSequence: vehicle.currentStopSequence,
      stopId: vehicle.stopId,
      timestamp,
      route_code: routeCode,
      trip: vehicle.trip || {},
      trip_id: vehicle.trip && vehicle.trip.tripId,
      position_bearing: position.bearing,
      position_speed: position.speed,
      position_latitude: latitude,
      position_longitude: longitude
    },
    geometry: {
      type: "Point",
      coordinates: [longitude, latitude]
    }
  };

  const markerData = { feature, rawData: data };

  // Update an existing marker in place, or create it for a newly seen vehicle.
  if (markers[vehicleId]) {
    updateExistingMarker(markerData);
  } else {
    createNewMarker(markerData);
  }

  // Keep the GeoJSON source synchronized for other layers/features that use it.
  vehicles[vehicleId] = {
    id: vehicleId,
    coordinates: [longitude, latitude],
    color: routeColors[routeCode] || routeColors.unknown,
    routeCode,
    timestamp: timestamp * 1000,
    data
  };

  updateMap(buildVehicleFeatures());
  updateLastUpdatedTime();
  updateConnectionStatus(`Live data connected · ${Object.keys(vehicles).length} vehicles`);
}

function getFeaturesFromData(data) {
  let features;

  if (data && Array.isArray(data.features)) {
    features = data.features;
  } else if (data && data.features && typeof data.features === "object") {
    features = Object.values(data.features);
  } else if (data && Object.keys(data).length > 0) {
    const routeData = data[Object.keys(data)[0]];
    if (routeData && Array.isArray(routeData.features)) {
      features = routeData.features;
    } else if (routeData && routeData.features && typeof routeData.features === "object") {
      features = Object.values(routeData.features);
    }
  }

  if (!features) {
    throw new Error("The API response does not have a features property");
  }

  return features.filter((feature) => {
    const coordinates = feature && feature.geometry && feature.geometry.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length < 2) return false;

    const longitude = Number(coordinates[0]);
    const latitude = Number(coordinates[1]);

    return Number.isFinite(longitude) &&
      Number.isFinite(latitude) &&
      longitude >= -180 && longitude <= 180 &&
      latitude >= -90 && latitude <= 90;
  });
}

function addVehiclePopup(targetMap) {
  const popup = new maplibregl.Popup({
    closeButton: true,
    closeOnClick: true,
    maxWidth: "280px"
  });

  targetMap.on("click", VEHICLE_LAYER_ID, (event) => {
    if (!event.features || !event.features.length) return;

    const feature = event.features[0];
    const vehicleId = String(feature.properties.vehicle_id || "");
    const vehicleRecord = vehicles[vehicleId];

    if (!vehicleRecord) return;

    const data = vehicleRecord.data || {};
    const vehicle = data.vehicle || {};
    const position = vehicle.position || {};
    const trip = vehicle.trip || {};
    const route = vehicleRecord.routeCode || "unknown";
    const icon = routeIcons[route];

    // Build popup DOM nodes instead of interpolating untrusted feed data into HTML.
    const content = document.createElement("div");
    content.className = "vehicle-popup";

    if (icon) {
      const image = document.createElement("img");
      image.src = icon;
      image.alt = `Route ${route}`;
      image.width = 28;
      image.height = 28;
      image.style.verticalAlign = "middle";
      image.style.marginRight = "8px";
      content.appendChild(image);
    }

    const heading = document.createElement("strong");
    heading.textContent = `Vehicle ${vehicleId}`;
    content.appendChild(heading);

    const details = document.createElement("div");
    details.style.marginTop = "8px";
    details.textContent = [
      `Route: ${route}`,
      `Trip: ${trip.tripId || "Not provided"}`,
      `Stop: ${vehicle.stopId || "Not provided"}`,
      `Latitude: ${Number(position.latitude).toFixed(5)}`,
      `Longitude: ${Number(position.longitude).toFixed(5)}`,
      `Updated: ${new Date(vehicleRecord.timestamp).toLocaleTimeString()}`
    ].join("\n");
    details.style.whiteSpace = "pre-line";
    content.appendChild(details);

    popup.setLngLat(feature.geometry.coordinates.slice()).setDOMContent(content).addTo(targetMap);
  });

  targetMap.on("mouseenter", VEHICLE_LAYER_ID, () => {
    targetMap.getCanvas().style.cursor = "pointer";
  });

  targetMap.on("mouseleave", VEHICLE_LAYER_ID, () => {
    targetMap.getCanvas().style.cursor = "";
  });
}

function connectVehicleFeed(targetMap) {
  if (vehicleSocket && (
    vehicleSocket.readyState === WebSocket.OPEN ||
    vehicleSocket.readyState === WebSocket.CONNECTING
  )) {
    return vehicleSocket;
  }

  try {
    vehicleSocket = new WebSocket(VEHICLE_FEED_URL);
  } catch (error) {
    console.error("Could not create Metro WebSocket:", error);
    updateConnectionStatus("Unable to connect to live data; retrying…");
    scheduleReconnect(targetMap);
    return null;
  }

  vehicleSocket.addEventListener("open", () => {
    console.info("Metro vehicle WebSocket connected");
    updateConnectionStatus("Connected; waiting for vehicle updates…");
  });

  vehicleSocket.addEventListener("message", (event) => {
    try {
      const data = JSON.parse(event.data);
      processAndUpdate(data);
    } catch (error) {
      console.error("Could not process Metro vehicle message:", error);
    }
  });

  vehicleSocket.addEventListener("error", (event) => {
    console.error("Metro vehicle WebSocket error:", event);
    updateConnectionStatus("Live data connection error; retrying…");
  });

  vehicleSocket.addEventListener("close", () => {
    console.warn("Metro vehicle WebSocket closed");
    updateConnectionStatus("Live data disconnected; reconnecting…");
    scheduleReconnect(targetMap);
  });

  return vehicleSocket;
}

function scheduleReconnect(targetMap) {
  if (reconnectTimer) return;

  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null;
    connectVehicleFeed(targetMap);
  }, RECONNECT_DELAY_MS);
}

function buildVehicleFeatures() {
  return Object.values(vehicles).map((vehicle) => ({
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: vehicle.coordinates
    },
    properties: {
      vehicle_id: vehicle.id,
      route_code: vehicle.routeCode,
      color: vehicle.color,
      timestamp: vehicle.timestamp
    }
  }));
}

function updateLastUpdatedTime() {
  const updateTimeDiv = document.getElementById("update-time");
  if (!updateTimeDiv) return;

  updateTimeDiv.textContent = `Updated at ${new Date().toLocaleTimeString()}`;
  updateTimeDiv.style.fontSize = "12px";
}

function updateConnectionStatus(message) {
  // Optional status element: add <div id="connection-status"></div> if desired.
  const status = document.getElementById("connection-status");
  if (status) status.textContent = message;
}

function removeOldVehicles() {
  const now = Date.now();
  let changed = false;

  for (const [id, vehicle] of Object.entries(vehicles)) {
    if (now - vehicle.timestamp > VEHICLE_MAX_AGE_MS) {
      delete vehicles[id];
      if (markers[id]) {
        markers[id].remove();
        delete markers[id];
      }
      changed = true;
    }
  }

  if (changed) updateMap(buildVehicleFeatures());
}

// DOM-marker behavior modeled on the original createNewMarker function.
function createNewMarker(markerData) {
  const properties = markerData.feature.properties;
  const vehicleId = String(properties.vehicle_id);
  const routeCode = String(properties.route_code || "unknown");
  const tripId = String(properties.trip_id || "");
  const isBus = ["901", "910", "950"].includes(routeCode);
  const iconUrl = isBus ? "bus.svg" : "rail.svg";
  const heading = Number(properties.position_bearing) || 0;

  if (markers[vehicleId]) {
    markers[vehicleId].remove();
    delete markers[vehicleId];
  }

  const el = document.createElement("div");
  el.className = "marker";
  el.setAttribute("data-route", routeCode);
  el.setAttribute("data-trip", tripId);
  el.setAttribute("data-mode", isBus ? "bus" : "rail");
  el.setAttribute("data-timestamp", String(properties.timestamp));
  el.setAttribute("data-vehicle-id", vehicleId);

  Object.assign(el.style, {
    background: `url("${iconUrl}") no-repeat center / contain`,
    backgroundRepeat: "no-repeat",
    backgroundSize: "contain",
    backgroundPosition: "center",
    backgroundColor: isBus ? "transparent" : "#ffffff",
    cursor: "pointer",
    width: "16px",
    height: "16px",
    borderRadius: isBus ? "0" : "50%"
  });

  const popup = new maplibregl.Popup({ offset: 12 })
    .setDOMContent(createVehiclePopupContent(markerData, isBus ? "Bus ID " : "Train Car #"));

  const marker = new maplibregl.Marker({
    element: el,
    anchor: "center",
    rotationAlignment: "map"
  })
    .setLngLat(markerData.feature.geometry.coordinates)
    .setRotation(heading)
    .setPopup(popup)
    .addTo(map);

  marker.properties = { vehicle_id: vehicleId, Heading: heading };
  marker.timestamp = Number(properties.timestamp) || Math.floor(Date.now() / 1000);
  marker.route_code = routeCode;
  marker.trip_id = tripId;
  marker.mode = isBus ? "bus" : "rail";
  markers[vehicleId] = marker;
}

function updateExistingMarker(markerData) {
  const properties = markerData.feature.properties;
  const vehicleId = String(properties.vehicle_id);
  const routeCode = String(properties.route_code || "unknown");
  const tripId = String(properties.trip_id || "");
  const isBus = ["901", "910", "950"].includes(routeCode);
  const nextMode = isBus ? "bus" : "rail";
  const marker = markers[vehicleId];

  if (!marker) {
    createNewMarker(markerData);
    return;
  }

  // Recreate only if its mode changed; otherwise move the existing marker in place.
  if (marker.mode !== nextMode) {
    marker.remove();
    delete markers[vehicleId];
    createNewMarker(markerData);
    return;
  }

  marker.setLngLat(markerData.feature.geometry.coordinates);

  const heading = Number(properties.position_bearing);
  if (Number.isFinite(heading)) {
    marker.setRotation(heading);
    marker.properties.Heading = heading;
  }

  marker.timestamp = Number(properties.timestamp) || Math.floor(Date.now() / 1000);
  marker.route_code = routeCode;
  marker.trip_id = tripId;

  const element = marker.getElement();
  element.setAttribute("data-route", routeCode);
  element.setAttribute("data-trip", tripId);
  element.setAttribute("data-mode", nextMode);
  element.setAttribute("data-timestamp", String(marker.timestamp));
  element.setAttribute("data-vehicle-id", vehicleId);

  const popup = marker.getPopup();
  if (popup) {
    popup.setDOMContent(
      createVehiclePopupContent(markerData, isBus ? "Bus ID " : "Train Car #")
    );
  }
}

function createVehiclePopupContent(markerData, vehicleLabel) {
  const properties = markerData.feature.properties;
  const routeCode = String(properties.route_code || "unknown");
  const vehicleId = String(properties.vehicle_id || "unknown");
  const content = document.createElement("div");
  content.className = "vehicle-popup";
  content.style.textAlign = "center";

  const iconUrl = routeIcons[routeCode];
  if (iconUrl) {
    const image = document.createElement("img");
    image.src = iconUrl;
    image.alt = `Route ${routeCode}`;
    image.width = 24;
    image.height = 24;
    image.style.verticalAlign = "middle";
    content.appendChild(image);
    content.appendChild(document.createElement("br"));
  }

  const title = document.createElement("strong");
  title.textContent = `${vehicleLabel}${vehicleId}`;
  content.appendChild(title);
  content.appendChild(document.createElement("br"));

  const details = [
    `Route: ${routeCode}`,
    `Stop: ${properties.stopId || "Not provided"}`,
    `Trip: ${properties.trip_id || "Not provided"}`,
    `Data from ${new Date(Number(properties.timestamp) * 1000).toLocaleTimeString()}`
  ];
  const text = document.createElement("div");
  text.textContent = details.join("\n");
  text.style.whiteSpace = "pre-line";
  content.appendChild(text);

  return content;
}

// Retain the original API-response helper for callers that already use it.
function processGeoJSONResponse(data) {
  const features = getFeaturesFromData(data);
  const updateTimeDiv = document.getElementById("update-time");

  if (updateTimeDiv) {
    updateTimeDiv.textContent = `Updated at ${new Date().toLocaleTimeString()}`;
    updateTimeDiv.style.fontSize = "12px";
  }

  return features;
}

map = initMap();

map.on("load", () => {
  addVehiclePopup(map);
  connectVehicleFeed(map);

  if (cleanupTimer) window.clearInterval(cleanupTimer);
  cleanupTimer = window.setInterval(removeOldVehicles, 30000);
});

window.addEventListener("online", () => {
  if (map) connectVehicleFeed(map);
});

window.addEventListener("beforeunload", () => {
  if (reconnectTimer) window.clearTimeout(reconnectTimer);
  if (cleanupTimer) window.clearInterval(cleanupTimer);
  if (vehicleSocket && vehicleSocket.readyState < WebSocket.CLOSING) {
    vehicleSocket.close();
  }
});

import express from "express";
import path from "path";
import dotenv from "dotenv";
import {engine} from "express-handlebars";
import {fileURLToPath} from "url";
import fs from "node:fs/promises";

dotenv.config();

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VIEWS_DIR = path.join(__dirname, "views");
const PARTIALS_DIR = path.join(VIEWS_DIR, "partials");



app.engine("html", engine({ extname: ".html", defaultLayout: false, partialsDir: PARTIALS_DIR }));
app.set("view engine", "html");
app.set("views", VIEWS_DIR);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/public", express.static(path.join(__dirname, "public")));

app.get("/", async (req, res) => {
    res.render("index");
});

async function getDataFile() {
    const filePath = path.join(__dirname, "public", "stations.json");
    const file = await fs.readFile(filePath, "utf-8");
    return JSON.parse(file);
}
app.get("/api/maps", async (req, res) => {
    try {
        const data = await getDataFile();
        const maps = data.maps;
        res.json(maps);
    } catch (err) {
        console.error(err);
    }
});
app.get("/api/station-info/bikeshare", async (req, res) => {
    try {
        const { stationId } = req.query;

        const data = await getDataFile();
        const station = data.stations[stationId];

        if (!station || !station.bikeshare || station.bikeshare.length === 0) {
            return res.json([]);
        }

        const ids = station.bikeshare.map(b => b.stationId);

        const [infoRes, statusRes] = await Promise.all([
            fetch("https://gbfs.lyft.com/gbfs/2.3/bay/en/station_information.json"),
            fetch("https://gbfs.lyft.com/gbfs/2.3/bay/en/station_status.json")
        ]);

        const info = await infoRes.json();
        const status = await statusRes.json();

        const results = ids.map(id => {
            const stationInfo = info.data.stations.find(s => s.station_id === id);
            const stationStatus = status.data.stations.find(s => s.station_id === id);

            if (!stationInfo || !stationStatus) return null;

            return {
                name: stationInfo.name,
                station_id: stationId, // keep BART station id (your pattern)
                bikeshare_id: id,      // 🔥 add this (important!)
                status: stationStatus,
                info: stationInfo
            };
        }).filter(Boolean);

        res.json(results);

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Bikeshare lookup failed" });
    }
});
app.get("/api/bikeshare/status", async (req, res) => {
    const url = "https://gbfs.lyft.com/gbfs/2.3/bay/en/station_status.json";
    const response = await fetch(url);
    const data = await response.json();
    res.json(data);
});
app.get("/api/bikeshare/info", async (req, res) => {
    const url = "https://gbfs.lyft.com/gbfs/2.3/bay/en/station_information.json";
    const response = await fetch(url);
    const data = await response.json();
    res.json(data);
});
app.get("/api/station-info/connections", async (req, res) => {
    try {
        const data = await getDataFile();
        const connections = data.stations.DALY.connections
        res.json(connections);
    } catch (err) {
        console.error(err);
    }
});
app.get("/api/station/parking", async (req, res) => {
    try {
        const data = await getDataFile();
        const {stationId} = req.query;
        const parking = data.stations.stationId.parking;
        res.json(parking);
    } catch (err) {
        console.error(err);
    }
});
app.get("/api/api-docs", async (req, res) => {
    res.render("api-docs");
})
app.get("/api/station-info/access", async (req, res) => {
    try {
        const {stationId} = req.query;
        const url = `https://api.bart.gov/api/stn.aspx?cmd=stnaccess&key=QMAK-PUTH-9BVT-DWEI&orig=${stationId}&json=y`;
        const options = {method: "GET"};
        const response = await fetch(url, options);
        const data = await response.json();
        res.json(data);
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
});
app.get("/api/station-info/discovery", async (req, res) => {
    try {
        const {stationId} = req.query;
        const url = `https://api.bart.gov/api/stn.aspx?cmd=stninfo&key=QMAK-PUTH-9BVT-DWEI&orig=${stationId}&json=y`;
        const options = {method: "GET"};
        const response = await fetch(url, options);
        const data = await response.json();
        res.json(data);
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
});
app.get("/api/station-info", async (req, res) => {
    try {
        const {stationId} = req.query;
        const url = `https://api.bart.gov/api/stn.aspx?cmd=stninfo&key=QMAK-PUTH-9BVT-DWEI&orig=${stationId}&json=y`;
        const options = {method: 'GET'};
        const response = await fetch(url, options);
        const data = await response.json();
        res.json(data);
    } catch (err) {
        console.error("Error loading geocode GeoJSON:", err);
        res.status(500).json({
            error: "Failed to get directions",
            details: err.message
        });
    }
});
app.get("/api/schedule/arrivals", async (req, res) => {
    try {
        const { stationId } = req.query;
        const url = `https://api.bart.gov/api/sched.aspx?cmd=arrive&orig=${stationId}&key=QMAK-PUTH-9BVT-DWEI&json=y`;
        const response = await fetch(url);
        const data = await response.json();
        res.json(data);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Arrival schedule failed" });
    }
});
app.get("/api/schedule/departures", async (req, res) => {
    try {
        const { stationId } = req.query;

        const url = `https://api.bart.gov/api/sched.aspx?cmd=depart&orig=${stationId}&key=QMAK-PUTH-9BVT-DWEI&json=y`;

        const response = await fetch(url);
        const data = await response.json();

        res.json(data);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Departure schedule failed" });
    }
});
app.get("/api/directions", async (req, res) => {
    try {
        const { orig, dest } = req.query;
        const url = `https://api.bart.gov/api/sched.aspx?cmd=arrive&key=QMAK-PUTH-9BVT-DWEI&orig=${orig}&dest=${dest}&json=y`;
        const response = await fetch(url);
        const data = await response.json();
        res.json(data);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Departure schedule failed" });
    }
})
app.get("/api/fare", async (req, res) => {
    try {
        const { from, to } = req.query;

        const url = `https://api.bart.gov/api/sched.aspx?cmd=fare&orig=${from}&dest=${to}&key=QMAK-PUTH-9BVT-DWEI&json=y`;

        const response = await fetch(url);
        const data = await response.json();

        res.json(data);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Fare lookup failed" });
    }
});
app.get("/api/eta",async(req,res)=>{
    try {
        const {stationId} = req.query;
        const url = `https://api.bart.gov/api/etd.aspx?cmd=etd&key=QMAK-PUTH-9BVT-DWEI&orig=${stationId}&json=y`;
         const options = {method: 'GET'};
        const response = await fetch(url, options);
        const data = await response.json();
        res.json(data);

    } catch (err) {
        console.error("Error loading geocode GeoJSON:", err);
        res.status(500).json({
            error: "Failed to get directions",
            details: err.message
        });
    }
});
app.get("/api/agencies", async (req, res) => {
    const data = await getDataFile();
    const agencies = data.agencies;
    res.json(agencies);
});
app.get("/api/bikeshare", async (req, res) => {
    const data = await getDataFile();
    const bikeshare = data.bikeshares;
    res.json(bikeshare);
});
app.get("/debug",(req,res)=>{
    res.render("debug");
});
// START SERVER
if (!process.env.VERCEL && !process.env.NOW_REGION) {
    const PORT = process.env.PORT || 8088;
    app.listen(PORT, () => {
        console.log(`Server running: http://localhost:${PORT}`);
        console.log(`📘 Auto-generated API docs will appear at http://localhost:${PORT}/api/api-docs`);
    });
}

export default app;

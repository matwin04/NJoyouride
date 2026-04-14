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
app.get("/api/station-info/bikeshare", async (req, res) => {
    try {
        const data = await getDataFile();
        const bikeshare = data.stations.DALY.bikeshare
        res.json(bikeshare);
    } catch (err) {
        console.error(err);
    }
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
})
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

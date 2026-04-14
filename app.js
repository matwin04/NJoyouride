import express from "express";
import path from "path";
import dotenv from "dotenv";
import { engine } from "express-handlebars";
import { fileURLToPath } from "url";
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

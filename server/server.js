const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json({ limit: "1mb" }));

const dataDir = path.join(__dirname, "data");
const flightsFile = path.join(dataDir, "flights.json");
const usersFile = path.join(dataDir, "users.json");
const airportsFile = path.join(dataDir, "airports.json");
const logsFile = path.join(dataDir, "logs.json");

function readJson(file, fallback) {
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
        return fallback;
    }
}

function writeJson(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function appendLog(entry) {
    const logs = readJson(logsFile, []);
    logs.push(entry);
    writeJson(logsFile, logs);
}

function ensureFile(file, fallback) {
    if (!fs.existsSync(file)) {
        writeJson(file, fallback);
    }
}

if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

ensureFile(flightsFile, []);
ensureFile(usersFile, []);
ensureFile(logsFile, []);

if (!fs.existsSync(airportsFile)) {
    console.error("Missing airports dataset at server/data/airports.json");
    process.exit(1);
}

const airportsRaw = readJson(airportsFile, null);
if (!airportsRaw) {
    console.error("Unable to read airports dataset.");
    process.exit(1);
}

const airports = Object.values(airportsRaw)
    .map((airport) => ({
        icao: String(airport.icao || "").toUpperCase(),
        iata: String(airport.iata || "").toUpperCase(),
        name: airport.name || "",
        city: airport.city || "",
        country: airport.country || "",
        lat: Number(airport.lat),
        lon: Number(airport.lon),
    }))
    .filter((airport) => airport.icao && Number.isFinite(airport.lat) && Number.isFinite(airport.lon));

const airportsByIcao = new Map(airports.map((airport) => [airport.icao, airport]));

const sessions = new Map();
const zoneAssignments = new Map();
const MSK_OFFSET_MINUTES = 180;
const PRIORITIES = ["NORMAL", "HIGH", "EMERGENCY"];
const FLIGHT_PHASES = [
    "Подготовка",
    "Запуск двигателей",
    "Выталкивание (Pushback)",
    "Руление",
    "Ожидание на исполнительном",
    "Взлёт",
    "Набор высоты",
    "Крейсерский полёт",
    "Снижение",
    "Заход на посадку",
    "Посадка",
    "Руление к гейту",
    "На стоянке / Завершён",
];
const MOSCOW_REGION_ID = "moscow_region";
const DEFAULT_ZONE_RADIUS_KM = 50;
const MOSCOW_AIRPORT_RADIUS_KM = 35;
const MOSCOW_REGION_RADIUS_KM = 220;
const ZONE_DEFINITIONS = [
    {
        id: MOSCOW_REGION_ID,
        name: "Москва (регион)",
        type: "moscow_region",
        level: "region",
        radiusKm: MOSCOW_REGION_RADIUS_KM,
        icaos: ["UUDD", "UUEE"],
    },
    {
        id: "moscow_uudd",
        name: "Домодедово",
        type: "moscow_airport",
        level: "airport",
        parentId: MOSCOW_REGION_ID,
        icao: "UUDD",
        radiusKm: MOSCOW_AIRPORT_RADIUS_KM,
    },
    {
        id: "moscow_uuee",
        name: "Шереметьево",
        type: "moscow_airport",
        level: "airport",
        parentId: MOSCOW_REGION_ID,
        icao: "UUEE",
        radiusKm: MOSCOW_AIRPORT_RADIUS_KM,
    },
    { id: "pulkovo", name: "Пулково", icao: "ULLI" },
    { id: "sochi", name: "Сочи", icao: "URSS" },
    { id: "vladikavkaz", name: "Владивкавказ", icao: "URMO" },
    { id: "simferopol", name: "Симферополь", icao: "UKFF" },
    { id: "nizhny_novgorod", name: "Нижний Новгород", icao: "UWGG" },
    { id: "minsk", name: "Минск", icao: "UMMS" },
    { id: "samara", name: "Самара", icao: "UWWW" },
    { id: "platov", name: "Платов", icao: "URRR" },
    { id: "ufa", name: "Уфа", icao: "UWUU" },
    { id: "yekaterinburg", name: "Екатеринбург", icao: "USSS" },
    { id: "chelyabinsk", name: "Челябинск", icao: "USCC" },
    { id: "perm", name: "Пермь", icao: "USPP" },
    { id: "tyumen", name: "Тюмень", icao: "USTR" },
    { id: "omsk", name: "Омск", icao: "UNOO" },
    { id: "nizhnevartovsk", name: "Нижневартовск", icao: "USNN" },
    { id: "novosibirsk", name: "Новосибирск", icao: "UNNT" },
    { id: "kemerovo", name: "Кемерово", icao: "UNKM" },
    { id: "krasnoyarsk", name: "Красноярск", icao: "UNKL" },
    { id: "murmansk", name: "Мурманск", icao: "ULMM" },
    { id: "arkhangelsk", name: "Архангельск", icao: "ULAA" },
    { id: "kaliningrad", name: "Калининград", icao: "UMKK" },
    { id: "helsinki", name: "Хельсинки", icao: "EFHK" },
    { id: "vilnius", name: "Вильнюс", icao: "EYVI" },
    { id: "riga", name: "Рига", icao: "EVRA" },
    { id: "tallinn", name: "Таллин", icao: "EETN" },
    { id: "istanbul", name: "Стамбул", icao: "LTFM" },
    { id: "sacramento", name: "Sacramento", icao: "KSMF" },
    { id: "san_francisco", name: "San Francisco", icao: "KSFO" },
    { id: "monterey", name: "Monterey", icao: "KMRY" },
    { id: "san_diego", name: "San Diego", icao: "KSAN" },
    { id: "los_angeles", name: "Los Angeles", icao: "KLAX" },
    { id: "palm_springs", name: "Palm Springs", icao: "KPSP" },
    { id: "las_vegas", name: "Las Vegas", icao: "KLAS" },
    { id: "salt_lake_city", name: "Salt Lake City", icao: "KSLC" },
    { id: "denver", name: "Denver", icao: "KDEN" },
].map((entry) => ({
    ...entry,
    type: entry.type || "city",
    level: entry.level || "city",
    radiusKm: entry.radiusKm || DEFAULT_ZONE_RADIUS_KM,
}));

function buildZones() {
    return ZONE_DEFINITIONS.map((entry) => {
        if (entry.type === "moscow_region") {
            const points = (entry.icaos || [])
                .map((icao) => airportsByIcao.get(icao))
                .filter(Boolean);
            if (!points.length) return null;
            const lat =
                points.reduce((sum, airport) => sum + airport.lat, 0) / points.length;
            const lon =
                points.reduce((sum, airport) => sum + airport.lon, 0) / points.length;
            return {
                id: entry.id,
                name: entry.name,
                type: entry.type,
                level: entry.level,
                radiusKm: entry.radiusKm,
                lat,
                lon,
                parentId: entry.parentId || null,
            };
        }
        const airport = airportsByIcao.get(entry.icao);
        if (!airport) return null;
        return {
            id: entry.id,
            name: entry.name,
            type: entry.type,
            level: entry.level,
            radiusKm: entry.radiusKm,
            lat: airport.lat,
            lon: airport.lon,
            icao: airport.icao,
            parentId: entry.parentId || null,
        };
    }).filter(Boolean);
}

const zones = buildZones();
const zonesById = new Map(zones.map((zone) => [zone.id, zone]));

function seedFlightsIfEmpty() {
    const existing = readJson(flightsFile, []);
    if (existing.length > 0) return;

    const now = Date.now();
    const seeds = [
        { callsign: "AAL102", from: "KJFK", to: "KLAX", offset: -120, duration: 360, phase: "Крейсерский полёт" },
        { callsign: "BAW35", from: "EGLL", to: "KJFK", offset: -90, duration: 420, phase: "Крейсерский полёт" },
        { callsign: "DLH401", from: "EDDF", to: "KJFK", offset: -45, duration: 480, phase: "Набор высоты" },
        { callsign: "AFR22", from: "LFPG", to: "VHHH", offset: -30, duration: 720, phase: "Крейсерский полёт" },
        { callsign: "UAE202", from: "OMDB", to: "RJTT", offset: 30, duration: 540, phase: "Подготовка" },
        { callsign: "QTR17", from: "OTHH", to: "EGLL", offset: 60, duration: 420, phase: "Подготовка" },
        { callsign: "SIA25", from: "WSSS", to: "KLAX", offset: 15, duration: 900, phase: "Набор высоты" },
        { callsign: "JAL44", from: "RJAA", to: "KLAX", offset: -10, duration: 600, phase: "Крейсерский полёт" },
        { callsign: "ANA215", from: "RJTT", to: "RJAA", offset: 5, duration: 75, phase: "Подготовка" },
        { callsign: "KLM605", from: "EHAM", to: "LFPG", offset: -20, duration: 80, phase: "Снижение" },
    ];

    const flights = seeds
        .filter((seed) => airportsByIcao.has(seed.from) && airportsByIcao.has(seed.to))
        .map((seed) => {
            const departureUtc = now + seed.offset * 60 * 1000;
            const arrivalUtc = departureUtc + seed.duration * 60 * 1000;
            const speed = seed.phase === "Подготовка" ? 0 : 420;
            const altitude = seed.phase === "Подготовка" ? 0 : 33000;
            return {
                id: crypto.randomUUID(),
                callsign: seed.callsign,
                fromIcao: seed.from,
                toIcao: seed.to,
                departureUtc,
                arrivalUtc,
                phase: seed.phase,
                speed,
                altitude,
                awaitingAtc: seed.phase === "Подготовка",
                priority: "NORMAL",
                ownerId: null,
                ownerName: null,
                isLocked: false,
                lockedBy: null,
                transferPending: false,
                transferToUserId: null,
                transferRequestedAt: null,
                transferExpiresAt: null,
                createdAt: now,
            };
        });

    if (flights.length > 0) {
        writeJson(flightsFile, flights);
    }
}

function seedConflictFlightsIfMissing() {
    const now = Date.now();
    const flights = loadFlights();
    const seeds = [
        {
            callsign: "CNF101",
            from: "EGLL",
            to: "EDDF",
            offset: -20,
            duration: 90,
            phase: "Крейсерский полёт",
        },
        {
            callsign: "CNF202",
            from: "EHAM",
            to: "LFPG",
            offset: -18,
            duration: 95,
            phase: "Крейсерский полёт",
        },
        {
            callsign: "CNF303",
            from: "EDDF",
            to: "EGLL",
            offset: -15,
            duration: 85,
            phase: "Крейсерский полёт",
        },
    ];

    let changed = false;
    for (const seed of seeds) {
        if (flights.some((flight) => flight.callsign === seed.callsign)) continue;
        if (!airportsByIcao.has(seed.from) || !airportsByIcao.has(seed.to)) continue;
        const departureUtc = now + seed.offset * 60 * 1000;
        const arrivalUtc = departureUtc + seed.duration * 60 * 1000;
        flights.push({
            id: crypto.randomUUID(),
            callsign: seed.callsign,
            fromIcao: seed.from,
            toIcao: seed.to,
            departureUtc,
            arrivalUtc,
            phase: seed.phase,
            speed: 430,
            altitude: 35000,
            awaitingAtc: false,
            priority: "NORMAL",
            ownerId: null,
            ownerName: null,
            isLocked: false,
            lockedBy: null,
            transferPending: false,
            transferToUserId: null,
            transferRequestedAt: null,
            transferExpiresAt: null,
            createdAt: now,
        });
        changed = true;
    }

    if (changed) {
        saveFlights(flights);
    }
}

function hashPin(pin) {
    return crypto.createHash("sha256").update(String(pin)).digest("hex");
}

function parseMskDateTime(value) {
    if (typeof value !== "string") return null;
    const cleaned = value.trim().replace("T", " ");
    let match = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/);
    if (match) {
        const [, year, month, day, hour, minute] = match;
        return Date.UTC(
            Number(year),
            Number(month) - 1,
            Number(day),
            Number(hour) - 3,
            Number(minute)
        );
    }
    match = cleaned.match(/^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})$/);
    if (match) {
        const [, day, month, year, hour, minute] = match;
        return Date.UTC(
            Number(year),
            Number(month) - 1,
            Number(day),
            Number(hour) - 3,
            Number(minute)
        );
    }
    return null;
}

function formatMsk(timestamp) {
    if (!Number.isFinite(timestamp)) return null;
    const date = new Date(timestamp + MSK_OFFSET_MINUTES * 60 * 1000);
    return date.toISOString().slice(0, 16).replace("T", " ");
}

function getStatus(flight, now = Date.now()) {
    if (now < flight.departureUtc) return "scheduled";
    if (now >= flight.arrivalUtc) return "completed";
    return "active";
}

function normalizeCallsign(value) {
    return String(value || "").trim().toUpperCase();
}

function normalizeIcao(value) {
    return String(value || "").trim().toUpperCase();
}

function normalizePriority(value) {
    const normalized = String(value || "").trim().toUpperCase();
    return PRIORITIES.includes(normalized) ? normalized : "NORMAL";
}

function toRadians(value) {
    return (value * Math.PI) / 180;
}

function toDegrees(value) {
    return (value * 180) / Math.PI;
}

function haversineDistance(a, b) {
    const lat1 = toRadians(a[0]);
    const lon1 = toRadians(a[1]);
    const lat2 = toRadians(b[0]);
    const lon2 = toRadians(b[1]);
    const dLat = lat2 - lat1;
    const dLon = lon2 - lon1;
    const sinDLat = Math.sin(dLat / 2);
    const sinDLon = Math.sin(dLon / 2);
    const h =
        sinDLat * sinDLat +
        Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
    return 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function distanceKm(a, b) {
    return haversineDistance(a, b) * 6371;
}

function interpolateGreatCircle(origin, destination, progress) {
    const lat1 = toRadians(origin.lat);
    const lon1 = toRadians(origin.lon);
    const lat2 = toRadians(destination.lat);
    const lon2 = toRadians(destination.lon);
    const delta = haversineDistance([origin.lat, origin.lon], [destination.lat, destination.lon]);
    if (!delta || Number.isNaN(delta)) {
        return [origin.lat, origin.lon];
    }
    const sinDelta = Math.sin(delta);
    const t = Math.min(1, Math.max(0, progress));
    const a = Math.sin((1 - t) * delta) / sinDelta;
    const b = Math.sin(t * delta) / sinDelta;
    const x = a * Math.cos(lat1) * Math.cos(lon1) + b * Math.cos(lat2) * Math.cos(lon2);
    const y = a * Math.cos(lat1) * Math.sin(lon1) + b * Math.cos(lat2) * Math.sin(lon2);
    const z = a * Math.sin(lat1) + b * Math.sin(lat2);
    const lat = Math.atan2(z, Math.sqrt(x * x + y * y));
    const lon = Math.atan2(y, x);
    return [toDegrees(lat), toDegrees(lon)];
}

function isAdmin(user) {
    return user && user.role === "admin";
}

function listZones() {
    return zones.map((zone) => {
        const assignment = zoneAssignments.get(zone.id);
        return {
            ...zone,
            occupied: Boolean(assignment),
            dispatcher: assignment
                ? {
                      id: assignment.userId,
                      username: assignment.username,
                      role: assignment.role,
                  }
                : null,
        };
    });
}

function findZoneAssignmentByUser(userId) {
    for (const [zoneId, assignment] of zoneAssignments.entries()) {
        if (assignment.userId === userId) {
            return { zoneId, assignment };
        }
    }
    return null;
}

function validateZoneSelection(zoneId, userId) {
    const zone = zonesById.get(zoneId);
    if (!zone) return { error: "invalid_zone" };
    const existing = zoneAssignments.get(zoneId);
    if (existing && existing.userId !== userId) {
        return { error: "zone_busy" };
    }
    const current = userId ? findZoneAssignmentByUser(userId) : null;
    if (current && current.zoneId !== zoneId) {
        return { error: "zone_busy" };
    }
    return { zone };
}

function assignZoneToUser(zone, user) {
    zoneAssignments.set(zone.id, {
        userId: user.id,
        username: user.username,
        role: user.role || "dispatcher",
        assignedAt: Date.now(),
    });
}

function releaseZoneForUser(zoneId, userId) {
    if (!zoneId) return;
    const existing = zoneAssignments.get(zoneId);
    if (existing && existing.userId === userId) {
        zoneAssignments.delete(zoneId);
    }
}

function releaseAllZonesForUser(userId) {
    for (const [zoneId, assignment] of zoneAssignments.entries()) {
        if (assignment.userId === userId) {
            zoneAssignments.delete(zoneId);
        }
    }
}

function isPositionInZone(position, zone) {
    if (!position || !zone) return false;
    return distanceKm(position, [zone.lat, zone.lon]) <= zone.radiusKm;
}

function getFlightPosition(flight, now) {
    const origin = airportsByIcao.get(flight.fromIcao);
    const destination = airportsByIcao.get(flight.toIcao);
    if (!origin || !destination) return null;
    const status = getStatus(flight, now);
    if (status === "scheduled") return [origin.lat, origin.lon];
    if (status === "completed") return [destination.lat, destination.lon];
    const progress = Math.min(
        1,
        Math.max(0, (now - flight.departureUtc) / (flight.arrivalUtc - flight.departureUtc))
    );
    return interpolateGreatCircle(origin, destination, progress);
}

function canUserManageFlight(user, flight, now) {
    if (isAdmin(user)) return true;
    if (!user?.zoneId) return false;
    const zone = zonesById.get(user.zoneId);
    if (!zone) return false;
    const position = getFlightPosition(flight, now);
    if (!position) return false;
    if (!isPositionInZone(position, zone)) return false;
    if (zone.id === MOSCOW_REGION_ID) {
        const airportZones = zones.filter((item) => item.parentId === MOSCOW_REGION_ID);
        const occupiedAirport = airportZones.find(
            (item) =>
                zoneAssignments.get(item.id) && isPositionInZone(position, item)
        );
        if (occupiedAirport) {
            return false;
        }
    }
    return true;
}

function clearExpiredTransfer(flight, now) {
    if (
        flight.transferPending &&
        Number.isFinite(flight.transferExpiresAt) &&
        now >= flight.transferExpiresAt
    ) {
        return {
            ...flight,
            transferPending: false,
            transferToUserId: null,
            transferRequestedAt: null,
            transferExpiresAt: null,
        };
    }
    return flight;
}

function buildFlightResponse(flight, now = Date.now()) {
    const origin = airportsByIcao.get(flight.fromIcao);
    const destination = airportsByIcao.get(flight.toIcao);
    const status = getStatus(flight, now);
    const progress = Math.min(
        1,
        Math.max(0, (now - flight.departureUtc) / (flight.arrivalUtc - flight.departureUtc))
    );

    return {
        ...flight,
        phase: flight.phase || FLIGHT_PHASES[0],
        speed: Number.isFinite(flight.speed) ? flight.speed : null,
        altitude: Number.isFinite(flight.altitude) ? flight.altitude : null,
        awaitingAtc: Boolean(flight.awaitingAtc),
        priority: normalizePriority(flight.priority),
        ownerId: flight.ownerId || null,
        ownerName: flight.ownerName || null,
        isLocked: Boolean(flight.isLocked),
        lockedBy: flight.lockedBy || null,
        transferPending: Boolean(flight.transferPending),
        transferToUserId: flight.transferToUserId || null,
        transferRequestedAt: flight.transferRequestedAt || null,
        transferExpiresAt: flight.transferExpiresAt || null,
        status,
        departureMsk: formatMsk(flight.departureUtc),
        arrivalMsk: formatMsk(flight.arrivalUtc),
        progress,
        origin,
        destination,
    };
}

function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const session = token ? sessions.get(token) : null;
    if (!session) {
        res.status(401).json({ error: "unauthorized" });
        return;
    }
    if (!isAdmin(session) && session.zoneId) {
        const assignment = zoneAssignments.get(session.zoneId);
        if (!assignment || assignment.userId !== session.id) {
            res.status(403).json({ error: "zone_forbidden" });
            return;
        }
    }
    req.user = session;
    next();
}

function requireAdmin(req, res, next) {
    if (!isAdmin(req.user)) {
        res.status(403).json({ error: "forbidden" });
        return;
    }
    next();
}

function loadFlights() {
    return readJson(flightsFile, []);
}

function saveFlights(flights) {
    writeJson(flightsFile, flights);
}

function loadUsers() {
    const users = readJson(usersFile, []);
    return users.map((user) => ({
        ...user,
        role: user.role || "dispatcher",
    }));
}

function saveUsers(users) {
    writeJson(usersFile, users);
}

function ensureAdminAccount() {
    const adminUsername = process.env.ADMIN_USERNAME || "admin";
    const adminPin = process.env.ADMIN_PIN || "0000";
    const users = loadUsers();

    if (users.some((user) => user.role === "admin")) {
        return;
    }

    const existing = users.find(
        (user) => user.username.toLowerCase() === adminUsername.toLowerCase()
    );
    if (existing) {
        existing.role = "admin";
        saveUsers(users);
        appendLog({
            timestamp: Date.now(),
            actorId: null,
            actorName: "system",
            actorRole: "system",
            actionType: "admin_promote",
            entityType: "user",
            entityId: existing.id,
            summary: `Пользователь ${existing.username} назначен админом`,
        });
        return;
    }

    const adminUser = {
        id: crypto.randomUUID(),
        username: adminUsername,
        pinHash: hashPin(adminPin),
        role: "admin",
        createdAt: Date.now(),
    };
    users.push(adminUser);
    saveUsers(users);
    appendLog({
        timestamp: Date.now(),
        actorId: null,
        actorName: "system",
        actorRole: "system",
        actionType: "admin_create",
        entityType: "user",
        entityId: adminUser.id,
        summary: `Создан админ ${adminUser.username}`,
    });
}

function isCallsignTaken(callsign, flights, now, ignoreId) {
    return flights.some((flight) => {
        if (ignoreId && flight.id === ignoreId) return false;
        if (getStatus(flight, now) === "completed") return false;
        return flight.callsign === callsign;
    });
}

seedFlightsIfEmpty();
ensureAdminAccount();
seedConflictFlightsIfMissing();

app.get("/health", (req, res) => {
    res.json({ ok: true });
});

app.get("/zones", (req, res) => {
    res.json(listZones());
});

app.post("/auth/register", (req, res) => {
    const username = String(req.body.username || "").trim();
    const pin = String(req.body.pin || "").trim();
    const zoneId = String(req.body.zoneId || "").trim();

    if (username.length < 3 || pin.length < 4) {
        res.status(400).json({ error: "invalid_credentials" });
        return;
    }
    if (!zoneId) {
        res.status(400).json({ error: "zone_required" });
        return;
    }
    const zoneCheck = validateZoneSelection(zoneId);
    if (zoneCheck.error) {
        res.status(zoneCheck.error === "zone_busy" ? 409 : 400).json({ error: zoneCheck.error });
        return;
    }

    const users = loadUsers();
    const exists = users.some((user) => user.username.toLowerCase() === username.toLowerCase());
    if (exists) {
        res.status(409).json({ error: "user_exists" });
        return;
    }

    users.push({
        id: crypto.randomUUID(),
        username,
        pinHash: hashPin(pin),
        role: "dispatcher",
        createdAt: Date.now(),
    });
    saveUsers(users);

    appendLog({
        timestamp: Date.now(),
        actorId: null,
        actorName: username,
        actorRole: "dispatcher",
        actionType: "register",
        entityType: "user",
        entityId: users[users.length - 1].id,
        summary: `Создан аккаунт ${username}`,
    });

    res.json({ ok: true });
});

app.post("/auth/login", (req, res) => {
    const username = String(req.body.username || "").trim();
    const pin = String(req.body.pin || "").trim();
    const zoneId = String(req.body.zoneId || "").trim();

    const users = loadUsers();
    const user = users.find((item) => item.username.toLowerCase() === username.toLowerCase());
    if (!user || user.pinHash !== hashPin(pin)) {
        res.status(401).json({ error: "invalid_login" });
        return;
    }
    if (!isAdmin(user)) {
        if (!zoneId) {
            res.status(400).json({ error: "zone_required" });
            return;
        }
        const zoneCheck = validateZoneSelection(zoneId, user.id);
        if (zoneCheck.error) {
            res.status(zoneCheck.error === "zone_busy" ? 409 : 400).json({ error: zoneCheck.error });
            return;
        }
        assignZoneToUser(zoneCheck.zone, user);
    }

    const token = crypto.randomUUID();
    const zone = zoneId ? zonesById.get(zoneId) : null;
    sessions.set(token, {
        id: user.id,
        username: user.username,
        role: user.role || "dispatcher",
        zoneId: zone?.id || null,
        zoneName: zone?.name || null,
        zoneType: zone?.type || null,
        createdAt: Date.now(),
    });
    appendLog({
        timestamp: Date.now(),
        actorId: user.id,
        actorName: user.username,
        actorRole: user.role || "dispatcher",
        actionType: "login",
        entityType: "user",
        entityId: user.id,
        summary: `${user.username} вошел в систему`,
    });
    res.json({
        token,
        id: user.id,
        username: user.username,
        role: user.role || "dispatcher",
        zoneId: zone?.id || null,
        zoneName: zone?.name || null,
        zoneType: zone?.type || null,
    });
});

app.get("/auth/me", requireAuth, (req, res) => {
    res.json({
        id: req.user.id,
        username: req.user.username,
        role: req.user.role || "dispatcher",
        zoneId: req.user.zoneId || null,
        zoneName: req.user.zoneName || null,
        zoneType: req.user.zoneType || null,
    });
});

app.post("/auth/logout", requireAuth, (req, res) => {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (token) {
        sessions.delete(token);
    }
    releaseZoneForUser(req.user.zoneId, req.user.id);
    appendLog({
        timestamp: Date.now(),
        actorId: req.user.id,
        actorName: req.user.username,
        actorRole: req.user.role || "dispatcher",
        actionType: "logout",
        entityType: "user",
        entityId: req.user.id,
        summary: `${req.user.username} вышел из системы`,
    });
    res.json({ ok: true });
});

app.get("/airports/search", (req, res) => {
    const query = String(req.query.q || "").trim().toLowerCase();
    if (query.length < 2) {
        res.json([]);
        return;
    }

    const matches = [];

    for (const airport of airports) {
        const icao = airport.icao.toLowerCase();
        const iata = airport.iata.toLowerCase();
        const name = airport.name.toLowerCase();
        const city = airport.city.toLowerCase();

        let score = null;
        if (icao === query || (iata && iata === query)) score = 0;
        else if (icao.startsWith(query) || (iata && iata.startsWith(query))) score = 1;
        else if (name.startsWith(query) || city.startsWith(query)) score = 2;
        else if (icao.includes(query) || (iata && iata.includes(query))) score = 3;
        else if (name.includes(query) || city.includes(query)) score = 4;

        if (score !== null) {
            matches.push({ airport, score });
        }
    }

    matches.sort((a, b) => {
        if (a.score !== b.score) return a.score - b.score;
        return a.airport.icao.localeCompare(b.airport.icao);
    });

    res.json(matches.slice(0, 8).map((item) => item.airport));
});

app.get("/flights", (req, res) => {
    const now = Date.now();
    const flights = loadFlights();
    const refreshed = flights.map((flight) => clearExpiredTransfer(flight, now));
    if (JSON.stringify(flights) !== JSON.stringify(refreshed)) {
        saveFlights(refreshed);
    }
    res.json(refreshed.map((flight) => buildFlightResponse(flight, now)));
});

app.post("/flights", requireAuth, (req, res) => {
    const now = Date.now();
    const callsign = normalizeCallsign(req.body.callsign);
    const fromIcao = normalizeIcao(req.body.fromIcao);
    const toIcao = normalizeIcao(req.body.toIcao);
    const departureUtc = parseMskDateTime(req.body.departureMsk);
    const arrivalUtc = parseMskDateTime(req.body.arrivalMsk);
    const phase = String(req.body.phase || FLIGHT_PHASES[0]);
    const speed = Number.isFinite(Number(req.body.speed)) ? Number(req.body.speed) : null;
    const altitude = Number.isFinite(Number(req.body.altitude)) ? Number(req.body.altitude) : null;
    const awaitingAtc = Boolean(req.body.awaitingAtc);
    const priority = normalizePriority(req.body.priority);

    if (!callsign || callsign.length < 3) {
        res.status(400).json({ error: "invalid_callsign" });
        return;
    }
    if (!fromIcao || !toIcao || fromIcao === toIcao) {
        res.status(400).json({ error: "invalid_route" });
        return;
    }
    if (!airportsByIcao.has(fromIcao) || !airportsByIcao.has(toIcao)) {
        res.status(400).json({ error: "unknown_airport" });
        return;
    }
    if (!Number.isFinite(departureUtc) || !Number.isFinite(arrivalUtc) || arrivalUtc <= departureUtc) {
        res.status(400).json({ error: "invalid_schedule" });
        return;
    }

    const flights = loadFlights();
    if (isCallsignTaken(callsign, flights, now)) {
        res.status(409).json({ error: "callsign_taken" });
        return;
    }

    const flight = {
        id: crypto.randomUUID(),
        callsign,
        fromIcao,
        toIcao,
        departureUtc,
        arrivalUtc,
        phase: FLIGHT_PHASES.includes(phase) ? phase : FLIGHT_PHASES[0],
        speed,
        altitude,
        awaitingAtc,
        priority,
        ownerId: req.user.id,
        ownerName: req.user.username,
        isLocked: false,
        lockedBy: null,
        transferPending: false,
        transferToUserId: null,
        transferRequestedAt: null,
        transferExpiresAt: null,
        createdAt: now,
    };

    flights.push(flight);
    saveFlights(flights);

    appendLog({
        timestamp: now,
        actorId: req.user.id,
        actorName: req.user.username,
        actorRole: req.user.role || "dispatcher",
        actionType: "flight_create",
        entityType: "flight",
        entityId: flight.id,
        summary: `Создан рейс ${flight.callsign} (${flight.fromIcao} → ${flight.toIcao})`,
    });

    res.status(201).json(buildFlightResponse(flight, now));
});

app.put("/flights/:id", requireAuth, (req, res) => {
    const now = Date.now();
    const flights = loadFlights();
    const flightIndex = flights.findIndex((flight) => flight.id === req.params.id);
    if (flightIndex === -1) {
        res.status(404).json({ error: "not_found" });
        return;
    }

    const currentFlight = clearExpiredTransfer(flights[flightIndex], now);
    flights[flightIndex] = currentFlight;

    if (currentFlight.transferPending && !isAdmin(req.user)) {
        res.status(409).json({ error: "transfer_pending" });
        return;
    }
    if (currentFlight.isLocked && !isAdmin(req.user)) {
        res.status(423).json({ error: "locked" });
        return;
    }
    if (!canUserManageFlight(req.user, currentFlight, now)) {
        res.status(403).json({ error: "zone_forbidden" });
        return;
    }

    const callsign = normalizeCallsign(req.body.callsign);
    const fromIcao = normalizeIcao(req.body.fromIcao);
    const toIcao = normalizeIcao(req.body.toIcao);
    const departureUtc = parseMskDateTime(req.body.departureMsk);
    const arrivalUtc = parseMskDateTime(req.body.arrivalMsk);
    const phase = String(req.body.phase || currentFlight.phase || FLIGHT_PHASES[0]);
    const speed = Number.isFinite(Number(req.body.speed))
        ? Number(req.body.speed)
        : currentFlight.speed ?? null;
    const altitude = Number.isFinite(Number(req.body.altitude))
        ? Number(req.body.altitude)
        : currentFlight.altitude ?? null;
    const awaitingAtc = req.body.awaitingAtc !== undefined
        ? Boolean(req.body.awaitingAtc)
        : Boolean(currentFlight.awaitingAtc);
    const priority = req.body.priority !== undefined
        ? normalizePriority(req.body.priority)
        : normalizePriority(currentFlight.priority);

    if (!callsign || callsign.length < 3) {
        res.status(400).json({ error: "invalid_callsign" });
        return;
    }
    if (!fromIcao || !toIcao || fromIcao === toIcao) {
        res.status(400).json({ error: "invalid_route" });
        return;
    }
    if (!airportsByIcao.has(fromIcao) || !airportsByIcao.has(toIcao)) {
        res.status(400).json({ error: "unknown_airport" });
        return;
    }
    if (!Number.isFinite(departureUtc) || !Number.isFinite(arrivalUtc) || arrivalUtc <= departureUtc) {
        res.status(400).json({ error: "invalid_schedule" });
        return;
    }
    if (isCallsignTaken(callsign, flights, now, req.params.id)) {
        res.status(409).json({ error: "callsign_taken" });
        return;
    }

    const ownerId = currentFlight.ownerId || (isAdmin(req.user) ? null : req.user.id);
    const ownerName = currentFlight.ownerName || (isAdmin(req.user) ? null : req.user.username);

    flights[flightIndex] = {
        ...currentFlight,
        callsign,
        fromIcao,
        toIcao,
        departureUtc,
        arrivalUtc,
        phase: FLIGHT_PHASES.includes(phase) ? phase : flights[flightIndex].phase,
        speed,
        altitude,
        awaitingAtc,
        priority,
        ownerId,
        ownerName,
    };

    saveFlights(flights);
    appendLog({
        timestamp: now,
        actorId: req.user.id,
        actorName: req.user.username,
        actorRole: req.user.role || "dispatcher",
        actionType: "flight_update",
        entityType: "flight",
        entityId: flights[flightIndex].id,
        summary: `Обновлен рейс ${callsign}`,
        diff: {
            fromIcao,
            toIcao,
            departureUtc,
            arrivalUtc,
            phase: flights[flightIndex].phase,
            speed,
            altitude,
            priority,
            awaitingAtc,
        },
    });
    res.json(buildFlightResponse(flights[flightIndex], now));
});

app.delete("/flights/:id", requireAuth, (req, res) => {
    const now = Date.now();
    const flights = loadFlights();
    const flightIndex = flights.findIndex((flight) => flight.id === req.params.id);
    if (flightIndex === -1) {
        res.status(404).json({ error: "not_found" });
        return;
    }

    const currentFlight = clearExpiredTransfer(flights[flightIndex], now);
    if (currentFlight.transferPending && !isAdmin(req.user)) {
        res.status(409).json({ error: "transfer_pending" });
        return;
    }
    if (currentFlight.isLocked && !isAdmin(req.user)) {
        res.status(423).json({ error: "locked" });
        return;
    }
    if (!canUserManageFlight(req.user, currentFlight, now)) {
        res.status(403).json({ error: "zone_forbidden" });
        return;
    }

    const nextFlights = flights.filter((flight) => flight.id !== req.params.id);
    saveFlights(nextFlights);
    appendLog({
        timestamp: now,
        actorId: req.user.id,
        actorName: req.user.username,
        actorRole: req.user.role || "dispatcher",
        actionType: "flight_delete",
        entityType: "flight",
        entityId: currentFlight.id,
        summary: `Удален рейс ${currentFlight.callsign}`,
    });
    res.json({ ok: true });
});

app.post("/flights/:id/transfer", requireAuth, (req, res) => {
    const now = Date.now();
    const toUserId = String(req.body.toUserId || "").trim();
    if (!toUserId) {
        res.status(400).json({ error: "invalid_target" });
        return;
    }

    const users = loadUsers();
    const targetUser = users.find((user) => user.id === toUserId);
    if (!targetUser) {
        res.status(404).json({ error: "user_not_found" });
        return;
    }
    if (toUserId === req.user.id) {
        res.status(400).json({ error: "invalid_target" });
        return;
    }

    const onlineIds = new Set([...sessions.values()].map((session) => session.id));
    if (!onlineIds.has(toUserId)) {
        res.status(409).json({ error: "user_offline" });
        return;
    }

    const flights = loadFlights();
    const flightIndex = flights.findIndex((flight) => flight.id === req.params.id);
    if (flightIndex === -1) {
        res.status(404).json({ error: "not_found" });
        return;
    }
    const currentFlight = clearExpiredTransfer(flights[flightIndex], now);
    if (currentFlight.transferPending) {
        res.status(409).json({ error: "transfer_pending" });
        return;
    }
    if (currentFlight.isLocked && !isAdmin(req.user)) {
        res.status(423).json({ error: "locked" });
        return;
    }
    if (!canUserManageFlight(req.user, currentFlight, now)) {
        res.status(403).json({ error: "zone_forbidden" });
        return;
    }

    const updatedFlight = {
        ...currentFlight,
        transferPending: true,
        transferToUserId: toUserId,
        transferRequestedAt: now,
        transferExpiresAt: now + 15000,
    };
    flights[flightIndex] = updatedFlight;
    saveFlights(flights);

    appendLog({
        timestamp: now,
        actorId: req.user.id,
        actorName: req.user.username,
        actorRole: req.user.role || "dispatcher",
        actionType: "transfer_request",
        entityType: "flight",
        entityId: currentFlight.id,
        summary: `Запрос передачи ${currentFlight.callsign} → ${targetUser.username}`,
        diff: { toUserId, toUserName: targetUser.username },
    });

    res.json(buildFlightResponse(updatedFlight, now));
});

app.get("/transfers/pending", requireAuth, (req, res) => {
    const now = Date.now();
    const flights = loadFlights();
    let changed = false;
    const pending = [];

    for (let i = 0; i < flights.length; i += 1) {
        const refreshed = clearExpiredTransfer(flights[i], now);
        if (refreshed !== flights[i]) {
            flights[i] = refreshed;
            changed = true;
        }
        if (refreshed.transferPending && refreshed.transferToUserId === req.user.id) {
            pending.push(buildFlightResponse(refreshed, now));
        }
    }

    if (changed) {
        saveFlights(flights);
    }

    res.json(pending);
});

app.post("/flights/:id/transfer/accept", requireAuth, (req, res) => {
    const now = Date.now();
    const flights = loadFlights();
    const flightIndex = flights.findIndex((flight) => flight.id === req.params.id);
    if (flightIndex === -1) {
        res.status(404).json({ error: "not_found" });
        return;
    }
    const currentFlight = clearExpiredTransfer(flights[flightIndex], now);
    if (!currentFlight.transferPending || currentFlight.transferToUserId !== req.user.id) {
        res.status(409).json({ error: "transfer_not_found" });
        return;
    }

    const updatedFlight = {
        ...currentFlight,
        ownerId: req.user.id,
        ownerName: req.user.username,
        transferPending: false,
        transferToUserId: null,
        transferRequestedAt: null,
        transferExpiresAt: null,
    };
    flights[flightIndex] = updatedFlight;
    saveFlights(flights);

    appendLog({
        timestamp: now,
        actorId: req.user.id,
        actorName: req.user.username,
        actorRole: req.user.role || "dispatcher",
        actionType: "transfer_accept",
        entityType: "flight",
        entityId: currentFlight.id,
        summary: `Принят рейс ${currentFlight.callsign}`,
    });

    res.json(buildFlightResponse(updatedFlight, now));
});

app.post("/flights/:id/transfer/decline", requireAuth, (req, res) => {
    const now = Date.now();
    const flights = loadFlights();
    const flightIndex = flights.findIndex((flight) => flight.id === req.params.id);
    if (flightIndex === -1) {
        res.status(404).json({ error: "not_found" });
        return;
    }
    const currentFlight = clearExpiredTransfer(flights[flightIndex], now);
    if (!currentFlight.transferPending || currentFlight.transferToUserId !== req.user.id) {
        res.status(409).json({ error: "transfer_not_found" });
        return;
    }

    const updatedFlight = {
        ...currentFlight,
        transferPending: false,
        transferToUserId: null,
        transferRequestedAt: null,
        transferExpiresAt: null,
    };
    flights[flightIndex] = updatedFlight;
    saveFlights(flights);

    appendLog({
        timestamp: now,
        actorId: req.user.id,
        actorName: req.user.username,
        actorRole: req.user.role || "dispatcher",
        actionType: "transfer_decline",
        entityType: "flight",
        entityId: currentFlight.id,
        summary: `Отказ от рейса ${currentFlight.callsign}`,
    });

    res.json(buildFlightResponse(updatedFlight, now));
});

app.post("/flights/:id/lock", requireAuth, requireAdmin, (req, res) => {
    const now = Date.now();
    const flights = loadFlights();
    const flightIndex = flights.findIndex((flight) => flight.id === req.params.id);
    if (flightIndex === -1) {
        res.status(404).json({ error: "not_found" });
        return;
    }

    const locked = Boolean(req.body.locked);
    flights[flightIndex] = {
        ...flights[flightIndex],
        isLocked: locked,
        lockedBy: locked ? req.user.username : null,
    };
    saveFlights(flights);

    appendLog({
        timestamp: now,
        actorId: req.user.id,
        actorName: req.user.username,
        actorRole: req.user.role || "dispatcher",
        actionType: locked ? "flight_lock" : "flight_unlock",
        entityType: "flight",
        entityId: flights[flightIndex].id,
        summary: `${locked ? "Заблокирован" : "Разблокирован"} рейс ${flights[flightIndex].callsign}`,
    });

    res.json(buildFlightResponse(flights[flightIndex], now));
});

app.get("/dispatchers", requireAuth, requireAdmin, (req, res) => {
    const users = loadUsers();
    const flights = loadFlights();
    const onlineIds = new Set([...sessions.values()].map((session) => session.id));
    const list = users
        .filter((user) => user.role !== "admin")
        .map((user) => ({
            id: user.id,
            username: user.username,
            role: user.role || "dispatcher",
            online: onlineIds.has(user.id),
            activeFlights: flights.filter((flight) => flight.ownerId === user.id).length,
        }));
    res.json(list);
});

app.get("/dispatchers/online", requireAuth, (req, res) => {
    const users = loadUsers();
    const onlineIds = new Set([...sessions.values()].map((session) => session.id));
    const list = users
        .filter((user) => user.role !== "admin")
        .filter((user) => onlineIds.has(user.id))
        .filter((user) => user.id !== req.user.id)
        .map((user) => ({
            id: user.id,
            username: user.username,
            role: user.role || "dispatcher",
        }));
    res.json(list);
});

app.delete("/dispatchers/:id", requireAuth, requireAdmin, (req, res) => {
    const targetId = req.params.id;
    const users = loadUsers();
    const targetIndex = users.findIndex((user) => user.id === targetId);
    if (targetIndex === -1) {
        res.status(404).json({ error: "user_not_found" });
        return;
    }

    const removed = users.splice(targetIndex, 1)[0];
    saveUsers(users);

    for (const [token, session] of sessions.entries()) {
        if (session.id === targetId) {
            sessions.delete(token);
        }
    }
    releaseAllZonesForUser(targetId);

    const flights = loadFlights();
    const updatedFlights = flights.map((flight) => {
        if (flight.ownerId === targetId) {
            return { ...flight, ownerId: null, ownerName: null };
        }
        return flight;
    });
    saveFlights(updatedFlights);

    appendLog({
        timestamp: Date.now(),
        actorId: req.user.id,
        actorName: req.user.username,
        actorRole: req.user.role || "dispatcher",
        actionType: "dispatcher_delete",
        entityType: "user",
        entityId: removed.id,
        summary: `Удален аккаунт ${removed.username}`,
    });

    res.json({ ok: true });
});

app.get("/logs", requireAuth, requireAdmin, (req, res) => {
    const logs = readJson(logsFile, []);
    res.json(logs);
});

app.post("/logs/events", requireAuth, (req, res) => {
    const actionType = String(req.body.actionType || "event");
    const entityType = String(req.body.entityType || "system");
    const entityId = req.body.entityId || null;
    const summary = String(req.body.summary || "Событие");
    appendLog({
        timestamp: Date.now(),
        actorId: req.user.id,
        actorName: req.user.username,
        actorRole: req.user.role || "dispatcher",
        actionType,
        entityType,
        entityId,
        summary,
    });
    res.json({ ok: true });
});

app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
});

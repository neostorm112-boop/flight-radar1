import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import {
    Circle,
    CircleMarker,
    MapContainer,
    Marker,
    Polyline,
    TileLayer,
    Tooltip,
    useMap,
    useMapEvent,
} from "react-leaflet";
import { Routes, Route, useLocation, useNavigate } from "react-router-dom";
import "./App.css";

function loadLS(key, fallback) {
    try {
        const v = localStorage.getItem(key);
        return v === null ? fallback : JSON.parse(v);
    } catch {
        return fallback;
    }
}
function saveLS(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // Ignore storage failures (private mode, quota, etc.).
    }
}

const API_BASE = import.meta.env.VITE_API_BASE || "";
const MSK_OFFSET_MINUTES = 180;
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

const planeIconCache = new Map();
const zoneTowerCache = new Map();

function getPlaneIcon(heading = 0) {
    const rounded = Math.round(heading / 5) * 5;
    if (planeIconCache.has(rounded)) {
        return planeIconCache.get(rounded);
    }
    const icon = L.divIcon({
        className: "pilot-plane-icon",
        html: `<span class="radar-plane" style="transform: rotate(${rounded}deg);">
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M2 13l20-6-4 6 4 6-20-6z" />
  </svg>
</span>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
    });
    planeIconCache.set(rounded, icon);
    return icon;
}

function getZoneTowerIcon(size, color) {
    const key = `${size}-${color}`;
    if (zoneTowerCache.has(key)) {
        return zoneTowerCache.get(key);
    }
    const icon = L.divIcon({
        className: "zone-tower-icon",
        html: `<span style="display:inline-flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:999px;background:rgba(10,14,24,0.75);border:1px solid rgba(255,255,255,0.15);">
  <svg viewBox="0 0 24 24" width="${Math.round(size * 0.7)}" height="${Math.round(size * 0.7)}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M6 20h12" />
    <path d="M8 20V10l4-4 4 4v10" />
    <path d="M9 10h6" />
    <circle cx="12" cy="6" r="2" fill="${color}" stroke="none" />
  </svg>
</span>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
    });
    zoneTowerCache.set(key, icon);
    return icon;
}

const mapLabelIcon = (label) =>
    L.divIcon({
        className: "map-route-label",
        html: `<span>${label}</span>`,
        iconSize: [28, 18],
        iconAnchor: [14, 9],
    });

function formatMsk(timestamp) {
    if (!Number.isFinite(timestamp)) return "";
    const date = new Date(timestamp + MSK_OFFSET_MINUTES * 60 * 1000);
    return date.toISOString().slice(0, 16).replace("T", " ");
}

function computeStatus(flight, now) {
    if (now < flight.departureUtc) return "scheduled";
    if (now >= flight.arrivalUtc) return "completed";
    return "active";
}

function computeProgress(flight, now) {
    if (now <= flight.departureUtc) return 0;
    if (now >= flight.arrivalUtc) return 1;
    return (now - flight.departureUtc) / (flight.arrivalUtc - flight.departureUtc);
}

function mapEngineModeToStatus(mode) {
    if (mode === "COMPLETED") return "completed";
    if (mode === "SCHEDULED") return "scheduled";
    return "active";
}

function getPilotMetrics(flight) {
    if (!flight) return { phase: "—", altitude: "—", speed: "—" };
    const phase = flight.phase || formatStatusLabel(flight.status);
    const altitudeValue = Number.isFinite(flight.displayAltitude)
        ? flight.displayAltitude
        : flight.altitude;
    const speedValue = Number.isFinite(flight.displaySpeed)
        ? flight.displaySpeed
        : flight.speed;
    const altitude = Number.isFinite(altitudeValue) ? `${altitudeValue} ft` : "—";
    const speed = Number.isFinite(speedValue) ? `${speedValue} kt` : "—";
    return { phase, altitude, speed };
}

function formatStatusLabel(status) {
    if (status === "scheduled") return "Ожидает";
    if (status === "active") return "В пути";
    if (status === "completed") return "Завершен";
    return status || "—";
}

function getPhaseBadgeColor(phase) {
    if (!phase) return "rgba(120, 140, 180, 0.8)";
    if (phase === "Взлёт" || phase === "Посадка") return "rgba(255, 112, 112, 0.9)";
    if (
        phase === "Руление" ||
        phase === "Набор высоты" ||
        phase === "Снижение" ||
        phase === "Выталкивание (Pushback)" ||
        phase === "Ожидание на исполнительном"
    ) {
        return "rgba(255, 201, 120, 0.9)";
    }
    if (phase === "Крейсерский полёт") return "rgba(111, 196, 255, 0.9)";
    if (phase === "На стоянке / Завершён") return "rgba(130, 180, 130, 0.85)";
    return "rgba(140, 160, 200, 0.8)";
}

function getPriorityBadgeColor(priority) {
    if (priority === "EMERGENCY") return "rgba(255, 96, 96, 0.95)";
    if (priority === "HIGH") return "rgba(255, 176, 88, 0.95)";
    return "rgba(160, 180, 210, 0.75)";
}

function getRadarColor(status) {
    if (status === "scheduled") return "#f3c06a";
    if (status === "active") return "#6fffd7";
    return "#7aa2ff";
}

function hashString(value) {
    let hash = 0;
    const text = String(value || "");
    for (let i = 0; i < text.length; i += 1) {
        hash = (hash << 5) - hash + text.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}

function getRouteColor(flight) {
    const seed = hashString(flight.callsign || flight.id || "");
    const hue = seed % 360;
    return `hsl(${hue}, 80%, 62%)`;
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

function isPointInZone(position, zone) {
    if (!position || !zone) return false;
    return distanceKm(position, [zone.lat, zone.lon]) <= zone.radiusKm;
}

function destinationPoint(lat, lon, bearing, distanceKmValue) {
    const radius = 6371;
    const delta = distanceKmValue / radius;
    const theta = toRadians(bearing);
    const phi1 = toRadians(lat);
    const lambda1 = toRadians(lon);

    const sinPhi1 = Math.sin(phi1);
    const cosPhi1 = Math.cos(phi1);
    const sinDelta = Math.sin(delta);
    const cosDelta = Math.cos(delta);

    const sinPhi2 = sinPhi1 * cosDelta + cosPhi1 * sinDelta * Math.cos(theta);
    const phi2 = Math.asin(sinPhi2);
    const y = Math.sin(theta) * sinDelta * cosPhi1;
    const x = cosDelta - sinPhi1 * sinPhi2;
    const lambda2 = lambda1 + Math.atan2(y, x);

    return [toDegrees(phi2), toDegrees(lambda2)];
}

function buildGreatCircleRoute(origin, destination, steps = 60) {
    if (!origin || !destination) return null;
    const lat1 = toRadians(origin.lat);
    const lon1 = toRadians(origin.lon);
    const lat2 = toRadians(destination.lat);
    const lon2 = toRadians(destination.lon);
    const delta = haversineDistance([origin.lat, origin.lon], [destination.lat, destination.lon]);
    if (!delta || Number.isNaN(delta)) {
        return [
            [origin.lat, origin.lon],
            [destination.lat, destination.lon],
        ];
    }
    const sinDelta = Math.sin(delta);
    const points = [];
    const count = Math.max(40, Math.min(80, steps));
    for (let i = 0; i <= count; i += 1) {
        const t = i / count;
        const a = Math.sin((1 - t) * delta) / sinDelta;
        const b = Math.sin(t * delta) / sinDelta;
        const x =
            a * Math.cos(lat1) * Math.cos(lon1) +
            b * Math.cos(lat2) * Math.cos(lon2);
        const y =
            a * Math.cos(lat1) * Math.sin(lon1) +
            b * Math.cos(lat2) * Math.sin(lon2);
        const z = a * Math.sin(lat1) + b * Math.sin(lat2);
        const lat = Math.atan2(z, Math.sqrt(x * x + y * y));
        const lon = Math.atan2(y, x);
        points.push([toDegrees(lat), toDegrees(lon)]);
    }
    return points;
}

function buildBezierRoute(start, control, end, steps = 12) {
    const points = [];
    for (let i = 0; i <= steps; i += 1) {
        const t = i / steps;
        const mt = 1 - t;
        const lat = mt * mt * start[0] + 2 * mt * t * control[0] + t * t * end[0];
        const lon = mt * mt * start[1] + 2 * mt * t * control[1] + t * t * end[1];
        points.push([lat, lon]);
    }
    return points;
}

function buildSegmentedRoute(origin, destination) {
    const base = buildGreatCircleRoute(origin, destination, 80);
    if (!base || base.length < 2) return base;
    const meta = computeRouteDistances(base);
    const totalKm = meta.total * 6371;
    const segmentKm = Math.min(120, Math.max(60, totalKm * 0.12));
    const startProgress = segmentKm / totalKm;
    const endProgress = 1 - segmentKm / totalKm;
    const startInfo = positionOnRoute(base, meta, startProgress);
    const endInfo = positionOnRoute(base, meta, endProgress);

    const bearingStart = bearingBetween(base[0], startInfo.position || base[1]);
    const bearingEnd = bearingBetween(endInfo.position || base[base.length - 2], base[base.length - 1]);
    const controlStart = destinationPoint(
        base[0][0],
        base[0][1],
        bearingStart - 40,
        segmentKm * 0.6
    );
    const controlEnd = destinationPoint(
        base[base.length - 1][0],
        base[base.length - 1][1],
        bearingEnd + 40,
        segmentKm * 0.6
    );

    const departureArc = buildBezierRoute(base[0], controlStart, startInfo.position, 12);
    const arrivalArc = buildBezierRoute(endInfo.position, controlEnd, base[base.length - 1], 12);

    const main = base.filter((point, index) => {
        const progress = index / (base.length - 1);
        return progress >= startProgress && progress <= endProgress;
    });

    const combined = [
        ...departureArc.slice(0, -1),
        ...main.slice(1, -1),
        ...arrivalArc,
    ];
    return combined;
}

function computeRouteDistances(route) {
    if (!route || route.length < 2) return { total: 0, cumulative: [] };
    const cumulative = [0];
    let total = 0;
    for (let i = 1; i < route.length; i += 1) {
        total += haversineDistance(route[i - 1], route[i]);
        cumulative.push(total);
    }
    return { total, cumulative };
}

function bearingBetween(start, end) {
    const lat1 = toRadians(start[0]);
    const lat2 = toRadians(end[0]);
    const dLon = toRadians(end[1] - start[1]);
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    const brng = (toDegrees(Math.atan2(y, x)) + 360) % 360;
    return Math.round(brng);
}

function positionOnRoute(route, routeMeta, progress) {
    if (!route || route.length === 0) return { position: null, heading: null, distanceKm: 0 };
    if (!routeMeta || routeMeta.total === 0) {
        return { position: route[0], heading: null, distanceKm: 0 };
    }
    const clamped = Math.min(1, Math.max(0, progress));
    const target = routeMeta.total * clamped;
    const { cumulative } = routeMeta;
    let index = cumulative.findIndex((value) => value >= target);
    if (index <= 0) {
        return {
            position: route[0],
            heading: bearingBetween(route[0], route[1] || route[0]),
            distanceKm: 0,
        };
    }
    if (index === -1) {
        return {
            position: route[route.length - 1],
            heading: bearingBetween(route[route.length - 2] || route[route.length - 1], route[route.length - 1]),
            distanceKm: routeMeta.total * 6371,
        };
    }
    const prevDist = cumulative[index - 1];
    const nextDist = cumulative[index];
    const segmentProgress = (target - prevDist) / (nextDist - prevDist || 1);
    const start = route[index - 1];
    const end = route[index];
    const lat = start[0] + (end[0] - start[0]) * segmentProgress;
    const lon = start[1] + (end[1] - start[1]) * segmentProgress;
    const distanceKm = (prevDist + (nextDist - prevDist) * segmentProgress) * 6371;
    return { position: [lat, lon], heading: bearingBetween(start, end), distanceKm };
}

function MapFocus({ flight }) {
    const map = useMap();

    useEffect(() => {
        if (!flight?.position) return;
        const route = flight.route;
        if (route && route.length > 1) {
            const distance = distanceKm(route[0], route[route.length - 1]);
            if (distance <= 1500) {
                map.flyToBounds(L.latLngBounds(route), {
                    padding: [40, 40],
                    maxZoom: 7,
                    duration: 0.6,
                });
                return;
            }
        }
        map.flyTo(flight.position, 6, { duration: 0.6 });
    }, [map, flight?.id]);

    return null;
}

function MapFocusPoint({ point }) {
    const map = useMap();

    useEffect(() => {
        if (!point) return;
        map.flyTo(point, 7, { duration: 0.6 });
    }, [map, point]);

    return null;
}

function MapClickHandler({ onClear }) {
    useMapEvent("click", (event) => {
        const target = event.originalEvent?.target;
        if (target && target.closest?.(".leaflet-marker-icon, .leaflet-tooltip")) {
            return;
        }
        onClear?.();
    });
    return null;
}

function HeadingRing({ flight }) {
    if (!flight?.position || !Number.isFinite(flight.heading)) return null;
    const [lat, lon] = flight.position;
    const radiusKm = 20;
    const headingEnd = destinationPoint(lat, lon, flight.heading, radiusKm);
    const labelIcon = (label) =>
        L.divIcon({
            className: "heading-ring-label",
            html: `<span>${label}</span>`,
            iconSize: [26, 26],
            iconAnchor: [13, 13],
        });

    const degreeLabels = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];

    return (
        <>
            <Circle
                center={[lat, lon]}
                radius={radiusKm * 1000}
                pathOptions={{
                    color: "rgba(255, 211, 77, 0.6)",
                    weight: 1,
                    opacity: 0.8,
                    fillOpacity: 0,
                }}
            />
            <Polyline
                positions={[
                    [lat, lon],
                    headingEnd,
                ]}
                pathOptions={{
                    color: "rgba(255, 211, 77, 0.9)",
                    weight: 2,
                    opacity: 0.9,
                }}
            />
            {degreeLabels.map((deg) => {
                const point = destinationPoint(lat, lon, deg, radiusKm);
                return (
                    <Marker
                        key={`deg-${deg}`}
                        position={point}
                        icon={labelIcon(deg)}
                        interactive={false}
                    />
                );
            })}
        </>
    );
}

function describeAuthError(code) {
    if (code === "invalid_login") return "Неверный логин или PIN.";
    if (code === "user_exists") return "Пользователь уже существует.";
    if (code === "invalid_credentials") return "Введите имя и PIN (минимум 4 цифры).";
    if (code === "zone_required") return "Выберите зону диспетчера.";
    if (code === "zone_busy") return "Зона уже занята другим диспетчером.";
    if (code === "invalid_zone") return "Зона не найдена.";
    return "Не удалось выполнить запрос.";
}

function describeFlightError(code) {
    if (code === "invalid_callsign") return "Позывной должен быть не короче 3 символов.";
    if (code === "invalid_route") return "Проверьте маршрут: ICAO не должны совпадать.";
    if (code === "unknown_airport") return "Не найден ICAO в базе аэропортов.";
    if (code === "invalid_schedule") return "Неверное время вылета или прилета.";
    if (code === "callsign_taken") return "Позывной уже используется.";
    if (code === "unauthorized") return "Сессия истекла. Войдите снова.";
    if (code === "forbidden") return "Недостаточно прав для этого рейса.";
    if (code === "locked") return "Рейс заблокирован администратором.";
    if (code === "transfer_pending") return "Рейс уже в процессе передачи.";
    if (code === "user_offline") return "Диспетчер офлайн.";
    if (code === "user_not_found") return "Пользователь не найден.";
    if (code === "transfer_not_found") return "Запрос передачи не найден.";
    if (code === "invalid_target") return "Неверный получатель передачи.";
    if (code === "zone_forbidden") return "Рейс вне вашей зоны.";
    return "Не удалось сохранить рейс.";
}

function buildFlightPayload(flight) {
    if (!flight) return {};
    return {
        callsign: flight.callsign,
        fromIcao: flight.fromIcao,
        toIcao: flight.toIcao,
        departureMsk: flight.departureMsk || formatMsk(flight.departureUtc),
        arrivalMsk: flight.arrivalMsk || formatMsk(flight.arrivalUtc),
        phase: flight.phase || FLIGHT_PHASES[0],
        speed: Number.isFinite(flight.speed) ? flight.speed : null,
        altitude: Number.isFinite(flight.altitude) ? flight.altitude : null,
        awaitingAtc: Boolean(flight.awaitingAtc),
        priority: flight.priority || "NORMAL",
    };
}

async function apiRequest(path, { method = "GET", body, token } = {}) {
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(`${API_BASE}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : null;

    if (!response.ok) {
        const error = data?.error || "request_failed";
        throw new Error(error);
    }

    return data;
}

export default function App() {
    const [status, setStatus] = useState(() => loadLS("ui.status", "online"));
    const [now, setNow] = useState(Date.now());
    const [flights, setFlights] = useState([]);
    const [flightsError, setFlightsError] = useState("");
    const [selectedPilotId, setSelectedPilotId] = useState(null);
    const [pilotRouteId, setPilotRouteId] = useState(null);
    const [showPilotInfo, setShowPilotInfo] = useState(true);
    const [zones, setZones] = useState([]);
    const [zonesError, setZonesError] = useState("");

    const [authToken, setAuthToken] = useState(() => loadLS("atc.token", null));
    const [authUser, setAuthUser] = useState(null);
    const [authChecked, setAuthChecked] = useState(false);
    const [authError, setAuthError] = useState("");
    const [authBusy, setAuthBusy] = useState(false);

    useEffect(() => saveLS("ui.status", status), [status]);
    useEffect(() => saveLS("atc.token", authToken), [authToken]);

    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, []);

    const navigate = useNavigate();
    const location = useLocation();

    const active = useMemo(() => {
        const p = location.pathname || "/";
        if (p === "/") return "pilot";
        if (p.startsWith("/atc")) return "atc";
        return "unknown";
    }, [location.pathname]);

    const goATC = useCallback(() => navigate("/atc"), [navigate]);
    const goPilot = useCallback(() => navigate("/"), [navigate]);

    const isATC = active === "atc";
    const isPilot = active === "pilot";

    const fetchFlights = useCallback(async () => {
        try {
            setFlightsError("");
            const data = await apiRequest("/flights");
            setFlights(data || []);
        } catch (error) {
            setFlightsError(error.message || "failed_to_load_flights");
        }
    }, []);

    const fetchZones = useCallback(async () => {
        try {
            setZonesError("");
            const data = await apiRequest("/zones");
            setZones(Array.isArray(data) ? data : []);
        } catch (error) {
            setZonesError(error.message || "failed_to_load_zones");
        }
    }, []);

    const handleLogin = useCallback(async (payload, mode) => {
        setAuthBusy(true);
        setAuthError("");
        try {
            if (mode === "register") {
                await apiRequest("/auth/register", { method: "POST", body: payload });
            }
            const data = await apiRequest("/auth/login", { method: "POST", body: payload });
            setAuthToken(data.token);
            setAuthUser({
                id: data.id,
                username: data.username,
                role: data.role || "dispatcher",
                zoneId: data.zoneId || null,
                zoneName: data.zoneName || null,
                zoneType: data.zoneType || null,
            });
            setStatus("online");
            fetchZones();
        } catch (error) {
            setAuthError(error.message || "auth_failed");
        } finally {
            setAuthBusy(false);
        }
    }, [fetchZones]);

    const handleLogout = useCallback(async () => {
        if (authToken) {
            try {
                await apiRequest("/auth/logout", { method: "POST", token: authToken });
            } catch {
                // Ignore logout errors.
            }
        }
        setAuthToken(null);
        setAuthUser(null);
        setStatus("offline");
        goPilot();
    }, [authToken, goPilot, setStatus]);

    const handleAirportSearch = useCallback(async (query) => {
        if (!query || query.trim().length < 2) return [];
        const encoded = encodeURIComponent(query.trim());
        try {
            return await apiRequest(`/airports/search?q=${encoded}`);
        } catch {
            return [];
        }
    }, []);

    const handleCreateFlight = useCallback(
        async (payload) => {
            if (!authToken) throw new Error("unauthorized");
            const data = await apiRequest("/flights", {
                method: "POST",
                body: payload,
                token: authToken,
            });
            await fetchFlights();
            return data;
        },
        [authToken, fetchFlights]
    );

    const handleUpdateFlight = useCallback(
        async (flightId, payload) => {
            if (!authToken) throw new Error("unauthorized");
            const data = await apiRequest(`/flights/${flightId}`, {
                method: "PUT",
                body: payload,
                token: authToken,
            });
            await fetchFlights();
            return data;
        },
        [authToken, fetchFlights]
    );

    const handleDeleteFlight = useCallback(
        async (flightId) => {
            if (!authToken) throw new Error("unauthorized");
            await apiRequest(`/flights/${flightId}`, {
                method: "DELETE",
                token: authToken,
            });
            await fetchFlights();
        },
        [authToken, fetchFlights]
    );

    const activeFlights = useMemo(() => {
        return flights
            .map((flight) => {
                const statusValue = flight.engine?.mode
                    ? mapEngineModeToStatus(flight.engine.mode)
                    : computeStatus(flight, now);
                const progressValue =
                    flight.engine?.route?.totalDistanceM && Number.isFinite(flight.engine.progressM)
                        ? flight.engine.progressM / flight.engine.route.totalDistanceM
                        : computeProgress(flight, now);
                return {
                    ...flight,
                    status: statusValue,
                    progress: progressValue,
                };
            })
            .filter((flight) => flight.status !== "completed");
    }, [flights, now]);

    const mapFlights = useMemo(() => {
        return activeFlights
            .filter((flight) => flight.origin && flight.destination)
            .map((flight) => {
                const engine = flight.engine || null;
                const route =
                    engine?.route?.points?.length > 1
                        ? engine.route.points
                        : buildSegmentedRoute(flight.origin, flight.destination);
                const routeMeta = computeRouteDistances(route);
                const progressValue =
                    engine?.route?.totalDistanceM && Number.isFinite(engine.progressM)
                        ? engine.progressM / engine.route.totalDistanceM
                        : flight.progress;
                const routeInfo =
                    flight.status === "scheduled"
                        ? { position: route?.[0], heading: null, distanceKm: 0 }
                        : engine?.position
                        ? { position: engine.position, heading: engine.headingDeg, distanceKm: 0 }
                        : positionOnRoute(route, routeMeta, progressValue);
                const displaySpeed = Number.isFinite(engine?.speedKts)
                    ? engine.speedKts
                    : flight.speed;
                const displayAltitude = Number.isFinite(engine?.altitudeFt)
                    ? engine.altitudeFt
                    : flight.altitude;

                const totalKm = routeMeta.total * 6371;
                const fallbackTodDistanceKm = Math.min(120, Math.max(80, totalKm * 0.12));
                const fallbackTodProgress = totalKm > 0 ? (totalKm - fallbackTodDistanceKm) / totalKm : 0;
                const todProgress =
                    engine?.route?.totalDistanceM && Number.isFinite(engine?.route?.todDistM)
                        ? engine.route.todDistM / engine.route.totalDistanceM
                        : fallbackTodProgress;
                const todInfo =
                    todProgress > 0 ? positionOnRoute(route, routeMeta, todProgress) : { position: null };

                return {
                    id: flight.id,
                    callsign: flight.callsign,
                    from: flight.fromIcao,
                    to: flight.toIcao,
                    status: flight.status,
                    position: routeInfo.position,
                    heading: Number.isFinite(routeInfo.heading) ? routeInfo.heading : 0,
                    route,
                    routeMeta,
                    routeColor: getRouteColor(flight),
                    phase: flight.phase,
                    speed: flight.speed,
                    altitude: flight.altitude,
                    displaySpeed,
                    displayAltitude,
                    todPoint: todInfo.position || null,
                    awaitingAtc: Boolean(flight.awaitingAtc),
                    progress: progressValue,
                    ownerId: flight.ownerId,
                    ownerName: flight.ownerName,
                    priority: flight.priority,
                    isLocked: Boolean(flight.isLocked),
                    transferPending: Boolean(flight.transferPending),
                    transferToUserId: flight.transferToUserId,
                };
            });
    }, [activeFlights]);

    const selectedPilotFlight = useMemo(() => {
        if (!selectedPilotId) return mapFlights[0] || null;
        return mapFlights.find((flight) => flight.id === selectedPilotId) || mapFlights[0] || null;
    }, [mapFlights, selectedPilotId]);

    const activePilotRouteFlight = useMemo(() => {
        if (!pilotRouteId) return null;
        return mapFlights.find((flight) => flight.id === pilotRouteId) || null;
    }, [mapFlights, pilotRouteId]);

    useEffect(() => {
        if (!mapFlights.length) {
            setSelectedPilotId(null);
            setPilotRouteId(null);
            return;
        }
        if (!selectedPilotId || !mapFlights.some((flight) => flight.id === selectedPilotId)) {
            setSelectedPilotId(mapFlights[0].id);
        }
        if (pilotRouteId && !mapFlights.some((flight) => flight.id === pilotRouteId)) {
            setPilotRouteId(null);
        }
    }, [mapFlights, selectedPilotId, pilotRouteId]);

    useEffect(() => {
        let isMounted = true;

        async function checkSession() {
            if (!authToken) {
                if (isMounted) {
                    setAuthUser(null);
                    setAuthChecked(true);
                }
                return;
            }
            try {
                const data = await apiRequest("/auth/me", { token: authToken });
                if (isMounted) {
                    setAuthUser({
                        id: data.id,
                        username: data.username,
                        role: data.role || "dispatcher",
                        zoneId: data.zoneId || null,
                        zoneName: data.zoneName || null,
                        zoneType: data.zoneType || null,
                    });
                    setStatus("online");
                    setAuthChecked(true);
                }
            } catch {
                if (isMounted) {
                    setAuthToken(null);
                    setAuthUser(null);
                    setAuthChecked(true);
                }
            }
        }

        checkSession();

        return () => {
            isMounted = false;
        };
    }, [authToken]);

    useEffect(() => {
        fetchFlights();
        const timer = setInterval(fetchFlights, 15000);
        return () => clearInterval(timer);
    }, [fetchFlights]);

    useEffect(() => {
        fetchZones();
        const timer = setInterval(fetchZones, authUser ? 10000 : 5000);
        return () => clearInterval(timer);
    }, [fetchZones, authUser]);

    return (
        <div style={{ width: "100vw", height: "100vh", position: "relative", overflow: "hidden" }}>
            {/* Карта — фон (скрываем в ATC) */}
            {active !== "atc" && (
                <PilotMap
                    flights={mapFlights}
                    selectedId={pilotRouteId}
                    activeFlight={activePilotRouteFlight}
                    showInfo={showPilotInfo}
                    onSelect={(flightId) => {
                        if (!flightId) {
                            setPilotRouteId(null);
                            return;
                        }
                        setSelectedPilotId(flightId);
                        setPilotRouteId((current) => (current === flightId ? null : flightId));
                    }}
                    onClear={() => setPilotRouteId(null)}
                />
            )}

            {/* Верхняя панель */}
            <div
                style={{
                    position: "absolute",
                    top: 12,
                    left: 12,
                    right: 12,
                    zIndex: 10000,
                    display: "flex",
                    gap: 10,
                    alignItems: "center",
                    pointerEvents: "none",
                }}
            >
                <div
                    style={{
                        pointerEvents: "auto",
                        background: "rgba(20,20,20,0.85)",
                        color: "#fff",
                        padding: "10px 12px",
                        borderRadius: 10,
                        fontWeight: 800,
                    }}
                >
                    FlightRadar
                </div>

                <div style={{ flex: 1 }} />
                <button
                    onClick={active === "atc" ? goPilot : goATC}
                    style={{
                        pointerEvents: "auto",
                        background: active === "atc" ? "rgba(255,255,255,0.95)" : "rgba(20,20,20,0.85)",
                        border: "none",
                        padding: "10px 12px",
                        borderRadius: 10,
                        cursor: "pointer",
                        fontWeight: 800,
                        color: active === "atc" ? "#000" : "#fff",
                    }}
                    title={active === "atc" ? "Вернуться к карте" : "Открыть ATC"}
                >
                    {active === "atc" ? "Назад к карте" : "Открыть ATC"}
                </button>
            </div>

            {active === "pilot" && (
                <PilotSidebar
                    flights={mapFlights}
                    selectedId={selectedPilotId}
                    activeRouteId={pilotRouteId}
                    showInfo={showPilotInfo}
                    onToggleInfo={() => setShowPilotInfo((prev) => !prev)}
                    onSelect={(flightId) => {
                        if (!flightId) {
                            setPilotRouteId(null);
                            return;
                        }
                        setSelectedPilotId(flightId);
                        setPilotRouteId((current) => (current === flightId ? null : flightId));
                    }}
                />
            )}

            {/* Контент экрана (правый нижний блок / полноэкранный ATC) */}
            <div
                style={{
                    position: "absolute",
                    right: isATC ? 12 : 0,
                    bottom: isATC ? 12 : 0,
                    left: isATC ? 12 : 0,
                    top: isATC ? 12 : 0,
                    width: isATC ? "auto" : "100%",
                    height: isATC ? "calc(100vh - 24px)" : "100%",
                    maxWidth: isATC ? "calc(100vw - 24px)" : "100%",
                    maxHeight: isATC ? "calc(100vh - 24px)" : "100%",
                    background: isATC ? "transparent" : "transparent",
                    borderRadius: isATC ? 16 : 0,
                    padding: isATC ? 0 : 0,
                    boxShadow: isATC ? "none" : "none",
                    zIndex: 10000,
                    overflow: isATC ? "hidden" : "visible",
                    pointerEvents: isPilot ? "none" : "auto",
                }}
            >
                <Routes>
                    <Route path="/" element={<PilotScreen flight={selectedPilotFlight} />} />
                    <Route
                        path="/atc"
                        element={
                            authChecked && authUser ? (
                                <ATCScreen
                                    status={status}
                                    dispatcherName={authUser?.username}
                                    currentUser={authUser}
                                    flights={activeFlights}
                                    mapFlights={mapFlights}
                                    zones={zones}
                                    flightsError={flightsError}
                                    onRefresh={fetchFlights}
                                    onCreateFlight={handleCreateFlight}
                                    onUpdateFlight={handleUpdateFlight}
                                    onDeleteFlight={handleDeleteFlight}
                                    onLogout={handleLogout}
                                    onAirportSearch={handleAirportSearch}
                                    onFetchOnlineDispatchers={async () => {
                                        if (!authToken) return [];
                                        return apiRequest("/dispatchers/online", { token: authToken });
                                    }}
                                    onRequestTransfer={async (flightId, toUserId) => {
                                        if (!authToken) throw new Error("unauthorized");
                                        return apiRequest(`/flights/${flightId}/transfer`, {
                                            method: "POST",
                                            token: authToken,
                                            body: { toUserId },
                                        });
                                    }}
                                    onFetchPendingTransfers={async () => {
                                        if (!authToken) return [];
                                        return apiRequest("/transfers/pending", { token: authToken });
                                    }}
                                    onRespondTransfer={async (flightId, action) => {
                                        if (!authToken) throw new Error("unauthorized");
                                        return apiRequest(`/flights/${flightId}/transfer/${action}`, {
                                            method: "POST",
                                            token: authToken,
                                        });
                                    }}
                                    onToggleFlightLock={async (flightId, locked) => {
                                        if (!authToken) throw new Error("unauthorized");
                                        return apiRequest(`/flights/${flightId}/lock`, {
                                            method: "POST",
                                            token: authToken,
                                            body: { locked },
                                        });
                                    }}
                                    onFetchDispatchers={async () => {
                                        if (!authToken) return [];
                                        return apiRequest("/dispatchers", { token: authToken });
                                    }}
                                    onDeleteDispatcher={async (dispatcherId) => {
                                        if (!authToken) throw new Error("unauthorized");
                                        return apiRequest(`/dispatchers/${dispatcherId}`, {
                                            method: "DELETE",
                                            token: authToken,
                                        });
                                    }}
                                    onFetchLogs={async () => {
                                        if (!authToken) return [];
                                        return apiRequest("/logs", { token: authToken });
                                    }}
                                    onLogEvent={async (payload) => {
                                        if (!authToken) return null;
                                        return apiRequest("/logs/events", {
                                            method: "POST",
                                            token: authToken,
                                            body: payload,
                                        });
                                    }}
                                />
                            ) : (
                                <ATCLogin
                                    isReady={authChecked}
                                    isBusy={authBusy}
                                    error={authError}
                                    zones={zones}
                                    zonesError={zonesError}
                                    onRetryZones={fetchZones}
                                    onSubmit={handleLogin}
                                />
                            )
                        }
                    />
                    <Route path="*" element={<NotFoundScreen />} />
                </Routes>
            </div>
        </div>
    );
}

function PilotMap({ flights, selectedId, activeFlight, showInfo, onSelect, onClear }) {
    const visibleFlights = flights.filter((flight) => flight.position && flight.route);

    return (
        <MapContainer
            center={[25.2048, 55.2708]} // Dubai
            zoom={5}
            style={{ width: "100%", height: "100%", zIndex: 0 }}
        >
            <TileLayer
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
            />
            <MapFocus flight={activeFlight} />
            <MapClickHandler onClear={onClear} />
            {activeFlight?.route?.length > 1 && (
                <>
                    <Marker position={activeFlight.route[0]} icon={mapLabelIcon("DEP")} interactive={false} />
                    <Marker
                        position={activeFlight.route[activeFlight.route.length - 1]}
                        icon={mapLabelIcon("ARR")}
                        interactive={false}
                    />
                    {activeFlight.todPoint && (
                        <Marker position={activeFlight.todPoint} icon={mapLabelIcon("TOD")} interactive={false}>
                            <Tooltip direction="top" offset={[0, -6]} opacity={0.9}>
                                TOD — начало снижения
                            </Tooltip>
                        </Marker>
                    )}
                </>
            )}
            {visibleFlights.flatMap((flight) => {
                const color = flight.routeColor || getRadarColor(flight.status);
                const isSelected = flight.id === selectedId;
                const marker = (
                    <Marker
                        key={`${flight.id}-marker`}
                        position={flight.position}
                        icon={getPlaneIcon(flight.heading)}
                        eventHandlers={{ click: () => onSelect(flight.id) }}
                    >
                        {isSelected && showInfo && (
                            <Tooltip
                                direction="top"
                                offset={[0, -14]}
                                opacity={1}
                                permanent
                                interactive
                            >
                                <FlightPopup flight={flight} onClose={onClear} />
                            </Tooltip>
                        )}
                    </Marker>
                );
                if (!isSelected) return [marker];
                return [
                    <Polyline
                        key={`${flight.id}-route-glow`}
                        positions={flight.route}
                        pathOptions={{
                            color,
                            weight: 6,
                            opacity: 0.18,
                            lineCap: "round",
                        }}
                    />,
                    <Polyline
                        key={`${flight.id}-route`}
                        positions={flight.route}
                        pathOptions={{
                            color,
                            weight: 2,
                            opacity: 0.9,
                            lineCap: "round",
                        }}
                    />,
                    marker,
                ];
            })}
        </MapContainer>
    );
}

function PilotScreen({ flight }) {
    const metrics = getPilotMetrics(flight);

    return (
        <div
            style={{
                position: "absolute",
                left: 16,
                bottom: 16,
                zIndex: 10001,
                pointerEvents: "auto",
            }}
        >
            <div
                style={{
                    minWidth: 240,
                    maxWidth: 320,
                    background: "rgba(12, 16, 26, 0.82)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 14,
                    padding: 12,
                    color: "#e7ebf4",
                    boxShadow: "0 12px 24px rgba(0,0,0,0.35)",
                    backdropFilter: "blur(10px)",
                }}
            >
                <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 6 }}>
                    {flight?.callsign || "Нет выбранного рейса"}
                </div>
                {flight && (
                    <div style={{ display: "grid", gap: 4, fontSize: 12, opacity: 0.85 }}>
                        <div>
                            {flight.from} → {flight.to}
                        </div>
                        <div>Фаза: {metrics.phase}</div>
                        <div>Высота: {metrics.altitude}</div>
                        <div>Скорость: {metrics.speed}</div>
                    </div>
                )}
            </div>
        </div>
    );
}

function PilotSidebar({ flights, selectedId, activeRouteId, showInfo, onToggleInfo, onSelect }) {
    const [query, setQuery] = useState("");
    const visibleFlights = useMemo(() => {
        const trimmed = query.trim().toLowerCase();
        const list = flights.filter((flight) => flight.position);
        if (!trimmed) return list;
        return list.filter((flight) => {
            const callsign = flight.callsign.toLowerCase();
            const route = `${flight.from} ${flight.to}`.toLowerCase();
            return callsign.includes(trimmed) || route.includes(trimmed);
        });
    }, [flights, query]);

    return (
        <div
            style={{
                position: "absolute",
                top: 72,
                left: 12,
                bottom: 12,
                width: 250,
                zIndex: 10002,
                pointerEvents: "auto",
                display: "grid",
                gap: 8,
                padding: 10,
                borderRadius: 16,
                background: "rgba(18, 24, 36, 0.88)",
                border: "1px solid var(--atc-border)",
                boxShadow: "0 16px 30px rgba(0,0,0,0.35)",
                overflow: "hidden",
            }}
        >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontWeight: 900, fontSize: 13 }}>Рейсы</div>
                <button
                    style={{
                        border: "1px solid var(--atc-border)",
                        borderRadius: 10,
                        padding: "4px 8px",
                        fontSize: 10,
                        background: showInfo ? "rgba(74, 99, 255, 0.85)" : "rgba(18, 24, 36, 0.9)",
                        color: "var(--atc-text)",
                        cursor: "pointer",
                    }}
                    onClick={onToggleInfo}
                >
                    Инфо
                </button>
            </div>
            <input
                placeholder="Поиск..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                style={{
                    border: "1px solid var(--atc-border)",
                    borderRadius: 10,
                    padding: "6px 8px",
                    fontSize: 11,
                    lineHeight: "16px",
                    height: 30,
                    background: "rgba(12, 16, 26, 0.95)",
                    color: "var(--atc-text)",
                }}
            />
            <div style={{ minHeight: 0, overflow: "auto", display: "grid", gap: 6 }}>
                {visibleFlights.length === 0 ? (
                    <div style={{ fontSize: 11, opacity: 0.7 }}>Нет рейсов.</div>
                ) : (
                    visibleFlights.map((flight) => {
                        const isActive = flight.id === selectedId;
                        const isRouteActive = flight.id === activeRouteId;
                        return (
                            <button
                                key={flight.id}
                                onClick={() => onSelect(flight.id)}
                                style={{
                                    textAlign: "left",
                                    border: "1px solid var(--atc-border)",
                                    borderRadius: 10,
                                    padding: "8px 8px",
                                    minHeight: 60,
                                    background: isActive
                                        ? "rgba(74, 99, 255, 0.92)"
                                        : "rgba(18, 24, 36, 0.9)",
                                    color: "var(--atc-text)",
                                    cursor: "pointer",
                                    boxShadow: isRouteActive
                                        ? "0 0 12px rgba(255, 211, 77, 0.35)"
                                        : "0 4px 12px rgba(0,0,0,0.28)",
                                }}
                            >
                                <div style={{ fontWeight: 800, fontSize: 12 }}>{flight.callsign}</div>
                                <div style={{ fontSize: 10, opacity: 0.75 }}>
                                    {flight.from} → {flight.to}
                                </div>
                                <div style={{ fontSize: 10, opacity: 0.7 }}>
                                    {Number.isFinite(flight.speed) ? `${flight.speed} kt` : "—"} ·{" "}
                                    {Number.isFinite(flight.altitude) ? `${flight.altitude} ft` : "—"}
                                </div>
                            </button>
                        );
                    })
                )}
            </div>
        </div>
    );
}

function FlightPopup({ flight, onClose }) {
    if (!flight) return null;
    const phase = flight.phase || formatStatusLabel(flight.status);
    const progress = Number.isFinite(flight.progress) ? `${Math.round(flight.progress * 100)}%` : "—";
    const speedValue = Number.isFinite(flight.displaySpeed) ? flight.displaySpeed : flight.speed;
    const altitudeValue = Number.isFinite(flight.displayAltitude) ? flight.displayAltitude : flight.altitude;
    const speed = Number.isFinite(speedValue) ? `${speedValue} kt` : "—";
    const altitude = Number.isFinite(altitudeValue) ? `${altitudeValue} ft` : "—";
    const heading = Number.isFinite(flight.heading) ? `${flight.heading}°` : "—";

    return (
        <div style={{ display: "grid", gap: 4, minWidth: 190, fontSize: 11, position: "relative" }}>
            {onClose && (
                <button
                    onClick={onClose}
                    style={{
                        position: "absolute",
                        top: -4,
                        right: -2,
                        border: "none",
                        background: "transparent",
                        color: "var(--atc-muted)",
                        fontSize: 12,
                        cursor: "pointer",
                    }}
                    aria-label="Закрыть"
                >
                    ×
                </button>
            )}
            <div style={{ fontWeight: 800, fontSize: 12 }}>{flight.callsign}</div>
            <div style={{ opacity: 0.75 }}>
                {flight.from} → {flight.to}
            </div>
            <div>Фаза: {phase}</div>
            <div>Прогресс: {progress}</div>
            <div>Скорость: {speed}</div>
            <div>Высота: {altitude}</div>
            <div>Курс: {heading}</div>
        </div>
    );
}

function ATCLogin({ isReady, isBusy, error, zones, zonesError, onRetryZones, onSubmit }) {
    const [mode, setMode] = useState("login");
    const [username, setUsername] = useState("");
    const [pin, setPin] = useState("");
    const [zoneId, setZoneId] = useState("");

    const moscowRegion = zones?.find((zone) => zone.id === "moscow_region") || null;
    const moscowAirports = zones?.filter((zone) => zone.parentId === "moscow_region") || [];
    const otherZones = zones?.filter(
        (zone) => zone.id !== "moscow_region" && zone.parentId !== "moscow_region"
    ) || [];

    const renderZoneOption = (zone) => {
        const occupied = Boolean(zone.dispatcher);
        const label = `${zone.name}${occupied ? " — занято" : ""}`;
        return (
            <option key={zone.id} value={zone.id} disabled={occupied}>
                {label}
            </option>
        );
    };

    return (
        <div
            style={{
                background: "var(--atc-bg)",
                borderRadius: 16,
                padding: 24,
                color: "var(--atc-text)",
                minHeight: "100%",
                border: "1px solid var(--atc-border)",
                boxShadow: "0 20px 40px rgba(0,0,0,0.35)",
                display: "grid",
                placeItems: "center",
            }}
        >
            <div
                style={{
                    width: 360,
                    maxWidth: "100%",
                    background: "var(--atc-panel)",
                    border: "1px solid var(--atc-border)",
                    borderRadius: 16,
                    padding: 18,
                    display: "grid",
                    gap: 12,
                }}
            >
                <div style={{ fontWeight: 900, fontSize: 18 }}>Вход в ATC</div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>
                    {mode === "login" ? "Введите имя диспетчера и PIN." : "Создайте учетную запись диспетчера."}
                </div>

                {!isReady ? (
                    <div style={{ fontSize: 12, opacity: 0.7 }}>Проверяем сессию…</div>
                ) : (
                    <form
                        style={{ display: "grid", gap: 10 }}
                        onSubmit={(event) => {
                            event.preventDefault();
                            onSubmit({ username, pin, zoneId }, mode);
                        }}
                    >
                        <input
                            placeholder="Имя диспетчера"
                            value={username}
                            onChange={(event) => setUsername(event.target.value)}
                            style={{
                                border: "1px solid var(--atc-border)",
                                borderRadius: 12,
                                padding: "10px 12px",
                                fontSize: 13,
                                background: "rgba(12, 16, 26, 0.95)",
                                color: "var(--atc-text)",
                            }}
                        />
                        <div style={{ display: "grid", gap: 6 }}>
                            <select
                                value={zoneId}
                                onChange={(event) => setZoneId(event.target.value)}
                                style={{
                                    border: "1px solid var(--atc-border)",
                                    borderRadius: 12,
                                    padding: "10px 12px",
                                    fontSize: 13,
                                    background: "rgba(12, 16, 26, 0.95)",
                                    color: "var(--atc-text)",
                                }}
                            >
                                <option value="">Выберите зону диспетчера</option>
                                {moscowRegion && (
                                    <optgroup label="Москва (регион)">
                                        {renderZoneOption(moscowRegion)}
                                    </optgroup>
                                )}
                                {moscowAirports.length > 0 && (
                                    <optgroup label="Москва (аэропорты)">
                                        {moscowAirports.map(renderZoneOption)}
                                    </optgroup>
                                )}
                                {otherZones.length > 0 && (
                                    <optgroup label="Другие зоны">
                                        {otherZones.map(renderZoneOption)}
                                    </optgroup>
                                )}
                            </select>
                            {zonesError && (
                                <div style={{ fontSize: 11, color: "#ffb3b3" }}>
                                    {describeAuthError(zonesError)}
                                </div>
                            )}
                            {onRetryZones && (
                                <button
                                    type="button"
                                    onClick={onRetryZones}
                                    style={{
                                        border: "1px solid var(--atc-border)",
                                        borderRadius: 10,
                                        padding: "6px 10px",
                                        fontSize: 11,
                                        background: "rgba(17, 23, 35, 0.85)",
                                        color: "var(--atc-text)",
                                        cursor: "pointer",
                                        justifySelf: "start",
                                    }}
                                >
                                    Обновить список зон
                                </button>
                            )}
                        </div>
                        <input
                            placeholder="PIN"
                            value={pin}
                            onChange={(event) => setPin(event.target.value)}
                            type="password"
                            style={{
                                border: "1px solid var(--atc-border)",
                                borderRadius: 12,
                                padding: "10px 12px",
                                fontSize: 13,
                                background: "rgba(12, 16, 26, 0.95)",
                                color: "var(--atc-text)",
                            }}
                        />
                        {error && (
                            <div style={{ fontSize: 12, color: "#ffb3b3" }}>
                                {describeAuthError(error)}
                            </div>
                        )}
                        <button
                            type="submit"
                            disabled={isBusy}
                            style={{
                                border: "1px solid var(--atc-border)",
                                borderRadius: 12,
                                padding: "10px 12px",
                                fontSize: 13,
                                fontWeight: 800,
                                background: "var(--atc-accent)",
                                color: "#fff",
                                cursor: "pointer",
                                opacity: isBusy ? 0.7 : 1,
                            }}
                        >
                            {mode === "login" ? "Войти" : "Создать аккаунт"}
                        </button>
                    </form>
                )}

                <button
                    type="button"
                    onClick={() => setMode(mode === "login" ? "register" : "login")}
                    style={{
                        background: "transparent",
                        border: "none",
                        color: "var(--atc-text)",
                        fontSize: 12,
                        cursor: "pointer",
                        opacity: 0.7,
                    }}
                >
                    {mode === "login" ? "Создать учетную запись" : "Уже есть аккаунт"}
                </button>
            </div>
        </div>
    );
}

function FlightModal({ mode, flight, busy, error, onClose, onSubmit, onAirportSearch }) {
    const [callsign, setCallsign] = useState(flight?.callsign || "");
    const [fromQuery, setFromQuery] = useState(flight?.fromIcao || "");
    const [toQuery, setToQuery] = useState(flight?.toIcao || "");
    const [fromIcao, setFromIcao] = useState(flight?.fromIcao || "");
    const [toIcao, setToIcao] = useState(flight?.toIcao || "");
    const [departureDate, setDepartureDate] = useState("");
    const [departureTime, setDepartureTime] = useState("");
    const [arrivalDate, setArrivalDate] = useState("");
    const [arrivalTime, setArrivalTime] = useState("");
    const [speed, setSpeed] = useState(flight?.speed ?? "");
    const [altitude, setAltitude] = useState(flight?.altitude ?? "");
    const [priority, setPriority] = useState(flight?.priority || "NORMAL");
    const [localError, setLocalError] = useState("");
    const [fromResults, setFromResults] = useState([]);
    const [toResults, setToResults] = useState([]);

    useEffect(() => {
        const departure = flight?.departureMsk || formatMsk(flight?.departureUtc);
        const arrival = flight?.arrivalMsk || formatMsk(flight?.arrivalUtc);
        if (departure) {
            const [datePart, timePart] = departure.split(" ");
            setDepartureDate(datePart || "");
            setDepartureTime(timePart || "");
        }
        if (arrival) {
            const [datePart, timePart] = arrival.split(" ");
            setArrivalDate(datePart || "");
            setArrivalTime(timePart || "");
        }
        setPriority(flight?.priority || "NORMAL");
    }, [flight]);

    useEffect(() => {
        const timer = setTimeout(async () => {
            if (!fromQuery || fromQuery.trim().length < 2) {
                setFromResults([]);
                return;
            }
            const results = await onAirportSearch(fromQuery);
            setFromResults(results);
        }, 200);
        return () => clearTimeout(timer);
    }, [fromQuery, onAirportSearch]);

    useEffect(() => {
        const timer = setTimeout(async () => {
            if (!toQuery || toQuery.trim().length < 2) {
                setToResults([]);
                return;
            }
            const results = await onAirportSearch(toQuery);
            setToResults(results);
        }, 200);
        return () => clearTimeout(timer);
    }, [toQuery, onAirportSearch]);

    const handleSubmit = async (event) => {
        event.preventDefault();
        setLocalError("");
        if (!fromIcao || !toIcao) {
            setLocalError("Выберите аэропорт из списка.");
            return;
        }
        if (!departureDate || !departureTime || !arrivalDate || !arrivalTime) {
            setLocalError("Укажите дату и время вылета и прибытия.");
            return;
        }
        await onSubmit({
            callsign,
            fromIcao: fromIcao.trim().toUpperCase(),
            toIcao: toIcao.trim().toUpperCase(),
            departureMsk: `${departureDate} ${departureTime}`,
            arrivalMsk: `${arrivalDate} ${arrivalTime}`,
            speed: speed === "" ? null : Number(speed),
            altitude: altitude === "" ? null : Number(altitude),
            priority,
        });
    };

    const selectAirport = (airport, setQuery, setIcao, setResults) => {
        setQuery(`${airport.icao} — ${airport.name}`);
        setIcao(airport.icao);
        setResults([]);
    };

    return (
        <div
            style={{
                position: "fixed",
                inset: 0,
                background: "rgba(6, 10, 18, 0.45)",
                display: "grid",
                placeItems: "center",
                zIndex: 20000,
                backdropFilter: "blur(3px)",
                pointerEvents: "auto",
            }}
        >
            <div
                style={{
                    width: 460,
                    maxWidth: "92%",
                    background: "var(--atc-panel)",
                    border: "1px solid var(--atc-border)",
                    borderRadius: 16,
                    padding: 18,
                    display: "grid",
                    gap: 12,
                }}
            >
                <div style={{ fontWeight: 900, fontSize: 16 }}>
                    {mode === "create" ? "Добавить рейс" : "Редактировать рейс"}
                </div>

                <form style={{ display: "grid", gap: 10 }} onSubmit={handleSubmit}>
                    <input
                        placeholder="Позывной"
                        value={callsign}
                        onChange={(event) => setCallsign(event.target.value)}
                        style={{
                            border: "1px solid var(--atc-border)",
                            borderRadius: 12,
                            padding: "10px 12px",
                            fontSize: 13,
                            background: "rgba(12, 16, 26, 0.95)",
                            color: "var(--atc-text)",
                        }}
                    />
                    <div style={{ display: "grid", gap: 6 }}>
                        <input
                            placeholder="Откуда (ICAO / город / название)"
                            value={fromQuery}
                            onChange={(event) => {
                                setFromQuery(event.target.value);
                                setFromIcao("");
                            }}
                            style={{
                                border: "1px solid var(--atc-border)",
                                borderRadius: 12,
                                padding: "10px 12px",
                                fontSize: 13,
                                background: "rgba(12, 16, 26, 0.95)",
                                color: "var(--atc-text)",
                            }}
                        />
                        {fromResults.length > 0 && (
                            <div
                                style={{
                                    display: "grid",
                                    gap: 6,
                                    maxHeight: 180,
                                    overflow: "auto",
                                    border: "1px solid var(--atc-border)",
                                    borderRadius: 12,
                                    padding: 8,
                                    background: "rgba(12, 16, 26, 0.98)",
                                }}
                            >
                                {fromResults.map((airport) => (
                                    <button
                                        key={airport.icao}
                                        type="button"
                                        onClick={() =>
                                            selectAirport(airport, setFromQuery, setFromIcao, setFromResults)
                                        }
                                        style={{
                                            textAlign: "left",
                                            background: "transparent",
                                            border: "none",
                                            color: "var(--atc-text)",
                                            cursor: "pointer",
                                            fontSize: 12,
                                        }}
                                    >
                                        {airport.icao} · {airport.name} ({airport.city})
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <div style={{ display: "grid", gap: 6 }}>
                        <input
                            placeholder="Куда (ICAO / город / название)"
                            value={toQuery}
                            onChange={(event) => {
                                setToQuery(event.target.value);
                                setToIcao("");
                            }}
                            style={{
                                border: "1px solid var(--atc-border)",
                                borderRadius: 12,
                                padding: "10px 12px",
                                fontSize: 13,
                                background: "rgba(12, 16, 26, 0.95)",
                                color: "var(--atc-text)",
                            }}
                        />
                        {toResults.length > 0 && (
                            <div
                                style={{
                                    display: "grid",
                                    gap: 6,
                                    maxHeight: 180,
                                    overflow: "auto",
                                    border: "1px solid var(--atc-border)",
                                    borderRadius: 12,
                                    padding: 8,
                                    background: "rgba(12, 16, 26, 0.98)",
                                }}
                            >
                                {toResults.map((airport) => (
                                    <button
                                        key={airport.icao}
                                        type="button"
                                        onClick={() =>
                                            selectAirport(airport, setToQuery, setToIcao, setToResults)
                                        }
                                        style={{
                                            textAlign: "left",
                                            background: "transparent",
                                            border: "none",
                                            color: "var(--atc-text)",
                                            cursor: "pointer",
                                            fontSize: 12,
                                        }}
                                    >
                                        {airport.icao} · {airport.name} ({airport.city})
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
                        <input
                            type="date"
                            value={departureDate}
                            onChange={(event) => setDepartureDate(event.target.value)}
                            style={{
                                border: "1px solid var(--atc-border)",
                                borderRadius: 12,
                                padding: "10px 12px",
                                fontSize: 13,
                                background: "rgba(12, 16, 26, 0.95)",
                                color: "var(--atc-text)",
                            }}
                        />
                        <input
                            type="time"
                            value={departureTime}
                            onChange={(event) => setDepartureTime(event.target.value)}
                            style={{
                                border: "1px solid var(--atc-border)",
                                borderRadius: 12,
                                padding: "10px 12px",
                                fontSize: 13,
                                background: "rgba(12, 16, 26, 0.95)",
                                color: "var(--atc-text)",
                            }}
                        />
                    </div>
                    <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
                        <input
                            type="date"
                            value={arrivalDate}
                            onChange={(event) => setArrivalDate(event.target.value)}
                            style={{
                                border: "1px solid var(--atc-border)",
                                borderRadius: 12,
                                padding: "10px 12px",
                                fontSize: 13,
                                background: "rgba(12, 16, 26, 0.95)",
                                color: "var(--atc-text)",
                            }}
                        />
                        <input
                            type="time"
                            value={arrivalTime}
                            onChange={(event) => setArrivalTime(event.target.value)}
                            style={{
                                border: "1px solid var(--atc-border)",
                                borderRadius: 12,
                                padding: "10px 12px",
                                fontSize: 13,
                                background: "rgba(12, 16, 26, 0.95)",
                                color: "var(--atc-text)",
                            }}
                        />
                    </div>
                    <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
                        <input
                            type="number"
                            placeholder="Скорость (kt)"
                            value={speed}
                            onChange={(event) => setSpeed(event.target.value)}
                            style={{
                                border: "1px solid var(--atc-border)",
                                borderRadius: 12,
                                padding: "10px 12px",
                                fontSize: 13,
                                background: "rgba(12, 16, 26, 0.95)",
                                color: "var(--atc-text)",
                            }}
                        />
                        <input
                            type="number"
                            placeholder="Высота (ft)"
                            value={altitude}
                            onChange={(event) => setAltitude(event.target.value)}
                            style={{
                                border: "1px solid var(--atc-border)",
                                borderRadius: 12,
                                padding: "10px 12px",
                                fontSize: 13,
                                background: "rgba(12, 16, 26, 0.95)",
                                color: "var(--atc-text)",
                            }}
                        />
                    </div>
                    <div style={{ display: "grid", gap: 6 }}>
                        <select
                            value={priority}
                            onChange={(event) => setPriority(event.target.value)}
                            style={{
                                border: "1px solid var(--atc-border)",
                                borderRadius: 12,
                                padding: "10px 12px",
                                fontSize: 13,
                                background: "rgba(12, 16, 26, 0.95)",
                                color: "var(--atc-text)",
                            }}
                        >
                            <option value="NORMAL">Приоритет: NORMAL</option>
                            <option value="HIGH">Приоритет: HIGH</option>
                            <option value="EMERGENCY">Приоритет: EMERGENCY</option>
                        </select>
                    </div>

                    {localError && (
                        <div style={{ fontSize: 12, color: "#ffb3b3" }}>{localError}</div>
                    )}
                    {error && (
                        <div style={{ fontSize: 12, color: "#ffb3b3" }}>{error}</div>
                    )}

                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                        <button
                            type="button"
                            onClick={onClose}
                            style={{
                                border: "1px solid var(--atc-border)",
                                borderRadius: 12,
                                padding: "10px 12px",
                                fontSize: 13,
                                background: "rgba(17, 23, 35, 0.9)",
                                color: "var(--atc-text)",
                                cursor: "pointer",
                            }}
                        >
                            Отмена
                        </button>
                        <button
                            type="submit"
                            disabled={busy}
                            style={{
                                border: "1px solid var(--atc-border)",
                                borderRadius: 12,
                                padding: "10px 12px",
                                fontSize: 13,
                                fontWeight: 800,
                                background: "var(--atc-accent)",
                                color: "#fff",
                                cursor: "pointer",
                                opacity: busy ? 0.7 : 1,
                            }}
                        >
                            {mode === "create" ? "Создать" : "Сохранить"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function ATCScreen({
    status,
    dispatcherName,
    currentUser,
    flights,
    mapFlights,
    zones,
    flightsError,
    onRefresh,
    onCreateFlight,
    onUpdateFlight,
    onDeleteFlight,
    onLogout,
    onAirportSearch,
    onFetchOnlineDispatchers,
    onRequestTransfer,
    onFetchPendingTransfers,
    onRespondTransfer,
    onToggleFlightLock,
    onFetchDispatchers,
    onDeleteDispatcher,
    onFetchLogs,
    onLogEvent,
}) {
    const [tab, setTab] = useState("flights");
    const [hoveredTab, setHoveredTab] = useState(null);
    const [selectedFlightId, setSelectedFlightId] = useState(null);
    const [showFlightPanel, setShowFlightPanel] = useState(true);
    const [modalState, setModalState] = useState(null);
    const [modalBusy, setModalBusy] = useState(false);
    const [modalError, setModalError] = useState("");
    const [panelError, setPanelError] = useState("");
    const [flightQuery, setFlightQuery] = useState("");
    const [routeFlightId, setRouteFlightId] = useState(null);
    const [showMapInfo, setShowMapInfo] = useState(true);
    const [flightScope, setFlightScope] = useState("zone");
    const [ownerFilter, setOwnerFilter] = useState(null);
    const [transferTargets, setTransferTargets] = useState([]);
    const [transferBusy, setTransferBusy] = useState(false);
    const [transferError, setTransferError] = useState("");
    const [showTransferPicker, setShowTransferPicker] = useState(false);
    const [pendingTransfers, setPendingTransfers] = useState([]);
    const [conflictFlights, setConflictFlights] = useState([]);
    const [conflictAlerts, setConflictAlerts] = useState([]);
    const [conflictFocus, setConflictFocus] = useState(null);
    const [adminPanelOpen, setAdminPanelOpen] = useState(false);
    const [adminTab, setAdminTab] = useState("dispatchers");
    const [dispatchers, setDispatchers] = useState([]);
    const [logs, setLogs] = useState([]);
    const [adminBusy, setAdminBusy] = useState(false);
    const conflictStateRef = useRef(new Map());
    const [notificationsOpen, setNotificationsOpen] = useState(false);
    const [dismissedNotifications, setDismissedNotifications] = useState([]);
    const zonePresenceRef = useRef(new Map());
    const [zoneAlerts, setZoneAlerts] = useState([]);

    const tabBtn = (isActive, isHovered) => ({
        border: "1px solid var(--atc-border)",
        padding: "9px 12px",
        borderRadius: 12,
        cursor: "pointer",
        fontWeight: 800,
        letterSpacing: "0.02em",
        background: isActive ? "var(--atc-accent)" : "rgba(17, 23, 35, 0.9)",
        color: isActive ? "#f6f8ff" : "var(--atc-text)",
        boxShadow: isActive
            ? "0 8px 18px rgba(24, 40, 120, 0.35)"
            : "0 4px 10px rgba(0,0,0,0.25)",
        transform: isHovered && !isActive ? "translateY(-1px)" : "translateY(0)",
        transition: "all 0.15s ease",
    });

    const actionBtn = (tone) => ({
        border: "1px solid var(--atc-border)",
        padding: "6px 10px",
        borderRadius: 10,
        cursor: "pointer",
        fontWeight: 700,
        fontSize: 12,
        background:
            tone === "danger"
                ? "rgba(140, 40, 40, 0.65)"
                : "rgba(17, 23, 35, 0.85)",
        color: "var(--atc-text)",
        transition: "all 0.15s ease",
    });

    const panelWrap = {
        background: "var(--atc-panel)",
        border: "1px solid var(--atc-border)",
        borderRadius: 16,
        padding: 12,
        display: "grid",
        gap: 10,
    };

    const card = {
        background: "var(--atc-card)",
        border: "1px solid var(--atc-border)",
        borderRadius: 14,
        padding: "12px 14px",
        boxShadow: "0 10px 22px rgba(0,0,0,0.3)",
    };

    const chip = (tone) => ({
        padding: "4px 8px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        background:
            tone === "alert"
                ? "var(--atc-alert)"
                : tone === "info"
                ? "var(--atc-info)"
                : "var(--atc-chip)",
        color:
            tone === "alert"
                ? "var(--atc-alert-text)"
                : tone === "info"
                ? "var(--atc-info-text)"
                : "var(--atc-chip-text)",
    });

    const getZoneStyle = (zone) => {
        const occupied = Boolean(zone.dispatcher);
        const isRegion = zone.type === "moscow_region";
        const stroke = occupied ? "rgba(120, 255, 178, 0.65)" : "rgba(120, 160, 255, 0.45)";
        const fill = occupied ? "rgba(120, 255, 178, 0.08)" : "rgba(120, 160, 255, 0.08)";
        return {
            color: stroke,
            weight: isRegion ? 2 : 1,
            fillColor: fill,
            fillOpacity: isRegion ? 0.08 : 0.18,
        };
    };

    const getZoneTower = (zone) => {
        const occupied = Boolean(zone.dispatcher);
        const size = zone.type === "moscow_region" ? 28 : 22;
        const color = occupied ? "#7cffb2" : "#9bb0d0";
        return getZoneTowerIcon(size, color);
    };

    const isAdmin = currentUser?.role === "admin";
    const zonesById = useMemo(() => {
        const map = new Map();
        (zones || []).forEach((zone) => map.set(zone.id, zone));
        return map;
    }, [zones]);
    const moscowRegion = zonesById.get("moscow_region") || null;
    const moscowAirports = useMemo(
        () => (zones || []).filter((zone) => zone.parentId === "moscow_region"),
        [zones]
    );
    const userZone = currentUser?.zoneId ? zonesById.get(currentUser.zoneId) : null;

    const priorityRank = (priority) => {
        if (priority === "EMERGENCY") return 0;
        if (priority === "HIGH") return 1;
        return 2;
    };

    const getFlightZone = useCallback(
        (position) => {
            if (!position) return null;
            const airportZone = moscowAirports.find((zone) => isPointInZone(position, zone));
            if (airportZone) return airportZone;
            if (moscowRegion && isPointInZone(position, moscowRegion)) return moscowRegion;
            return (zones || []).find(
                (zone) =>
                    !zone.parentId &&
                    zone.id !== moscowRegion?.id &&
                    isPointInZone(position, zone)
            ) || null;
        },
        [moscowAirports, moscowRegion, zones]
    );

    const isFlightInUserZone = useCallback(
        (flight) => {
            if (!flight?.position || !userZone) return false;
            const position = flight.position;
            if (!isPointInZone(position, userZone)) return false;
            if (userZone.id === "moscow_region") {
                const occupiedAirport = moscowAirports.find(
                    (zone) => zone.dispatcher && isPointInZone(position, zone)
                );
                return !occupiedAirport;
            }
            return true;
        },
        [userZone, moscowAirports]
    );

    const mapFlightById = useMemo(() => {
        const map = new Map();
        mapFlights.forEach((flight) => map.set(flight.id, flight));
        return map;
    }, [mapFlights]);

    const filteredFlights = useMemo(() => {
        const query = flightQuery.trim().toLowerCase();
        const baseList = ownerFilter
            ? flights.filter((flight) => flight.ownerId === ownerFilter.id)
            : flights;
        const zoneScoped =
            flightScope === "zone" && userZone && !isAdmin
                ? baseList.filter((flight) => isFlightInUserZone(mapFlightById.get(flight.id)))
                : baseList;
        const list = !query
            ? zoneScoped
            : zoneScoped.filter((flight) => {
                  const callsign = flight.callsign.toLowerCase();
                  const fromIcao = flight.fromIcao.toLowerCase();
                  const toIcao = flight.toIcao.toLowerCase();
                  const statusLabel = formatStatusLabel(flight.status).toLowerCase();
                  const phase = (flight.phase || "").toLowerCase();
                  return (
                      callsign.includes(query) ||
                      fromIcao.includes(query) ||
                      toIcao.includes(query) ||
                      statusLabel.includes(query) ||
                      phase.includes(query)
                  );
              });
        return [...list].sort((a, b) => {
            const aConflict = conflictFlights.includes(a.id) ? 0 : 1;
            const bConflict = conflictFlights.includes(b.id) ? 0 : 1;
            if (aConflict !== bConflict) return aConflict - bConflict;

            const aAwait = a.awaitingAtc ? 0 : 1;
            const bAwait = b.awaitingAtc ? 0 : 1;
            if (aAwait !== bAwait) return aAwait - bAwait;

            const aPriority = priorityRank(a.priority);
            const bPriority = priorityRank(b.priority);
            if (aPriority !== bPriority) return aPriority - bPriority;

            const aDeparture = Number.isFinite(a.departureUtc) ? a.departureUtc : 0;
            const bDeparture = Number.isFinite(b.departureUtc) ? b.departureUtc : 0;
            if (aDeparture !== bDeparture) return aDeparture - bDeparture;

            return a.callsign.localeCompare(b.callsign);
        });
    }, [
        flightQuery,
        flights,
        ownerFilter,
        conflictFlights,
        flightScope,
        userZone,
        isAdmin,
        isFlightInUserZone,
        mapFlightById,
    ]);

    const notificationItems = useMemo(() => {
        const transfers = pendingTransfers.map((flight) => ({
            id: `transfer:${flight.id}`,
            type: "transfer",
            title: "Передача рейса",
            message: `${flight.callsign} · ${flight.fromIcao} → ${flight.toIcao}`,
            flightId: flight.id,
        }));
        const conflicts = conflictAlerts.map((alert) => ({
            id: `conflict:${alert.id}`,
            type: "conflict",
            title: "Потенциальный конфликт",
            message: `${alert.callsignA} ↔ ${alert.callsignB} (${alert.distance} км)`,
            flightId: alert.flightIdA || null,
        }));
        const zoneEvents = zoneAlerts.map((alert) => ({
            id: `zone:${alert.id}`,
            type: "zone",
            title: alert.type === "enter" ? "Рейс вошел в зону" : "Рейс покинул зону",
            message: `${alert.callsign} · ${alert.zoneName}`,
            flightId: alert.flightId || null,
        }));
        return [...transfers, ...conflicts, ...zoneEvents];
    }, [pendingTransfers, conflictAlerts, zoneAlerts]);

    const visibleNotifications = useMemo(
        () => notificationItems.filter((item) => !dismissedNotifications.includes(item.id)),
        [notificationItems, dismissedNotifications]
    );

    const selectedFlight =
        filteredFlights.find((flight) => flight.id === selectedFlightId) || filteredFlights[0] || null;

    const activeRouteFlight = useMemo(() => {
        if (!routeFlightId) return null;
        return mapFlights.find((flight) => flight.id === routeFlightId) || null;
    }, [mapFlights, routeFlightId]);

    const selectedMapFlight = useMemo(() => {
        if (!selectedFlightId) return null;
        return mapFlights.find((flight) => flight.id === selectedFlightId) || null;
    }, [mapFlights, selectedFlightId]);

    const selectedZone = useMemo(() => {
        if (!selectedMapFlight?.position) return null;
        return getFlightZone(selectedMapFlight.position);
    }, [selectedMapFlight, getFlightZone]);

    const isInUserZone = isFlightInUserZone(selectedMapFlight);
    const canManage = Boolean(selectedFlight) && (isAdmin || isInUserZone);
    const isLocked = Boolean(selectedFlight?.isLocked);
    const isTransferPending = Boolean(selectedFlight?.transferPending);
    const canEdit = Boolean(selectedFlight) && (isAdmin || (canManage && !isLocked && !isTransferPending));
    const canDelete = canEdit;
    const canTransfer = Boolean(selectedFlight) && (isAdmin || isInUserZone) && (!isLocked || isAdmin) && !isTransferPending;

    useEffect(() => {
        if (!filteredFlights.length) {
            setSelectedFlightId(null);
            setRouteFlightId(null);
            return;
        }
        if (!selectedFlightId || !filteredFlights.some((flight) => flight.id === selectedFlightId)) {
            setSelectedFlightId(filteredFlights[0].id);
        }
        if (routeFlightId && !filteredFlights.some((flight) => flight.id === routeFlightId)) {
            setRouteFlightId(null);
        }
    }, [filteredFlights, selectedFlightId, routeFlightId]);

    useEffect(() => {
        setShowTransferPicker(false);
        setTransferError("");
        setPanelError("");
    }, [selectedFlightId]);

    useEffect(() => {
        const now = Date.now();
        const active = mapFlights.filter((flight) => {
            if (!flight.position || flight.status !== "active") return false;
            const altitudeValue = Number.isFinite(flight.displayAltitude)
                ? flight.displayAltitude
                : flight.altitude;
            return Number.isFinite(altitudeValue);
        });
        const alerts = [];
        const state = new Map(conflictStateRef.current);
        const activePairs = new Set();

        for (let i = 0; i < active.length; i += 1) {
            for (let j = i + 1; j < active.length; j += 1) {
                const first = active[i];
                const second = active[j];
                const firstAlt = Number.isFinite(first.displayAltitude)
                    ? first.displayAltitude
                    : first.altitude;
                const secondAlt = Number.isFinite(second.displayAltitude)
                    ? second.displayAltitude
                    : second.altitude;
                if (!Number.isFinite(firstAlt) || !Number.isFinite(secondAlt)) {
                    continue;
                }
                if (Math.abs(firstAlt - secondAlt) >= 1000) {
                    continue;
                }
                const dist = distanceKm(first.position, second.position);
                if (dist > 1) {
                    continue;
                }
                const key = [first.id, second.id].sort().join(":");
                activePairs.add(key);
                const midpoint = [
                    (first.position[0] + second.position[0]) / 2,
                    (first.position[1] + second.position[1]) / 2,
                ];
                const existing = state.get(key);
                if (!existing || !existing.active) {
                    alerts.push({
                        id: key,
                        flightIdA: first.id,
                        flightIdB: second.id,
                        callsignA: first.callsign,
                        callsignB: second.callsign,
                        distance: Math.round(dist * 10) / 10,
                        midpoint,
                        createdAt: now,
                    });
                }
                state.set(key, {
                    active: true,
                    clearAfter: null,
                    flightIds: [first.id, second.id],
                    callsignA: first.callsign,
                    callsignB: second.callsign,
                    midpoint,
                });
            }
        }

        for (const [key, entry] of state.entries()) {
            if (activePairs.has(key)) continue;
            if (!entry.active) continue;
            if (!entry.clearAfter) {
                state.set(key, { ...entry, clearAfter: now + 10000 });
                continue;
            }
            if (now >= entry.clearAfter) {
                state.set(key, { ...entry, active: false, clearAfter: null });
            }
        }

        const conflictSet = new Set();
        for (const entry of state.values()) {
            if (entry.active && entry.flightIds) {
                entry.flightIds.forEach((id) => conflictSet.add(id));
            }
        }

        conflictStateRef.current = state;
        setConflictFlights(Array.from(conflictSet));
        if (alerts.length > 0) {
            setConflictAlerts((prev) => {
                const merged = [...alerts, ...prev];
                const deduped = merged.filter(
                    (item, index, arr) => arr.findIndex((entry) => entry.id === item.id) === index
                );
                return deduped.slice(0, 6);
            });
        }
    }, [mapFlights]);

    useEffect(() => {
        if (!userZone || isAdmin) {
            zonePresenceRef.current = new Map();
            return;
        }
        const now = Date.now();
        const prev = zonePresenceRef.current;
        const next = new Map();
        const alerts = [];

        mapFlights.forEach((flight) => {
            if (!flight.position) return;
            const inZone = isFlightInUserZone(flight);
            const prevEntry = prev.get(flight.id);

            if (!prevEntry) {
                next.set(flight.id, { state: inZone, pending: null, pendingAt: null });
                return;
            }

            if (inZone !== prevEntry.state) {
                if (prevEntry.pending === inZone) {
                    if (now - prevEntry.pendingAt >= 10000) {
                        next.set(flight.id, { state: inZone, pending: null, pendingAt: null });
                        alerts.push({
                            id: `${flight.id}:${inZone ? "enter" : "exit"}:${now}`,
                            flightId: flight.id,
                            callsign: flight.callsign,
                            type: inZone ? "enter" : "exit",
                            zoneName: userZone.name,
                            createdAt: now,
                        });
                        if (onLogEvent) {
                            onLogEvent({
                                actionType: inZone ? "zone_enter" : "zone_exit",
                                entityType: "flight",
                                entityId: flight.id,
                                summary: `Рейс ${flight.callsign} ${
                                    inZone ? "вошел" : "покинул"
                                } зону ${userZone.name}`,
                            }).catch(() => {});
                        }
                    } else {
                        next.set(flight.id, prevEntry);
                    }
                } else {
                    next.set(flight.id, { state: prevEntry.state, pending: inZone, pendingAt: now });
                }
            } else if (prevEntry.pending) {
                next.set(flight.id, { state: inZone, pending: null, pendingAt: null });
            } else {
                next.set(flight.id, prevEntry);
            }
        });

        zonePresenceRef.current = next;
        if (alerts.length) {
            setZoneAlerts((prevAlerts) => {
                const merged = [...alerts, ...prevAlerts];
                const deduped = merged.filter(
                    (item, index, arr) => arr.findIndex((entry) => entry.id === item.id) === index
                );
                return deduped.slice(0, 6);
            });
        }
    }, [userZone, isAdmin, mapFlights, isFlightInUserZone, onLogEvent]);

    useEffect(() => {
        if (!conflictAlerts.length) return;
        const timer = setInterval(() => {
            const now = Date.now();
            setConflictAlerts((prev) => prev.filter((alert) => now - alert.createdAt < 15000));
        }, 2000);
        return () => clearInterval(timer);
    }, [conflictAlerts.length]);

    useEffect(() => {
        if (!zoneAlerts.length) return;
        const timer = setInterval(() => {
            const now = Date.now();
            setZoneAlerts((prev) => prev.filter((alert) => now - alert.createdAt < 15000));
        }, 2000);
        return () => clearInterval(timer);
    }, [zoneAlerts.length]);

    useEffect(() => {
        if (!notificationsOpen) return;
        const handleClick = (event) => {
            if (!event.target.closest("[data-notifications-root]")) {
                setNotificationsOpen(false);
            }
        };
        window.addEventListener("click", handleClick);
        return () => window.removeEventListener("click", handleClick);
    }, [notificationsOpen]);

    useEffect(() => {
        if (!currentUser || !onFetchPendingTransfers) return;
        let isMounted = true;

        const loadPending = async () => {
            try {
                const data = await onFetchPendingTransfers();
                if (isMounted) {
                    setPendingTransfers(Array.isArray(data) ? data : []);
                }
            } catch {
                if (isMounted) {
                    setPendingTransfers([]);
                }
            }
        };

        loadPending();
        const timer = setInterval(loadPending, 3000);
        return () => {
            isMounted = false;
            clearInterval(timer);
        };
    }, [currentUser, onFetchPendingTransfers]);

    useEffect(() => {
        if (!showTransferPicker || !onFetchOnlineDispatchers) return;
        let isMounted = true;
        setTransferBusy(true);
        setTransferError("");
        onFetchOnlineDispatchers()
            .then((data) => {
                if (isMounted) {
                    setTransferTargets(Array.isArray(data) ? data : []);
                }
            })
            .catch(() => {
                if (isMounted) {
                    setTransferTargets([]);
                    setTransferError("Не удалось загрузить диспетчеров.");
                }
            })
            .finally(() => {
                if (isMounted) {
                    setTransferBusy(false);
                }
            });

        return () => {
            isMounted = false;
        };
    }, [showTransferPicker, onFetchOnlineDispatchers]);

    useEffect(() => {
        if (!adminPanelOpen || !isAdmin) return;
        let isMounted = true;
        setAdminBusy(true);
        Promise.all([onFetchDispatchers?.(), onFetchLogs?.()])
            .then(([dispatchersData, logsData]) => {
                if (isMounted) {
                    setDispatchers(Array.isArray(dispatchersData) ? dispatchersData : []);
                    setLogs(Array.isArray(logsData) ? logsData : []);
                }
            })
            .catch(() => {
                if (isMounted) {
                    setDispatchers([]);
                    setLogs([]);
                }
            })
            .finally(() => {
                if (isMounted) {
                    setAdminBusy(false);
                }
            });

        return () => {
            isMounted = false;
        };
    }, [adminPanelOpen, isAdmin, onFetchDispatchers, onFetchLogs]);

    const handleModalSubmit = async (payload) => {
        if (!modalState) return;
        setModalBusy(true);
        setModalError("");
        try {
            if (modalState.mode === "create") {
                await onCreateFlight(payload);
            } else {
                await onUpdateFlight(modalState.flight.id, payload);
            }
            setModalState(null);
        } catch (error) {
            setModalError(describeFlightError(error.message));
        } finally {
            setModalBusy(false);
        }
    };

    const handleQuickUpdate = async (flightId, payload) => {
        if (!flightId) return;
        setPanelError("");
        try {
            await onUpdateFlight(flightId, payload);
        } catch (error) {
            setPanelError(describeFlightError(error.message));
        }
    };

    const handleTransferResponse = async (flightId, action) => {
        if (!onRespondTransfer) return;
        try {
            await onRespondTransfer(flightId, action);
            setPendingTransfers((prev) => prev.filter((flight) => flight.id !== flightId));
            onRefresh();
        } catch (error) {
            setPanelError(describeFlightError(error.message));
        }
    };

    return (
        <div
            style={{
                background: "var(--atc-bg)",
                borderRadius: 16,
                padding: 14,
                color: "var(--atc-text)",
                minHeight: "100%",
                height: "100%",
                overflow: "hidden",
                border: "1px solid var(--atc-border)",
                boxShadow: "0 20px 40px rgba(0,0,0,0.35)",
                display: "flex",
                flexDirection: "column",
                gap: 12,
                position: "relative",
            }}
        >
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, position: "relative", zIndex: 5 }}>
                <div style={{ fontWeight: 900, fontSize: 18 }}>ATC Console</div>
                <div style={{ fontSize: 12, opacity: 0.7, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    Status: {status}
                </div>
                {dispatcherName && (
                    <div style={{ fontSize: 12, opacity: 0.7 }}>Диспетчер: {dispatcherName}</div>
                )}
                {currentUser?.zoneName && (
                    <div style={{ fontSize: 12, opacity: 0.7 }}>Зона: {currentUser.zoneName}</div>
                )}
                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
                    {visibleNotifications.length > 0 && (
                        <div data-notifications-root style={{ position: "relative" }}>
                            <button
                                onClick={(event) => {
                                    event.stopPropagation();
                                    setNotificationsOpen((prev) => !prev);
                                }}
                                style={{
                                    border: "1px solid var(--atc-border)",
                                    borderRadius: 999,
                                    padding: "4px 10px",
                                    fontSize: 12,
                                    fontWeight: 800,
                                    background: "rgba(17, 23, 35, 0.85)",
                                    color: "var(--atc-text)",
                                    cursor: "pointer",
                                    position: "relative",
                                }}
                                title="Центр уведомлений"
                            >
                                !
                                <span
                                    style={{
                                        position: "absolute",
                                        top: -6,
                                        right: -6,
                                        background: "rgba(255, 96, 96, 0.95)",
                                        color: "#0b0f1a",
                                        borderRadius: 999,
                                        padding: "2px 6px",
                                        fontSize: 9,
                                        fontWeight: 800,
                                    }}
                                >
                                    {visibleNotifications.length}
                                </span>
                            </button>
                            {notificationsOpen && (
                                <div
                                    style={{
                                        position: "absolute",
                                        top: 30,
                                        right: 0,
                                        width: 280,
                                        maxHeight: 320,
                                        overflow: "auto",
                                        background: "rgba(18, 24, 36, 0.95)",
                                        border: "1px solid var(--atc-border)",
                                        borderRadius: 12,
                                        padding: 10,
                                        display: "grid",
                                        gap: 8,
                                        zIndex: 20000,
                                    }}
                                >
                                    {visibleNotifications.map((item) => (
                                            <button
                                                key={item.id}
                                                onClick={() => {
                                                    if (item.flightId) {
                                                        setSelectedFlightId(item.flightId);
                                                        setShowFlightPanel(true);
                                                    }
                                                }}
                                                style={{
                                                    textAlign: "left",
                                                    border: "1px solid var(--atc-border)",
                                                    borderRadius: 10,
                                                    padding: "8px 10px",
                                                    background: "rgba(12, 16, 26, 0.9)",
                                                    color: "var(--atc-text)",
                                                    cursor: "pointer",
                                                    display: "grid",
                                                    gap: 4,
                                                }}
                                            >
                                                <div style={{ fontWeight: 800, fontSize: 12 }}>{item.title}</div>
                                                <div style={{ fontSize: 11, opacity: 0.8 }}>{item.message}</div>
                                                {item.type === "conflict" && (
                                                    <button
                                                        type="button"
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            setDismissedNotifications((prev) => [...prev, item.id]);
                                                        }}
                                                        style={{
                                                            alignSelf: "flex-start",
                                                            border: "none",
                                                            background: "transparent",
                                                            color: "var(--atc-muted)",
                                                            fontSize: 10,
                                                            cursor: "pointer",
                                                            padding: 0,
                                                        }}
                                                    >
                                                        Скрыть
                                                    </button>
                                                )}
                                            </button>
                                        ))}
                                    {visibleNotifications.length === 0 && (
                                        <div style={{ fontSize: 11, opacity: 0.7 }}>Нет активных событий.</div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* ATC header */}
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    padding: 8,
                    borderRadius: 14,
                    background: "rgba(16, 22, 34, 0.9)",
                    alignItems: "center",
                    border: "1px solid var(--atc-border)",
                    position: "relative",
                    zIndex: 4,
                }}
            >
                <button
                    style={tabBtn(tab === "flights", hoveredTab === "flights")}
                    onClick={() => setTab("flights")}
                    onMouseEnter={() => setHoveredTab("flights")}
                    onMouseLeave={() => setHoveredTab(null)}
                >
                    Рейсы
                </button>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                        style={tabBtn(false, false)}
                        onClick={() => {
                            setModalState({ mode: "create", flight: null });
                            setModalError("");
                        }}
                    >
                        Добавить рейс
                    </button>
                    <button style={tabBtn(false, false)} onClick={onRefresh}>
                        Обновить
                    </button>
                    {isAdmin && (
                        <button style={tabBtn(false, false)} onClick={() => setAdminPanelOpen(true)}>
                            Админ
                        </button>
                    )}
                    {!showFlightPanel && (
                        <button style={tabBtn(false, false)} onClick={() => setShowFlightPanel(true)}>
                            Показать панель
                        </button>
                    )}
                    <button style={tabBtn(false, false)} onClick={onLogout}>
                        Выйти
                    </button>
                </div>
            </div>

            {(pendingTransfers.length > 0 || conflictAlerts.length > 0 || zoneAlerts.length > 0) && (
                <div
                    style={{
                        position: "absolute",
                        top: 76,
                        right: 20,
                        zIndex: 20000,
                        display: "grid",
                        gap: 8,
                        width: 340,
                    }}
                >
                    {pendingTransfers.map((flight) => (
                        <div
                            key={`transfer-${flight.id}`}
                            style={{
                                ...card,
                                padding: 12,
                                display: "grid",
                                gap: 6,
                                background: "rgba(22, 28, 40, 0.95)",
                            }}
                        >
                            <div style={{ fontWeight: 800, fontSize: 12 }}>Передача рейса</div>
                            <div style={{ fontSize: 11, opacity: 0.75 }}>
                                {flight.callsign} · {flight.fromIcao} → {flight.toIcao}
                            </div>
                            <div style={{ display: "flex", gap: 6 }}>
                                <button
                                    style={{ ...actionBtn(), padding: "8px 12px", fontSize: 12 }}
                                    onClick={() => handleTransferResponse(flight.id, "accept")}
                                >
                                    Принять
                                </button>
                                <button
                                    style={{ ...actionBtn("danger"), padding: "8px 12px", fontSize: 12 }}
                                    onClick={() => handleTransferResponse(flight.id, "decline")}
                                >
                                    Отказать
                                </button>
                            </div>
                        </div>
                    ))}
                    {conflictAlerts.map((alert) => (
                        <div
                            key={alert.id}
                            style={{
                                ...card,
                                padding: 12,
                                display: "grid",
                                gap: 6,
                                background: "rgba(40, 16, 20, 0.92)",
                                border: "1px solid rgba(255, 90, 90, 0.6)",
                            }}
                        >
                            <div style={{ fontWeight: 800, fontSize: 12 }}>Сближение рейсов</div>
                            <div style={{ fontSize: 11, opacity: 0.85 }}>
                                {alert.callsignA} ↔ {alert.callsignB}
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                                <div style={{ fontSize: 11, opacity: 0.7 }}>
                                    Дистанция: {alert.distance} км
                                </div>
                                <button
                                    style={{ ...actionBtn(), padding: "6px 10px", fontSize: 11 }}
                                    onClick={() => {
                                        if (alert.midpoint) {
                                            setConflictFocus([alert.midpoint[0], alert.midpoint[1]]);
                                        }
                                    }}
                                >
                                    Показать
                                </button>
                            </div>
                        </div>
                    ))}
                    {zoneAlerts.map((alert) => (
                        <div
                            key={alert.id}
                            style={{
                                ...card,
                                padding: 12,
                                display: "grid",
                                gap: 6,
                                background: "rgba(18, 24, 36, 0.9)",
                            }}
                        >
                            <div style={{ fontWeight: 800, fontSize: 12 }}>
                                {alert.type === "enter" ? "Вход в зону" : "Выход из зоны"}
                            </div>
                            <div style={{ fontSize: 11, opacity: 0.75 }}>
                                {alert.callsign} · {alert.zoneName}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {flightsError && (
                <div style={{ fontSize: 12, color: "#ffb3b3" }}>
                    Ошибка загрузки рейсов: {flightsError}
                </div>
            )}

            {tab === "flights" && (
                <div style={{ display: "grid", gap: 12, flex: 1, minHeight: 0, overflow: "hidden" }}>
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: showFlightPanel
                                ? "clamp(200px, 22vw, 240px) minmax(0, 1fr) clamp(300px, 28vw, 360px)"
                                : "clamp(200px, 22vw, 240px) minmax(0, 1fr)",
                            gap: 12,
                            flex: 1,
                            minHeight: 0,
                            overflow: "hidden",
                            transition: "grid-template-columns 0.2s ease",
                        }}
                    >
                    <div
                        style={{
                            ...panelWrap,
                            padding: 10,
                            minHeight: 0,
                            overflow: "hidden",
                            display: "grid",
                            gridTemplateRows: "auto auto minmax(0, 1fr)",
                            gap: 8,
                        }}
                    >
                        <div style={{ fontWeight: 900, fontSize: 13 }}>Список рейсов</div>
                        {userZone && !isAdmin && (
                            <div style={{ display: "flex", gap: 6 }}>
                                <button
                                    style={{
                                        ...chip(flightScope === "zone" ? "info" : undefined),
                                        border: "1px solid var(--atc-border)",
                                        cursor: "pointer",
                                    }}
                                    onClick={() => setFlightScope("zone")}
                                >
                                    В моей зоне
                                </button>
                                <button
                                    style={{
                                        ...chip(flightScope === "all" ? "info" : undefined),
                                        border: "1px solid var(--atc-border)",
                                        cursor: "pointer",
                                    }}
                                    onClick={() => setFlightScope("all")}
                                >
                                    Все рейсы
                                </button>
                            </div>
                        )}
                        {!userZone && !isAdmin && (
                            <div style={{ fontSize: 11, opacity: 0.7 }}>
                                Зона диспетчера не выбрана.
                            </div>
                        )}
                        {ownerFilter && (
                            <div
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 6,
                                    fontSize: 11,
                                    opacity: 0.8,
                                }}
                            >
                                <span>Фильтр: {ownerFilter.name}</span>
                                <button
                                    style={actionBtn()}
                                    onClick={() => setOwnerFilter(null)}
                                >
                                    Сбросить
                                </button>
                            </div>
                        )}
                        <input
                            placeholder="Поиск (позывной/статус/ВПП...)"
                            value={flightQuery}
                            onChange={(event) => setFlightQuery(event.target.value)}
                            style={{
                                border: "1px solid var(--atc-border)",
                                borderRadius: 10,
                                padding: "6px 8px",
                                fontSize: 11,
                                lineHeight: "16px",
                                height: 30,
                                background: "rgba(12, 16, 26, 0.95)",
                                color: "var(--atc-text)",
                            }}
                        />
                        <div
                            style={{
                                minHeight: 0,
                                overflow: "auto",
                                display: "grid",
                                gap: 6,
                                alignContent: "start",
                            }}
                        >
                            {!filteredFlights.length ? (
                                <div style={{ fontSize: 11, opacity: 0.7, paddingTop: 4 }}>
                                    Нет активных рейсов.
                                </div>
                            ) : (
                                filteredFlights.map((flight) => {
                                    const isActive = flight.id === selectedFlightId;
                                    const isConflict = conflictFlights.includes(flight.id);
                                    const priority = flight.priority || "NORMAL";
                                    const sim = mapFlightById.get(flight.id);
                                    const displaySpeed = Number.isFinite(sim?.displaySpeed)
                                        ? sim.displaySpeed
                                        : flight.speed;
                                    const displayAltitude = Number.isFinite(sim?.displayAltitude)
                                        ? sim.displayAltitude
                                        : flight.altitude;
                                    const priorityAccent =
                                        priority === "EMERGENCY"
                                            ? "rgba(255, 96, 96, 0.95)"
                                            : priority === "HIGH"
                                            ? "rgba(255, 176, 88, 0.95)"
                                            : "rgba(130, 150, 180, 0.7)";
                                    const priorityStyle =
                                        priority === "EMERGENCY"
                                            ? {
                                                  background: "rgba(72, 26, 32, 0.95)",
                                                  border: `1px solid ${priorityAccent}`,
                                                  boxShadow: "0 0 16px rgba(255, 96, 96, 0.35)",
                                              }
                                            : priority === "HIGH"
                                            ? {
                                                  background: "rgba(62, 46, 20, 0.92)",
                                                  border: `1px solid ${priorityAccent}`,
                                                  boxShadow: "0 0 14px rgba(255, 176, 88, 0.25)",
                                              }
                                            : {
                                                  background: "rgba(18, 24, 36, 0.92)",
                                                  border: "1px solid rgba(255, 255, 255, 0.05)",
                                                  boxShadow: "0 4px 12px rgba(0,0,0,0.28)",
                                              };
                                    return (
                                        <button
                                            key={flight.id}
                                            onClick={() => {
                                                setSelectedFlightId(flight.id);
                                                setRouteFlightId((current) =>
                                                    current === flight.id ? null : flight.id
                                                );
                                            }}
                                            style={{
                                                textAlign: "left",
                                                border: isConflict
                                                    ? "1px solid rgba(255, 90, 90, 0.9)"
                                                    : priorityStyle.border,
                                                borderRadius: 12,
                                                padding: "12px 12px",
                                                height: 92,
                                                background: isActive
                                                    ? "linear-gradient(120deg, rgba(74, 99, 255, 0.95), rgba(32, 40, 70, 0.92))"
                                                    : priorityStyle.background,
                                                color: "var(--atc-text)",
                                                cursor: "pointer",
                                                boxShadow: isConflict
                                                    ? "0 0 16px rgba(255, 90, 90, 0.45)"
                                                    : priorityStyle.boxShadow,
                                                outline: isActive ? `1px solid ${priorityAccent}` : "none",
                                            }}
                                        >
                                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                <div style={{ fontWeight: 800, fontSize: 13, lineHeight: "16px" }}>
                                                    {flight.callsign}
                                                </div>
                                                {isConflict && (
                                                    <span
                                                        style={{
                                                            fontSize: 12,
                                                            color: "#ff9a7a",
                                                            textShadow: "0 0 6px rgba(255, 120, 100, 0.6)",
                                                        }}
                                                    >
                                                        ⚠
                                                    </span>
                                                )}
                                                <span
                                                    style={{
                                                        fontSize: 10,
                                                        padding: "3px 8px",
                                                        borderRadius: 999,
                                                        background: getPriorityBadgeColor(flight.priority),
                                                        color: "#0b0f1a",
                                                        fontWeight: 700,
                                                    }}
                                                >
                                                    {flight.priority || "NORMAL"}
                                                </span>
                                            </div>
                                            <div style={{ fontSize: 11, opacity: 0.8 }}>
                                                {flight.fromIcao} → {flight.toIcao}
                                            </div>
                                            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                                                <span
                                                    style={{
                                                        fontSize: 10,
                                                        padding: "3px 8px",
                                                        borderRadius: 999,
                                                        background: getPhaseBadgeColor(flight.phase),
                                                        color: "#0b0f1a",
                                                        fontWeight: 700,
                                                    }}
                                                >
                                                    {flight.phase || formatStatusLabel(flight.status)}
                                                </span>
                                                {flight.awaitingAtc && (
                                                    <span
                                                        style={{
                                                            fontSize: 10,
                                                            padding: "3px 8px",
                                                            borderRadius: 999,
                                                            background: "rgba(255, 120, 120, 0.85)",
                                                            color: "#0b0f1a",
                                                            fontWeight: 700,
                                                        }}
                                                    >
                                                        Ожидает
                                                    </span>
                                                )}
                                                {flight.transferPending && (
                                                    <span
                                                        style={{
                                                            fontSize: 10,
                                                            padding: "3px 8px",
                                                            borderRadius: 999,
                                                            background: "rgba(255, 205, 120, 0.9)",
                                                            color: "#0b0f1a",
                                                            fontWeight: 700,
                                                        }}
                                                    >
                                                        Передача
                                                    </span>
                                                )}
                                                {flight.isLocked && (
                                                    <span
                                                        style={{
                                                            fontSize: 10,
                                                            padding: "3px 8px",
                                                            borderRadius: 999,
                                                            background: "rgba(160, 160, 160, 0.9)",
                                                            color: "#0b0f1a",
                                                            fontWeight: 700,
                                                        }}
                                                    >
                                                        Блок
                                                    </span>
                                                )}
                                            </div>
                                            <div style={{ fontSize: 11, opacity: 0.75 }}>
                                                {Number.isFinite(displaySpeed) ? `${displaySpeed} kt` : "—"} ·{" "}
                                                {Number.isFinite(displayAltitude) ? `${displayAltitude} ft` : "—"}
                                            </div>
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    <div
                        style={{
                            ...panelWrap,
                            minHeight: 0,
                            display: "grid",
                            gridTemplateRows: "auto minmax(0, 1fr)",
                            position: "relative",
                            zIndex: 1,
                        }}
                    >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div>
                                <div style={{ fontWeight: 900, fontSize: 16 }}>Карта сектора</div>
                                <div style={{ fontSize: 12, opacity: 0.7 }}>
                                    Основная карта по центру, рабочее поле диспетчера.
                                </div>
                            </div>
                            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                <button
                                    style={{
                                        ...chip(showMapInfo ? "info" : undefined),
                                        border: "1px solid var(--atc-border)",
                                        cursor: "pointer",
                                    }}
                                    onClick={() => setShowMapInfo((prev) => !prev)}
                                >
                                    Инфо
                                </button>
                                <div style={chip("info")}>12 в секторе</div>
                            </div>
                        </div>
                        <div
                            style={{
                                ...card,
                                minHeight: 0,
                                padding: 0,
                                overflow: "hidden",
                                position: "relative",
                                zIndex: 1,
                            }}
                        >
                            <MapContainer
                                center={[25.2048, 55.2708]}
                                zoom={5}
                                style={{ width: "100%", height: "100%", zIndex: 0 }}
                            >
                                <TileLayer
                                    url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
                                />
                                <MapFocus flight={activeRouteFlight} />
                                <MapFocusPoint point={conflictFocus} />
                                <MapClickHandler onClear={() => setRouteFlightId(null)} />
                                <HeadingRing flight={activeRouteFlight} />
                                {activeRouteFlight?.route?.length > 1 && (
                                    <>
                                        <Marker
                                            position={activeRouteFlight.route[0]}
                                            icon={mapLabelIcon("DEP")}
                                            interactive={false}
                                        />
                                        <Marker
                                            position={activeRouteFlight.route[activeRouteFlight.route.length - 1]}
                                            icon={mapLabelIcon("ARR")}
                                            interactive={false}
                                        />
                                        {activeRouteFlight.todPoint && (
                                            <Marker
                                                position={activeRouteFlight.todPoint}
                                                icon={mapLabelIcon("TOD")}
                                                interactive={false}
                                            >
                                                <Tooltip direction="top" offset={[0, -6]} opacity={0.9}>
                                                    TOD — начало снижения
                                                </Tooltip>
                                            </Marker>
                                        )}
                                    </>
                                )}
                                {(zones || []).flatMap((zone) => [
                                    <Circle
                                        key={`${zone.id}-circle`}
                                        center={[zone.lat, zone.lon]}
                                        radius={zone.radiusKm * 1000}
                                        pathOptions={getZoneStyle(zone)}
                                    />,
                                    <Marker
                                        key={`${zone.id}-tower`}
                                        position={[zone.lat, zone.lon]}
                                        icon={getZoneTower(zone)}
                                    >
                                        <Tooltip direction="top" offset={[0, -8]} opacity={0.95} interactive>
                                            <div style={{ display: "grid", gap: 4, fontSize: 11 }}>
                                                <div style={{ fontWeight: 800 }}>{zone.name}</div>
                                                <div>
                                                    Статус:{" "}
                                                    {zone.dispatcher
                                                        ? `онлайн (${zone.dispatcher.username})`
                                                        : "свободна"}
                                                </div>
                                                <div>
                                                    Тип:{" "}
                                                    {zone.type === "moscow_region"
                                                        ? "регион"
                                                        : zone.type === "moscow_airport"
                                                        ? "аэропорт"
                                                        : "зона"}
                                                </div>
                                            </div>
                                        </Tooltip>
                                    </Marker>,
                                ])}
                                {mapFlights
                                    .filter((flight) => flight.position && flight.route)
                                    .flatMap((flight) => {
                                        const isSelected = flight.id === routeFlightId;
                                        const isConflict = conflictFlights.includes(flight.id);
                                        const baseColor = flight.routeColor || getRadarColor(flight.status);
                                        const mainColor = isSelected ? "#ffd37a" : baseColor;
                                        const marker = (
                                            <Marker
                                                key={`${flight.id}-marker`}
                                                position={flight.position}
                                                icon={getPlaneIcon(flight.heading)}
                                                eventHandlers={{
                                                    click: () => {
                                                        setSelectedFlightId(flight.id);
                                                        setRouteFlightId((current) =>
                                                            current === flight.id ? null : flight.id
                                                        );
                                                    },
                                                }}
                                            >
                                                {isSelected && showMapInfo && (
                                                    <Tooltip
                                                        direction="top"
                                                        offset={[0, -14]}
                                                        opacity={1}
                                                        permanent
                                                        interactive
                                                    >
                                                        <FlightPopup
                                                            flight={flight}
                                                            onClose={() => setRouteFlightId(null)}
                                                        />
                                                    </Tooltip>
                                                )}
                                            </Marker>
                                        );

                                        const conflictRing = isConflict ? (
                                            <CircleMarker
                                                key={`${flight.id}-conflict`}
                                                center={flight.position}
                                                radius={14}
                                                pathOptions={{
                                                    color: "rgba(255, 90, 90, 0.9)",
                                                    weight: 2,
                                                    fillColor: "rgba(255, 90, 90, 0.2)",
                                                    fillOpacity: 0.4,
                                                }}
                                            />
                                        ) : null;

                                        if (!isSelected) {
                                            return [conflictRing, marker].filter(Boolean);
                                        }
                                        return [
                                            conflictRing,
                                            <Polyline
                                                key={`${flight.id}-route-glow`}
                                                positions={flight.route}
                                                pathOptions={{
                                                    color: mainColor,
                                                    weight: isSelected ? 7 : 6,
                                                    opacity: isSelected ? 0.2 : 0.12,
                                                    lineCap: "round",
                                                }}
                                            />,
                                            <Polyline
                                                key={`${flight.id}-route`}
                                                positions={flight.route}
                                                pathOptions={{
                                                    color: mainColor,
                                                    weight: isSelected ? 3 : 2,
                                                    opacity: 0.9,
                                                    lineCap: "round",
                                                }}
                                            />,
                                            marker,
                                        ].filter(Boolean);
                                    })}
                            </MapContainer>
                        </div>
                    </div>

                    {showFlightPanel && (
                        <div style={{ ...panelWrap, minHeight: 0, overflow: "auto" }}>
                            <div style={{ display: "grid", gap: 8 }}>
                                <div>
                                    <div style={{ fontWeight: 900, fontSize: 16 }}>Информация о рейсе</div>
                                    <div style={{ fontSize: 12, opacity: 0.7 }}>
                                        Управление выбранным рейсом.
                                    </div>
                                </div>
                            </div>
                            {selectedFlight ? (
                                <>
                                    {showTransferPicker && (
                                        <div style={{ ...card, display: "grid", gap: 8 }}>
                                            <div style={{ fontWeight: 800, fontSize: 12 }}>Передача рейса</div>
                                            {transferBusy ? (
                                                <div style={{ fontSize: 11, opacity: 0.7 }}>
                                                    Загружаем диспетчеров...
                                                </div>
                                            ) : transferTargets.length === 0 ? (
                                                <div style={{ fontSize: 11, opacity: 0.7 }}>
                                                    Нет доступных диспетчеров онлайн.
                                                </div>
                                            ) : (
                                                <div
                                                    style={{
                                                        display: "grid",
                                                        gap: 6,
                                                        maxHeight: 160,
                                                        overflow: "auto",
                                                    }}
                                                >
                                                    {transferTargets.map((dispatcher) => (
                                                        <button
                                                            key={dispatcher.id}
                                                            style={actionBtn()}
                                                            onClick={async () => {
                                                                try {
                                                                    setTransferBusy(true);
                                                                    await onRequestTransfer(
                                                                        selectedFlight.id,
                                                                        dispatcher.id
                                                                    );
                                                                    setShowTransferPicker(false);
                                                                    onRefresh();
                                                                } catch (error) {
                                                                    setTransferError(error.message || "transfer_failed");
                                                                } finally {
                                                                    setTransferBusy(false);
                                                                }
                                                            }}
                                                        >
                                                            {dispatcher.username}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                            {transferError && (
                                                <div style={{ fontSize: 11, color: "#ffb3b3" }}>
                                                    {describeFlightError(transferError)}
                                                </div>
                                            )}
                                            <button
                                                style={actionBtn()}
                                                onClick={() => setShowTransferPicker(false)}
                                            >
                                                Закрыть
                                            </button>
                                        </div>
                                    )}
                                    {!canManage && (
                                        <div style={{ fontSize: 12, color: "#ffb3b3" }}>
                                            Рейс недоступен для управления.
                                        </div>
                                    )}
                                    <div style={{ ...card, display: "grid", gap: 10 }}>
                                        <div
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "space-between",
                                                gap: 12,
                                            }}
                                        >
                                            <div style={{ display: "grid", gap: 4 }}>
                                                <div style={{ fontWeight: 900, fontSize: 18 }}>
                                                    {selectedFlight.callsign}
                                                </div>
                                                <div style={{ fontSize: 12, opacity: 0.8 }}>
                                                    {selectedFlight.fromIcao} → {selectedFlight.toIcao}
                                                </div>
                                            </div>
                                            <div
                                                style={{
                                                    width: 36,
                                                    height: 36,
                                                    borderRadius: 12,
                                                    background: "rgba(74, 99, 255, 0.18)",
                                                    border: "1px solid rgba(255,255,255,0.08)",
                                                    display: "grid",
                                                    placeItems: "center",
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        width: 16,
                                                        height: 2,
                                                        background: "#ffd34d",
                                                        transform: "rotate(-15deg)",
                                                        boxShadow: "0 0 8px rgba(255, 211, 77, 0.6)",
                                                    }}
                                                />
                                            </div>
                                        </div>
                                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                                            <span
                                                style={{
                                                    fontSize: 10,
                                                    padding: "3px 8px",
                                                    borderRadius: 999,
                                                    background: getPhaseBadgeColor(selectedFlight.phase),
                                                    color: "#0b0f1a",
                                                    fontWeight: 700,
                                                }}
                                            >
                                                {selectedFlight.phase || formatStatusLabel(selectedFlight.status)}
                                            </span>
                                            <span
                                                style={{
                                                    fontSize: 10,
                                                    padding: "3px 8px",
                                                    borderRadius: 999,
                                                    background: getPriorityBadgeColor(selectedFlight.priority),
                                                    color: "#0b0f1a",
                                                    fontWeight: 700,
                                                }}
                                            >
                                                {selectedFlight.priority || "NORMAL"}
                                            </span>
                                        </div>
                                        <div style={{ display: "grid", gap: 10 }}>
                                            <div
                                                style={{
                                                    display: "grid",
                                                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                                                    gap: 8,
                                                }}
                                            >
                                                <button
                                                    style={{
                                                        ...actionBtn(),
                                                        padding: "8px 14px",
                                                        height: 40,
                                                        opacity: canEdit ? 1 : 0.5,
                                                        cursor: canEdit ? "pointer" : "not-allowed",
                                                    }}
                                                    disabled={!canEdit}
                                                    onClick={() => {
                                                        if (!selectedFlight) return;
                                                        setModalState({ mode: "edit", flight: selectedFlight });
                                                        setModalError("");
                                                    }}
                                                    title={!canEdit ? "Нет доступа или рейс заблокирован." : ""}
                                                >
                                                    Редактировать
                                                </button>
                                                {canTransfer && selectedFlight && (
                                                    <button
                                                        style={{ ...actionBtn(), padding: "8px 14px", height: 40 }}
                                                        onClick={() => {
                                                            setShowTransferPicker(true);
                                                            setTransferError("");
                                                        }}
                                                    >
                                                        Передать
                                                    </button>
                                                )}
                                                <button
                                                    style={{
                                                        ...actionBtn(selectedFlight.awaitingAtc ? "danger" : undefined),
                                                        padding: "8px 14px",
                                                        height: 40,
                                                        opacity: canEdit ? 1 : 0.5,
                                                        cursor: canEdit ? "pointer" : "not-allowed",
                                                    }}
                                                    disabled={!canEdit}
                                                    onClick={() => {
                                                        if (!selectedFlight) return;
                                                        handleQuickUpdate(selectedFlight.id, {
                                                            ...buildFlightPayload(selectedFlight),
                                                            awaitingAtc: !selectedFlight.awaitingAtc,
                                                        });
                                                    }}
                                                >
                                                    {selectedFlight.awaitingAtc
                                                        ? "Снять ожидание"
                                                        : "Поставить в ожидание"}
                                                </button>
                                                <button
                                                    style={{ ...actionBtn(), padding: "8px 14px", height: 40 }}
                                                    onClick={() => setShowFlightPanel(false)}
                                                >
                                                    Скрыть
                                                </button>
                                            </div>
                                            <div
                                                style={{
                                                    display: "grid",
                                                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                                                    gap: 8,
                                                }}
                                            >
                                                <button
                                                    style={{
                                                        ...actionBtn("danger"),
                                                        padding: "8px 14px",
                                                        height: 40,
                                                        opacity: canDelete ? 1 : 0.5,
                                                        cursor: canDelete ? "pointer" : "not-allowed",
                                                    }}
                                                    disabled={!canDelete}
                                                    onClick={async () => {
                                                        if (!selectedFlight) return;
                                                        const confirmed = window.confirm(
                                                            `Удалить рейс ${selectedFlight.callsign}?`
                                                        );
                                                        if (!confirmed) return;
                                                        try {
                                                            await onDeleteFlight(selectedFlight.id);
                                                        } catch (error) {
                                                            setModalError(error.message || "delete_failed");
                                                        }
                                                    }}
                                                    title={!canDelete ? "Нет доступа или рейс заблокирован." : ""}
                                                >
                                                    Удалить
                                                </button>
                                                {isAdmin && selectedFlight && (
                                                    <button
                                                        style={{
                                                            ...actionBtn(
                                                                selectedFlight.isLocked ? "danger" : undefined
                                                            ),
                                                            padding: "8px 14px",
                                                            height: 40,
                                                        }}
                                                        onClick={async () => {
                                                            try {
                                                                await onToggleFlightLock?.(
                                                                    selectedFlight.id,
                                                                    !selectedFlight.isLocked
                                                                );
                                                                onRefresh();
                                                            } catch (error) {
                                                                setModalError(error.message || "lock_failed");
                                                            }
                                                        }}
                                                    >
                                                        {selectedFlight.isLocked
                                                            ? "Разблокировать"
                                                            : "Заблокировать"}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div style={card}>
                                        <div style={{ display: "grid", gap: 4, fontSize: 12 }}>
                                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                                                <span style={{ opacity: 0.7 }}>Владелец</span>
                                                <span>{selectedFlight.ownerName || "Без владельца"}</span>
                                            </div>
                                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                                                <span style={{ opacity: 0.7 }}>Зона</span>
                                                <span>{selectedZone ? selectedZone.name : "—"}</span>
                                            </div>
                                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                                                <span style={{ opacity: 0.7 }}>Приоритет</span>
                                                <span>{selectedFlight.priority || "NORMAL"}</span>
                                            </div>
                                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                                                <span style={{ opacity: 0.7 }}>Скорость</span>
                                                <span>
                                                    {Number.isFinite(selectedMapFlight?.displaySpeed)
                                                        ? `${selectedMapFlight.displaySpeed} kt`
                                                        : Number.isFinite(selectedFlight.speed)
                                                        ? `${selectedFlight.speed} kt`
                                                        : "—"}
                                                </span>
                                            </div>
                                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                                                <span style={{ opacity: 0.7 }}>Высота</span>
                                                <span>
                                                    {Number.isFinite(selectedMapFlight?.displayAltitude)
                                                        ? `${selectedMapFlight.displayAltitude} ft`
                                                        : Number.isFinite(selectedFlight.altitude)
                                                        ? `${selectedFlight.altitude} ft`
                                                        : "—"}
                                                </span>
                                            </div>
                                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                                                <span style={{ opacity: 0.7 }}>Статус</span>
                                                <span>{formatStatusLabel(selectedFlight.status)}</span>
                                            </div>
                                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                                                <span style={{ opacity: 0.7 }}>Блокировка</span>
                                                <span>{selectedFlight.isLocked ? "Заблокирован" : "Нет"}</span>
                                            </div>
                                            {selectedFlight.transferPending && (
                                                <div style={{ display: "flex", justifyContent: "space-between" }}>
                                                    <span style={{ opacity: 0.7 }}>Передача</span>
                                                    <span>В процессе</span>
                                                </div>
                                            )}
                                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                                                <span style={{ opacity: 0.7 }}>Вылет (MSK)</span>
                                                <span>{selectedFlight.departureMsk || formatMsk(selectedFlight.departureUtc)}</span>
                                            </div>
                                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                                                <span style={{ opacity: 0.7 }}>Прибытие (MSK)</span>
                                                <span>{selectedFlight.arrivalMsk || formatMsk(selectedFlight.arrivalUtc)}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ ...card, display: "flex", gap: 8, flexWrap: "wrap" }}>
                                        <button
                                            style={{
                                                ...actionBtn(),
                                                minWidth: 120,
                                                padding: "8px 14px",
                                                border: "1px solid rgba(255,255,255,0.12)",
                                                background: "rgba(28, 36, 55, 0.92)",
                                                boxShadow: "0 8px 16px rgba(0,0,0,0.25)",
                                                opacity: canEdit ? 1 : 0.5,
                                                cursor: canEdit ? "pointer" : "not-allowed",
                                            }}
                                            disabled={!canEdit}
                                            onClick={() => {
                                                if (!selectedFlight) return;
                                                const index = FLIGHT_PHASES.indexOf(selectedFlight.phase || "");
                                                if (index <= 0) return;
                                                handleQuickUpdate(selectedFlight.id, {
                                                    ...buildFlightPayload(selectedFlight),
                                                    phase: FLIGHT_PHASES[index - 1],
                                                });
                                            }}
                                        >
                                            ◀ Предыдущая
                                        </button>
                                        <button
                                            style={{
                                                ...actionBtn(),
                                                minWidth: 120,
                                                padding: "8px 14px",
                                                border: "1px solid rgba(255,255,255,0.12)",
                                                background: "rgba(28, 36, 55, 0.92)",
                                                boxShadow: "0 8px 16px rgba(0,0,0,0.25)",
                                                opacity: canEdit ? 1 : 0.5,
                                                cursor: canEdit ? "pointer" : "not-allowed",
                                            }}
                                            disabled={!canEdit}
                                            onClick={() => {
                                                if (!selectedFlight) return;
                                                const index = FLIGHT_PHASES.indexOf(selectedFlight.phase || "");
                                                if (index === -1 || index >= FLIGHT_PHASES.length - 1) return;
                                                handleQuickUpdate(selectedFlight.id, {
                                                    ...buildFlightPayload(selectedFlight),
                                                    phase: FLIGHT_PHASES[index + 1],
                                                });
                                            }}
                                        >
                                            Следующая ▶
                                        </button>
                                    </div>
                                    {panelError && !modalState && (
                                        <div style={{ fontSize: 12, color: "#ffb3b3" }}>{panelError}</div>
                                    )}
                                </>
                            ) : (
                                <div style={card}>
                                    <div style={{ fontSize: 12, opacity: 0.7 }}>
                                        Выберите рейс слева, чтобы открыть карточку управления.
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                    </div>
                </div>
            )}

            {modalState && (
                <FlightModal
                    mode={modalState.mode}
                    flight={modalState.flight}
                    busy={modalBusy}
                    error={modalError}
                    onClose={() => setModalState(null)}
                    onSubmit={handleModalSubmit}
                    onAirportSearch={onAirportSearch}
                />
            )}

            {adminPanelOpen && isAdmin && (
                <AdminPanel
                    busy={adminBusy}
                    dispatchers={dispatchers}
                    logs={logs}
                    tab={adminTab}
                    onTabChange={setAdminTab}
                    onClose={() => setAdminPanelOpen(false)}
                    onDeleteDispatcher={onDeleteDispatcher}
                    onFilterFlights={(dispatcher) => {
                        setOwnerFilter(dispatcher);
                        setAdminPanelOpen(false);
                    }}
                    onRefresh={async () => {
                        if (!onFetchDispatchers || !onFetchLogs) return;
                        setAdminBusy(true);
                        try {
                            const [dispatchersData, logsData] = await Promise.all([
                                onFetchDispatchers(),
                                onFetchLogs(),
                            ]);
                            setDispatchers(Array.isArray(dispatchersData) ? dispatchersData : []);
                            setLogs(Array.isArray(logsData) ? logsData : []);
                        } finally {
                            setAdminBusy(false);
                        }
                    }}
                />
            )}

        </div>
    );
}

function AdminPanel({
    busy,
    dispatchers,
    logs,
    tab,
    onTabChange,
    onClose,
    onDeleteDispatcher,
    onFilterFlights,
    onRefresh,
}) {
    const [filter, setFilter] = useState("");

    const filteredLogs = useMemo(() => {
        const query = filter.trim().toLowerCase();
        if (!query) return logs;
        return logs.filter((entry) => {
            const summary = String(entry.summary || "").toLowerCase();
            const actor = String(entry.actorName || "").toLowerCase();
            const action = String(entry.actionType || "").toLowerCase();
            return summary.includes(query) || actor.includes(query) || action.includes(query);
        });
    }, [filter, logs]);

    return (
        <div
            style={{
                position: "fixed",
                inset: 0,
                background: "rgba(6, 10, 18, 0.55)",
                display: "grid",
                placeItems: "center",
                zIndex: 20000,
                backdropFilter: "blur(3px)",
            }}
        >
            <div
                style={{
                    width: 680,
                    maxWidth: "95%",
                    maxHeight: "85vh",
                    overflow: "hidden",
                    background: "var(--atc-panel)",
                    border: "1px solid var(--atc-border)",
                    borderRadius: 16,
                    padding: 16,
                    display: "grid",
                    gap: 12,
                }}
            >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontWeight: 900, fontSize: 16 }}>Админ панель</div>
                    <button
                        style={{
                            border: "1px solid var(--atc-border)",
                            borderRadius: 10,
                            padding: "6px 10px",
                            fontSize: 12,
                            background: "rgba(17, 23, 35, 0.85)",
                            color: "var(--atc-text)",
                            cursor: "pointer",
                        }}
                        onClick={onClose}
                    >
                        Закрыть
                    </button>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                    <button
                        style={{
                            border: "1px solid var(--atc-border)",
                            padding: "8px 12px",
                            borderRadius: 12,
                            cursor: "pointer",
                            fontWeight: 800,
                            background: tab === "dispatchers" ? "var(--atc-accent)" : "rgba(17, 23, 35, 0.85)",
                            color: tab === "dispatchers" ? "#f6f8ff" : "var(--atc-text)",
                        }}
                        onClick={() => onTabChange("dispatchers")}
                    >
                        Диспетчеры
                    </button>
                    <button
                        style={{
                            border: "1px solid var(--atc-border)",
                            padding: "8px 12px",
                            borderRadius: 12,
                            cursor: "pointer",
                            fontWeight: 800,
                            background: tab === "logs" ? "var(--atc-accent)" : "rgba(17, 23, 35, 0.85)",
                            color: tab === "logs" ? "#f6f8ff" : "var(--atc-text)",
                        }}
                        onClick={() => onTabChange("logs")}
                    >
                        Лог действий
                    </button>
                    <button
                        style={{
                            border: "1px solid var(--atc-border)",
                            padding: "8px 12px",
                            borderRadius: 12,
                            cursor: "pointer",
                            fontWeight: 800,
                            background: "rgba(17, 23, 35, 0.85)",
                            color: "var(--atc-text)",
                        }}
                        onClick={onRefresh}
                        disabled={busy}
                    >
                        Обновить
                    </button>
                </div>
                {tab === "dispatchers" ? (
                    <div style={{ display: "grid", gap: 8, maxHeight: "60vh", overflow: "auto" }}>
                        {busy && <div style={{ fontSize: 12, opacity: 0.7 }}>Загрузка...</div>}
                        {!busy && dispatchers.length === 0 && (
                            <div style={{ fontSize: 12, opacity: 0.7 }}>Диспетчеры не найдены.</div>
                        )}
                        {dispatchers.map((dispatcher) => (
                            <div
                                key={dispatcher.id}
                                style={{
                                    border: "1px solid var(--atc-border)",
                                    borderRadius: 12,
                                    padding: 10,
                                    display: "grid",
                                    gap: 6,
                                    background: "rgba(12, 16, 26, 0.9)",
                                }}
                            >
                                <div style={{ display: "flex", justifyContent: "space-between" }}>
                                    <div style={{ fontWeight: 800, fontSize: 13 }}>{dispatcher.username}</div>
                                    <div style={{ fontSize: 11, opacity: 0.7 }}>
                                        {dispatcher.online ? "online" : "offline"}
                                    </div>
                                </div>
                                <div style={{ fontSize: 11, opacity: 0.7 }}>
                                    Активных рейсов: {dispatcher.activeFlights ?? 0}
                                </div>
                                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                    <button
                                        style={{
                                            border: "1px solid var(--atc-border)",
                                            borderRadius: 10,
                                            padding: "6px 10px",
                                            fontSize: 12,
                                            background: "rgba(17, 23, 35, 0.85)",
                                            color: "var(--atc-text)",
                                            cursor: "pointer",
                                        }}
                                        onClick={() =>
                                            onFilterFlights({ id: dispatcher.id, name: dispatcher.username })
                                        }
                                    >
                                        Фильтр рейсов
                                    </button>
                                    <button
                                        style={{
                                            border: "1px solid var(--atc-border)",
                                            borderRadius: 10,
                                            padding: "6px 10px",
                                            fontSize: 12,
                                            background: "rgba(140, 40, 40, 0.65)",
                                            color: "var(--atc-text)",
                                            cursor: "pointer",
                                        }}
                                        onClick={async () => {
                                            const confirmed = window.confirm(
                                                `Удалить аккаунт ${dispatcher.username}?`
                                            );
                                            if (!confirmed) return;
                                            await onDeleteDispatcher?.(dispatcher.id);
                                            onRefresh();
                                        }}
                                    >
                                        Удалить
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div style={{ display: "grid", gap: 8 }}>
                        <input
                            placeholder="Фильтр по диспетчеру/действию/рейсу"
                            value={filter}
                            onChange={(event) => setFilter(event.target.value)}
                            style={{
                                border: "1px solid var(--atc-border)",
                                borderRadius: 12,
                                padding: "8px 10px",
                                fontSize: 12,
                                background: "rgba(12, 16, 26, 0.95)",
                                color: "var(--atc-text)",
                            }}
                        />
                        <div style={{ maxHeight: "55vh", overflow: "auto", display: "grid", gap: 6 }}>
                            {busy && <div style={{ fontSize: 12, opacity: 0.7 }}>Загрузка...</div>}
                            {!busy && filteredLogs.length === 0 && (
                                <div style={{ fontSize: 12, opacity: 0.7 }}>Записей нет.</div>
                            )}
                            {filteredLogs
                                .slice()
                                .reverse()
                                .map((entry, index) => (
                                    <div
                                        key={`${entry.entityId || "log"}-${index}`}
                                        style={{
                                            border: "1px solid var(--atc-border)",
                                            borderRadius: 12,
                                            padding: 10,
                                            background: "rgba(12, 16, 26, 0.9)",
                                            fontSize: 11,
                                            display: "grid",
                                            gap: 4,
                                        }}
                                    >
                                        <div style={{ fontWeight: 700 }}>{entry.summary || entry.actionType}</div>
                                        <div style={{ opacity: 0.7 }}>
                                            {entry.actorName || "system"} · {entry.actionType}
                                        </div>
                                        <div style={{ opacity: 0.6 }}>
                                            {new Date(entry.timestamp).toLocaleString()}
                                        </div>
                                    </div>
                                ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function NotFoundScreen() {
    return (
        <div>
            <div style={{ fontWeight: 900, marginBottom: 6 }}>404</div>
            <div style={{ fontSize: 13, opacity: 0.8 }}>Такой страницы нет.</div>
        </div>
    );
}

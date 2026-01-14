import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer } from "react-leaflet";
import { Routes, Route, useLocation, useNavigate } from "react-router-dom";

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
    } catch {}
}

export default function App() {
    const [status, setStatus] = useState(() => loadLS("ui.status", "online"));

    useEffect(() => saveLS("ui.status", status), [status]);

    const navigate = useNavigate();
    const location = useLocation();

    const active = useMemo(() => {
        const p = location.pathname || "/";
        if (p === "/") return "pilot";
        if (p.startsWith("/atc")) return "atc";
        return "unknown";
    }, [location.pathname]);

    const goATC = () => navigate("/atc");
    const goPilot = () => navigate("/");

    return (
        <div style={{ width: "100vw", height: "100vh", position: "relative" }}>
            {/* Карта — фон */}
            <MapContainer
                center={[25.2048, 55.2708]} // Dubai
                zoom={9}
                style={{ width: "100%", height: "100%", zIndex: 0 }}
            >
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            </MapContainer>

            {/* Мини-бар сверху */}
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
                    onClick={() => setStatus((s) => (s === "online" ? "offline" : "online"))}
                    style={{
                        pointerEvents: "auto",
                        background: "rgba(255,255,255,0.9)",
                        border: "none",
                        padding: "10px 12px",
                        borderRadius: 10,
                        cursor: "pointer",
                        fontWeight: 800,
                    }}
                    title="Тестовая кнопка"
                >
                    Status: {status}
                </button>
            </div>

            {/* Кнопка перехода в ATC / обратно */}
            <button
                onClick={active === "atc" ? goPilot : goATC}
                style={{
                    position: "absolute",
                    right: 12,
                    top: 70,
                    zIndex: 10000,
                    border: "none",
                    padding: "12px 14px",
                    borderRadius: 12,
                    cursor: "pointer",
                    fontWeight: 900,
                    background: active === "atc" ? "rgba(255,255,255,0.95)" : "rgba(20,20,20,0.85)",
                    color: active === "atc" ? "#000" : "#fff",
                    boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
                }}
                title={active === "atc" ? "Вернуться к пилоту" : "Открыть ATC"}
            >
                {active === "atc" ? "Back to Pilot" : "Open ATC"}
            </button>

            {/* Контент экрана (правый нижний блок) */}
            <div
                style={{
                    position: "absolute",
                    right: 12,
                    bottom: 12,
                    width: 520,
                    maxWidth: "calc(100vw - 24px)",
                    background: "rgba(255,255,255,0.95)",
                    borderRadius: 12,
                    padding: 12,
                    boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
                    zIndex: 10000,
                }}
            >
                <Routes>
                    <Route path="/" element={<PilotScreen status={status} />} />
                    <Route path="/atc" element={<ATCScreen status={status} />} />
                    <Route path="*" element={<NotFoundScreen />} />
                </Routes>
            </div>
        </div>
    );
}

function PilotScreen({ status }) {
    return (
        <div>
            <div style={{ fontWeight: 900, marginBottom: 6 }}>Pilot</div>
            <div style={{ fontSize: 13, opacity: 0.8 }}>
                Экран пилота (карта + управление). Статус: {status}.
            </div>
        </div>
    );
}

function ATCScreen({ status }) {
    const [tab, setTab] = useState("requests");
    const [hoveredTab, setHoveredTab] = useState(null);

    const tabBtn = (isActive, isHovered) => ({
        border: "1px solid rgba(0,0,0,0.08)",
        padding: "10px 14px",
        borderRadius: 12,
        cursor: "pointer",
        fontWeight: 800,
        letterSpacing: "0.02em",
        background: isActive ? "rgba(20,20,20,0.9)" : "rgba(255,255,255,0.9)",
        color: isActive ? "#fff" : "#1e1e1e",
        boxShadow: isActive
            ? "0 6px 18px rgba(0,0,0,0.18)"
            : "0 4px 12px rgba(0,0,0,0.06)",
        transform: isHovered && !isActive ? "translateY(-1px)" : "translateY(0)",
        transition: "all 0.15s ease",
    });

    const panelWrap = {
        background: "rgba(12,12,12,0.02)",
        border: "1px solid rgba(0,0,0,0.06)",
        borderRadius: 14,
        padding: 12,
        display: "grid",
        gap: 10,
    };

    const card = {
        background: "#fff",
        border: "1px solid rgba(0,0,0,0.06)",
        borderRadius: 12,
        padding: "12px 14px",
        boxShadow: "0 6px 16px rgba(0,0,0,0.06)",
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
                ? "rgba(255,74,74,0.12)"
                : tone === "info"
                ? "rgba(55,124,255,0.12)"
                : "rgba(0,0,0,0.06)",
        color: tone === "alert" ? "#b11212" : tone === "info" ? "#1846b1" : "#333",
    });

    return (
        <div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 10 }}>
                <div style={{ fontWeight: 900, fontSize: 18 }}>ATC Console</div>
                <div style={{ fontSize: 12, opacity: 0.6, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    Status: {status}
                </div>
            </div>

            {/* ATC menu */}
            <div
                style={{
                    display: "flex",
                    gap: 8,
                    marginBottom: 12,
                    padding: 8,
                    borderRadius: 14,
                    background: "rgba(0,0,0,0.04)",
                    alignItems: "center",
                    flexWrap: "wrap",
                }}
            >
                <button
                    style={tabBtn(tab === "requests", hoveredTab === "requests")}
                    onClick={() => setTab("requests")}
                    onMouseEnter={() => setHoveredTab("requests")}
                    onMouseLeave={() => setHoveredTab(null)}
                >
                    Requests
                </button>
                <button
                    style={tabBtn(tab === "flights", hoveredTab === "flights")}
                    onClick={() => setTab("flights")}
                    onMouseEnter={() => setHoveredTab("flights")}
                    onMouseLeave={() => setHoveredTab(null)}
                >
                    Flights
                </button>
                <button
                    style={tabBtn(tab === "ground", hoveredTab === "ground")}
                    onClick={() => setTab("ground")}
                    onMouseEnter={() => setHoveredTab("ground")}
                    onMouseLeave={() => setHoveredTab(null)}
                >
                    Ground
                </button>
                <button
                    style={tabBtn(tab === "settings", hoveredTab === "settings")}
                    onClick={() => setTab("settings")}
                    onMouseEnter={() => setHoveredTab("settings")}
                    onMouseLeave={() => setHoveredTab(null)}
                >
                    Settings
                </button>
            </div>

            {/* LEGACY: chat tab removed from UI */}
            {/* {tab === "chat" && (
                <div>
                    <div style={{ fontWeight: 900, marginBottom: 6 }}>ATC Chat</div>
                    <div style={{ fontSize: 13, opacity: 0.8 }}>
                        Тут будет чат/лог ATC. Следующий шаг: список сообщений “ник: текст” + поле ввода.
                    </div>
                </div>
            )} */}

            {tab === "requests" && (
                <div style={panelWrap}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                            <div style={{ fontWeight: 900, fontSize: 16 }}>Incoming Requests</div>
                            <div style={{ fontSize: 12, opacity: 0.7 }}>
                                Очередь по приоритету и статусам подтверждения.
                            </div>
                        </div>
                        <div style={chip("alert")}>3 waiting</div>
                    </div>
                    <div style={card}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                            <div style={{ fontWeight: 800 }}>UAE214 · Pushback</div>
                            <div style={chip("info")}>Gate B7</div>
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>
                            Запрос на разрешение для pushback. Ожидает подтверждения диспетчера.
                        </div>
                    </div>
                    <div style={card}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                            <div style={{ fontWeight: 800 }}>RYR81Q · Start</div>
                            <div style={chip()}>Stand 24</div>
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>
                            Запуск двигателей, требуется подтверждение в течение 2 минут.
                        </div>
                    </div>
                    <div style={card}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                            <div style={{ fontWeight: 800 }}>SVO902 · Taxi</div>
                            <div style={chip("info")}>RWY 30L</div>
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>
                            Запрос на руление к исполнительному. Окно связи активное.
                        </div>
                    </div>
                </div>
            )}

            {tab === "flights" && (
                <div style={panelWrap}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                            <div style={{ fontWeight: 900, fontSize: 16 }}>Active Flights</div>
                            <div style={{ fontSize: 12, opacity: 0.7 }}>Контроль полосы и точек ожидания.</div>
                        </div>
                        <div style={chip("info")}>12 in sector</div>
                    </div>
                    <div style={card}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                            <div style={{ fontWeight: 800 }}>AIC402 · Approach</div>
                            <div style={chip()}>FL120</div>
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>
                            ETA 06:14Z · Vectors to ILS 30L · Next check: 2 min.
                        </div>
                    </div>
                    <div style={card}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                            <div style={{ fontWeight: 800 }}>ETD78 · Departure</div>
                            <div style={chip("info")}>Gate C2</div>
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>
                            Ready for taxi · Clearance pending · Assigned SID: DAS1A.
                        </div>
                    </div>
                    <div style={card}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                            <div style={{ fontWeight: 800 }}>THY9D · Enroute</div>
                            <div style={chip()}>FL320</div>
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>
                            Passing waypoint LAGOS · Hand-off in 4 min.
                        </div>
                    </div>
                </div>
            )}

            {tab === "ground" && (
                <div style={panelWrap}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                            <div style={{ fontWeight: 900, fontSize: 16 }}>Runway / Taxi</div>
                            <div style={{ fontSize: 12, opacity: 0.7 }}>
                                Назначения полос, точки ожидания, маршруты руления.
                            </div>
                        </div>
                        <div style={chip()}>RWY 30L active</div>
                    </div>
                    <div style={card}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                            <div style={{ fontWeight: 800 }}>Runway 30L</div>
                            <div style={chip("info")}>Landing</div>
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>
                            Next arrival in 02:30 · Vacate via B3 · Winds 310/12.
                        </div>
                    </div>
                    <div style={card}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                            <div style={{ fontWeight: 800 }}>Taxi Flow</div>
                            <div style={chip()}>Alpha / Bravo</div>
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>
                            Hotspots: A4 intersection · Limited crossing due to maintenance.
                        </div>
                    </div>
                    <div style={card}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                            <div style={{ fontWeight: 800 }}>Hold Points</div>
                            <div style={chip("alert")}>2 occupied</div>
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>
                            B1: UAE214 · C3: SVO902 · Monitor spacing.
                        </div>
                    </div>
                </div>
            )}

            {tab === "settings" && (
                <div style={panelWrap}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                            <div style={{ fontWeight: 900, fontSize: 16 }}>ATC Settings</div>
                            <div style={{ fontSize: 12, opacity: 0.7 }}>Параметры рабочей станции диспетчера.</div>
                        </div>
                        <div style={chip("info")}>Profile: Tower</div>
                    </div>
                    <div style={card}>
                        <div style={{ fontWeight: 800, marginBottom: 6 }}>Notifications</div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>
                            Звук запросов: Medium · Alerts: Runway incursion · Auto-ack disabled.
                        </div>
                    </div>
                    <div style={card}>
                        <div style={{ fontWeight: 800, marginBottom: 6 }}>Filters</div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>
                            Показывать только: IFR, arrivals within 50 NM, departures within 10 NM.
                        </div>
                    </div>
                    <div style={card}>
                        <div style={{ fontWeight: 800, marginBottom: 6 }}>Refresh Rate</div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>
                            Radar update: 2 sec · Surface updates: 1 sec · Network: stable.
                        </div>
                    </div>
                </div>
            )}
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

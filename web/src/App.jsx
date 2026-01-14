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
    const [tab, setTab] = useState("chat");

    const tabBtn = (isActive) => ({
        border: "none",
        padding: "10px 12px",
        borderRadius: 10,
        cursor: "pointer",
        fontWeight: 900,
        background: isActive ? "rgba(20,20,20,0.85)" : "rgba(0,0,0,0.06)",
        color: isActive ? "#fff" : "#000",
    });

    return (
        <div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <div style={{ fontWeight: 900, marginBottom: 6 }}>ATC</div>
                <div style={{ fontSize: 13, opacity: 0.65 }}>Status: {status}</div>
            </div>

            {/* ATC menu */}
            <div style={{ display: "flex", gap: 8, marginTop: 10, marginBottom: 12, flexWrap: "wrap" }}>
                <button style={tabBtn(tab === "chat")} onClick={() => setTab("chat")}>
                    Chat
                </button>
                <button style={tabBtn(tab === "requests")} onClick={() => setTab("requests")}>
                    Requests
                </button>
                <button style={tabBtn(tab === "flights")} onClick={() => setTab("flights")}>
                    Flights
                </button>
                <button style={tabBtn(tab === "settings")} onClick={() => setTab("settings")}>
                    Settings
                </button>
            </div>

            {tab === "chat" && (
                <div>
                    <div style={{ fontWeight: 900, marginBottom: 6 }}>ATC Chat</div>
                    <div style={{ fontSize: 13, opacity: 0.8 }}>
                        Тут будет чат/лог ATC. Следующий шаг: список сообщений “ник: текст” + поле ввода.
                    </div>
                </div>
            )}

            {tab === "requests" && (
                <div>
                    <div style={{ fontWeight: 900, marginBottom: 6 }}>Requests</div>
                    <div style={{ fontSize: 13, opacity: 0.8 }}>
                        Тут будут ATC-запросы (pushback, start, taxi, takeoff, landing…) + статусы ожидания/ответа по callsign.
                    </div>
                </div>
            )}

            {tab === "flights" && (
                <div>
                    <div style={{ fontWeight: 900, marginBottom: 6 }}>Flights</div>
                    <div style={{ fontSize: 13, opacity: 0.8 }}>
                        Тут будет список активных рейсов и быстрый выбор.
                    </div>
                </div>
            )}

            {tab === "settings" && (
                <div>
                    <div style={{ fontWeight: 900, marginBottom: 6 }}>Settings</div>
                    <div style={{ fontSize: 13, opacity: 0.8 }}>
                        Настройки ATC (например, частота обновления, фильтры, звук).
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
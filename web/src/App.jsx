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
                    right: active === "atc" ? 12 : 12,
                    bottom: active === "atc" ? 12 : 12,
                    left: active === "atc" ? 12 : "auto",
                    top: active === "atc" ? 12 : "auto",
                    width: active === "atc" ? "auto" : 520,
                    height: active === "atc" ? "auto" : "auto",
                    maxWidth: active === "atc" ? "calc(100vw - 24px)" : "calc(100vw - 24px)",
                    maxHeight: active === "atc" ? "calc(100vh - 24px)" : "auto",
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

    HEAD
    const [tab, setTab] = useState("flights");
    const [hoveredTab, setHoveredTab] = useState(null);
    const [selectedFlightId, setSelectedFlightId] = useState("TEST001");
    const [showFlightPanel, setShowFlightPanel] = useState(true);

    const tabBtn = (isActive, isHovered) => ({
        border: "1px solid rgba(255,255,255,0.08)",
=======
    const [tab, setTab] = useState("requests");
    const [hoveredTab, setHoveredTab] = useState(null);

    const tabBtn = (isActive, isHovered) => ({
        border: "1px solid rgba(0,0,0,0.08)",
>>>>>>> origin/main
        padding: "10px 14px",
        borderRadius: 12,
        cursor: "pointer",
        fontWeight: 800,
        letterSpacing: "0.02em",
<<<<<<< HEAD
        background: isActive ? "rgba(75,99,255,0.95)" : "rgba(12,18,28,0.9)",
        color: isActive ? "#f5f8ff" : "#cfd6e6",
        boxShadow: isActive
            ? "0 6px 18px rgba(19,48,120,0.35)"
            : "0 4px 12px rgba(0,0,0,0.2)",
        transform: isHovered && !isActive ? "translateY(-1px)" : "translateY(0)",
        transition: "all 0.15s ease",
=======
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
>>>>>>> origin/main
    });

    const panelWrap = {
        background: "rgba(12,18,28,0.92)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 16,
        padding: 12,
        display: "grid",
        gap: 10,
    };

    const card = {
        background: "rgba(18,25,38,0.9)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 14,
        padding: "12px 14px",
        boxShadow: "0 8px 18px rgba(0,0,0,0.35)",
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
                ? "rgba(255,99,99,0.2)"
                : tone === "info"
                ? "rgba(82,146,255,0.2)"
                : "rgba(255,255,255,0.08)",
        color: tone === "alert" ? "#ffb3b3" : tone === "info" ? "#a6c7ff" : "#cfd6e6",
    });

    const flights = [
        {
            id: "TEST001",
            status: "В пути",
            route: "UUEE → LTBA",
            phase: "Подход",
            gate: "B7",
            runway: "30L",
            altitude: "FL120",
            eta: "06:14Z",
            last: "Связь активна",
        },
        {
            id: "TEST002",
            status: "В пути",
            route: "OMDB → UUDD",
            phase: "Отправление",
            gate: "C2",
            runway: "30R",
            altitude: "FL090",
            eta: "06:22Z",
            last: "Ожидает руление",
        },
        {
            id: "TEST003",
            status: "В пути",
            route: "LFPG → EDDF",
            phase: "Крейсер",
            gate: "A1",
            runway: "25L",
            altitude: "FL320",
            eta: "06:30Z",
            last: "Передача сектора",
        },
        {
            id: "TEST004",
            status: "Ожидает",
            route: "UUDD → EKCH",
            phase: "Стоянка",
            gate: "D4",
            runway: "22R",
            altitude: "—",
            eta: "06:45Z",
            last: "Запрос запуска",
        },
    ];

    const selectedFlight = flights.find((flight) => flight.id === selectedFlightId) || flights[0];

    return (
<<<<<<< HEAD
        <div
            style={{
                background: "linear-gradient(135deg, rgba(8,12,20,0.98), rgba(14,20,34,0.98))",
                borderRadius: 16,
                padding: 14,
                color: "#e6ecf8",
            }}
        >
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 10 }}>
                <div style={{ fontWeight: 900, fontSize: 18 }}>Эскиз полета</div>
                <div style={{ fontSize: 12, opacity: 0.65, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    УВД: {status}
=======
        <div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 10 }}>
                <div style={{ fontWeight: 900, fontSize: 18 }}>ATC Console</div>
                <div style={{ fontSize: 12, opacity: 0.6, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    Status: {status}
>>>>>>> origin/main
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
<<<<<<< HEAD
                    background: "rgba(10,14,22,0.9)",
=======
                    background: "rgba(0,0,0,0.04)",
>>>>>>> origin/main
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
<<<<<<< HEAD
                    Запросы
                </button>
                <button
                    style={tabBtn(tab === "flights", hoveredTab === "flights")}
                    onClick={() => setTab("flights")}
                    onMouseEnter={() => setHoveredTab("flights")}
                    onMouseLeave={() => setHoveredTab(null)}
                >
                    Рейсы
                </button>
                <button
                    style={tabBtn(tab === "ground", hoveredTab === "ground")}
                    onClick={() => setTab("ground")}
                    onMouseEnter={() => setHoveredTab("ground")}
                    onMouseLeave={() => setHoveredTab(null)}
                >
                    ВПП / Руление
                </button>
                <button
=======
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
>>>>>>> origin/main
                    style={tabBtn(tab === "settings", hoveredTab === "settings")}
                    onClick={() => setTab("settings")}
                    onMouseEnter={() => setHoveredTab("settings")}
                    onMouseLeave={() => setHoveredTab(null)}
                >
<<<<<<< HEAD
                    Настройки
=======
                    Settings
>>>>>>> origin/main
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
<<<<<<< HEAD
                            <div style={{ fontWeight: 900, fontSize: 16 }}>Входящие запросы</div>
=======
                            <div style={{ fontWeight: 900, fontSize: 16 }}>Incoming Requests</div>
>>>>>>> origin/main
                            <div style={{ fontSize: 12, opacity: 0.7 }}>
                                Очередь по приоритету и статусам подтверждения.
                            </div>
                        </div>
<<<<<<< HEAD
                        <div style={chip("alert")}>3 ожидают</div>
                    </div>
                    <div style={card}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                            <div style={{ fontWeight: 800 }}>UAE214 · Пушбек</div>
                            <div style={chip("info")}>Гейт B7</div>
=======
                        <div style={chip("alert")}>3 waiting</div>
                    </div>
                    <div style={card}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                            <div style={{ fontWeight: 800 }}>UAE214 · Pushback</div>
                            <div style={chip("info")}>Gate B7</div>
>>>>>>> origin/main
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>
                            Запрос на разрешение для pushback. Ожидает подтверждения диспетчера.
                        </div>
                    </div>
                    <div style={card}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
<<<<<<< HEAD
                            <div style={{ fontWeight: 800 }}>RYR81Q · Запуск</div>
                            <div style={chip()}>Стоянка 24</div>
=======
                            <div style={{ fontWeight: 800 }}>RYR81Q · Start</div>
                            <div style={chip()}>Stand 24</div>
>>>>>>> origin/main
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>
                            Запуск двигателей, требуется подтверждение в течение 2 минут.
                        </div>
                    </div>
                    <div style={card}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
<<<<<<< HEAD
                            <div style={{ fontWeight: 800 }}>SVO902 · Руление</div>
                            <div style={chip("info")}>ВПП 30L</div>
=======
                            <div style={{ fontWeight: 800 }}>SVO902 · Taxi</div>
                            <div style={chip("info")}>RWY 30L</div>
>>>>>>> origin/main
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>
                            Запрос на руление к исполнительному. Окно связи активное.
                        </div>
                    </div>
                </div>
            )}

            {tab === "flights" && (
<<<<<<< HEAD
                <div style={{ display: "grid", gap: 12 }}>
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            padding: "10px 12px",
                            borderRadius: 14,
                            background: "rgba(12,18,28,0.95)",
                            border: "1px solid rgba(255,255,255,0.08)",
                        }}
                    >
                        <div style={{ fontWeight: 800 }}>Поле ввода</div>
                        <input
                            placeholder='Ввод строки: "Ник: сообщение"'
                            style={{
                                flex: 1,
                                border: "1px solid rgba(255,255,255,0.08)",
                                borderRadius: 12,
                                padding: "8px 12px",
                                fontSize: 12,
                                background: "rgba(10,14,22,0.9)",
                                color: "#e6ecf8",
                            }}
                        />
                        <button style={tabBtn(true, false)}>Приём внутрь</button>
                        <button style={tabBtn(false, false)}>+ Рейс</button>
                        <button style={tabBtn(false, false)}>Перезагрузить</button>
                    </div>

                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: showFlightPanel
                                ? "220px minmax(0, 1fr) 260px"
                                : "220px minmax(0, 1fr)",
                            gap: 12,
                        }}
                    >
                        <div style={{ ...panelWrap, padding: 10 }}>
                            <div style={{ fontWeight: 900, fontSize: 14 }}>Список рейсов</div>
                            <input
                                placeholder="Поиск (позывной/статус/ВПП...)"
                                style={{
                                    border: "1px solid rgba(255,255,255,0.08)",
                                    borderRadius: 12,
                                    padding: "8px 10px",
                                    fontSize: 12,
                                    background: "rgba(10,14,22,0.9)",
                                    color: "#e6ecf8",
                                }}
                            />
                            <div style={{ display: "grid", gap: 8 }}>
                                {flights.map((flight) => {
                                    const isActive = flight.id === selectedFlightId;
                                    return (
                                        <button
                                            key={flight.id}
                                            onClick={() => setSelectedFlightId(flight.id)}
                                            style={{
                                                textAlign: "left",
                                                border: "1px solid rgba(255,255,255,0.08)",
                                                borderRadius: 12,
                                                padding: "10px 10px",
                                                background: isActive ? "rgba(75,99,255,0.9)" : "rgba(12,18,28,0.9)",
                                                color: "#e6ecf8",
                                                cursor: "pointer",
                                                boxShadow: "0 6px 14px rgba(0,0,0,0.35)",
                                            }}
                                        >
                                            <div style={{ fontWeight: 800 }}>{flight.id}</div>
                                            <div style={{ fontSize: 11, opacity: 0.75 }}>{flight.route}</div>
                                            <div style={{ fontSize: 11, opacity: 0.75 }}>{flight.status}</div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div style={panelWrap}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <div>
                                    <div style={{ fontWeight: 900, fontSize: 16 }}>Карта сектора</div>
                                    <div style={{ fontSize: 12, opacity: 0.7 }}>
                                        Основная карта по центру, рабочее поле диспетчера.
                                    </div>
                                </div>
                                <div style={chip("info")}>12 в секторе</div>
                            </div>
                            <div style={card}>
                                <div
                                    style={{
                                        minHeight: 260,
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        textAlign: "center",
                                        fontSize: 12,
                                        color: "#a7b3c9",
                                    }}
                                >
                                    Карта (заглушка). Здесь будет главный обзорный экран.
                                </div>
                            </div>
                            <div style={card}>
                                <div style={{ fontWeight: 800, marginBottom: 6 }}>Ожидают ответ</div>
                                <div style={{ fontSize: 12, opacity: 0.7 }}>
                                    Нет ожидающих запросов для текущего сектора.
                                </div>
                            </div>
                        </div>

                        {showFlightPanel && (
                            <div style={panelWrap}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <div>
                                        <div style={{ fontWeight: 900, fontSize: 16 }}>Информация о рейсе</div>
                                        <div style={{ fontSize: 12, opacity: 0.7 }}>
                                            Управление выбранным рейсом.
                                        </div>
                                    </div>
                                    <div style={{ display: "flex", gap: 6 }}>
                                        <button style={tabBtn(false, false)}>Редактировать</button>
                                        <button style={tabBtn(false, false)}>Удалить</button>
                                        <button
                                            style={tabBtn(false, false)}
                                            onClick={() => setShowFlightPanel(false)}
                                        >
                                            Скрыть
                                        </button>
                                    </div>
                                </div>
                                {selectedFlight ? (
                                    <>
                                        <div style={card}>
                                            <div style={{ display: "grid", gap: 6, fontSize: 12 }}>
                                                <div style={{ display: "flex", justifyContent: "space-between" }}>
                                                    <span style={{ opacity: 0.6 }}>Полёт</span>
                                                    <strong>{selectedFlight.id}</strong>
                                                </div>
                                                <div style={{ display: "flex", justifyContent: "space-between" }}>
                                                    <span style={{ opacity: 0.6 }}>Статус</span>
                                                    <span>{selectedFlight.status}</span>
                                                </div>
                                                <div style={{ display: "flex", justifyContent: "space-between" }}>
                                                    <span style={{ opacity: 0.6 }}>Фаза</span>
                                                    <span>{selectedFlight.phase}</span>
                                                </div>
                                                <div style={{ display: "flex", justifyContent: "space-between" }}>
                                                    <span style={{ opacity: 0.6 }}>Маршрут</span>
                                                    <span>{selectedFlight.route}</span>
                                                </div>
                                                <div style={{ display: "flex", justifyContent: "space-between" }}>
                                                    <span style={{ opacity: 0.6 }}>Взлётная полоса</span>
                                                    <span>{selectedFlight.runway}</span>
                                                </div>
                                                <div style={{ display: "flex", justifyContent: "space-between" }}>
                                                    <span style={{ opacity: 0.6 }}>FL / Alt</span>
                                                    <span>{selectedFlight.altitude}</span>
                                                </div>
                                                <div style={{ display: "flex", justifyContent: "space-between" }}>
                                                    <span style={{ opacity: 0.6 }}>ETA</span>
                                                    <span>{selectedFlight.eta}</span>
                                                </div>
                                                <div style={{ display: "flex", justifyContent: "space-between" }}>
                                                    <span style={{ opacity: 0.6 }}>Последний</span>
                                                    <span>{selectedFlight.last}</span>
                                                </div>
                                            </div>
                                            <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                                                <div style={chip("alert")}>Ожидает 0</div>
                                                <div style={chip()}>UNANS 0</div>
                                                <div style={chip()}>STBY 0</div>
                                            </div>
                                        </div>
                                        <div style={card}>
                                            <div style={{ fontWeight: 800, marginBottom: 6 }}>Последние запросы</div>
                                            <div style={{ fontSize: 12, opacity: 0.7 }}>
                                                Нет запросов по этому рейсу.
                                            </div>
                                        </div>
                                        <div style={card}>
                                            <div style={{ fontWeight: 800, marginBottom: 6 }}>Предупреждение</div>
                                            <div style={{ fontSize: 12, opacity: 0.7 }}>Нет оповещений.</div>
                                        </div>
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
                        {!showFlightPanel && (
                            <div style={{ display: "flex", justifyContent: "flex-end", gridColumn: "2 / -1" }}>
                                <button style={tabBtn(false, false)} onClick={() => setShowFlightPanel(true)}>
                                    Показать панель рейса
                                </button>
                            </div>
                        )}
=======
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
>>>>>>> origin/main
                    </div>
                </div>
            )}

            {tab === "ground" && (
                <div style={panelWrap}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
<<<<<<< HEAD
                            <div style={{ fontWeight: 900, fontSize: 16 }}>ВПП и руление</div>
=======
                            <div style={{ fontWeight: 900, fontSize: 16 }}>Runway / Taxi</div>
>>>>>>> origin/main
                            <div style={{ fontSize: 12, opacity: 0.7 }}>
                                Назначения полос, точки ожидания, маршруты руления.
                            </div>
                        </div>
<<<<<<< HEAD
                        <div style={chip()}>ВПП 30L активна</div>
                    </div>
                    <div style={card}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                            <div style={{ fontWeight: 800 }}>ВПП 30L</div>
                            <div style={chip("info")}>Посадка</div>
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>
                            Следующий борт через 02:30 · Освобождение по B3 · Ветер 310/12.
=======
                        <div style={chip()}>RWY 30L active</div>
                    </div>
                    <div style={card}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                            <div style={{ fontWeight: 800 }}>Runway 30L</div>
                            <div style={chip("info")}>Landing</div>
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>
                            Next arrival in 02:30 · Vacate via B3 · Winds 310/12.
>>>>>>> origin/main
                        </div>
                    </div>
                    <div style={card}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
<<<<<<< HEAD
                            <div style={{ fontWeight: 800 }}>Поток руления</div>
                            <div style={chip()}>Alpha / Bravo</div>
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>
                            Горячие точки: A4 пересечение · Ограничено из-за работ.
=======
                            <div style={{ fontWeight: 800 }}>Taxi Flow</div>
                            <div style={chip()}>Alpha / Bravo</div>
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>
                            Hotspots: A4 intersection · Limited crossing due to maintenance.
>>>>>>> origin/main
                        </div>
                    </div>
                    <div style={card}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
<<<<<<< HEAD
                            <div style={{ fontWeight: 800 }}>Точки ожидания</div>
                            <div style={chip("alert")}>2 заняты</div>
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>
                            B1: UAE214 · C3: SVO902 · Контроль интервалов.
=======
                            <div style={{ fontWeight: 800 }}>Hold Points</div>
                            <div style={chip("alert")}>2 occupied</div>
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>
                            B1: UAE214 · C3: SVO902 · Monitor spacing.
>>>>>>> origin/main
                        </div>
                    </div>
                </div>
            )}

            {tab === "settings" && (
                <div style={panelWrap}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
<<<<<<< HEAD
                            <div style={{ fontWeight: 900, fontSize: 16 }}>Настройки ATC</div>
                            <div style={{ fontSize: 12, opacity: 0.7 }}>Параметры рабочей станции диспетчера.</div>
                        </div>
                        <div style={chip("info")}>Профиль: Вышка</div>
                    </div>
                    <div style={card}>
                        <div style={{ fontWeight: 800, marginBottom: 6 }}>Уведомления</div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>
                            Звук запросов: средний · Оповещения: выход на ВПП · Авто-подтв. выкл.
                        </div>
                    </div>
                    <div style={card}>
                        <div style={{ fontWeight: 800, marginBottom: 6 }}>Фильтры</div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>
                            Показывать только: IFR, прибытия в 50 NM, вылеты в 10 NM.
                        </div>
                    </div>
                    <div style={card}>
                        <div style={{ fontWeight: 800, marginBottom: 6 }}>Частота обновления</div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>
                            Радар: 2 сек · Наземные: 1 сек · Сеть: стабильная.
=======
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
>>>>>>> origin/main
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

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
    const [tab, setTab] = useState("flights");
    const [hoveredTab, setHoveredTab] = useState(null);
    const [selectedFlightId, setSelectedFlightId] = useState("TEST001");

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
        <div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 10 }}>
                <div style={{ fontWeight: 900, fontSize: 18 }}>Панель ATC</div>
                <div style={{ fontSize: 12, opacity: 0.6, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    Статус: {status}
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
                    style={tabBtn(tab === "settings", hoveredTab === "settings")}
                    onClick={() => setTab("settings")}
                    onMouseEnter={() => setHoveredTab("settings")}
                    onMouseLeave={() => setHoveredTab(null)}
                >
                    Настройки
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
                            <div style={{ fontWeight: 900, fontSize: 16 }}>Входящие запросы</div>
                            <div style={{ fontSize: 12, opacity: 0.7 }}>
                                Очередь по приоритету и статусам подтверждения.
                            </div>
                        </div>
                        <div style={chip("alert")}>3 ожидают</div>
                    </div>
                    <div style={card}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                            <div style={{ fontWeight: 800 }}>UAE214 · Пушбек</div>
                            <div style={chip("info")}>Гейт B7</div>
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>
                            Запрос на разрешение для pushback. Ожидает подтверждения диспетчера.
                        </div>
                    </div>
                    <div style={card}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                            <div style={{ fontWeight: 800 }}>RYR81Q · Запуск</div>
                            <div style={chip()}>Стоянка 24</div>
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>
                            Запуск двигателей, требуется подтверждение в течение 2 минут.
                        </div>
                    </div>
                    <div style={card}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                            <div style={{ fontWeight: 800 }}>SVO902 · Руление</div>
                            <div style={chip("info")}>ВПП 30L</div>
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>
                            Запрос на руление к исполнительному. Окно связи активное.
                        </div>
                    </div>
                </div>
            )}

            {tab === "flights" && (
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "200px minmax(0, 1fr) 220px",
                        gap: 12,
                    }}
                >
                    <div style={{ ...panelWrap, padding: 10 }}>
                        <div style={{ fontWeight: 900, fontSize: 14 }}>Список рейсов</div>
                        <input
                            placeholder="Поиск (позывной/маршрут)"
                            style={{
                                border: "1px solid rgba(0,0,0,0.1)",
                                borderRadius: 10,
                                padding: "8px 10px",
                                fontSize: 12,
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
                                            border: "1px solid rgba(0,0,0,0.08)",
                                            borderRadius: 12,
                                            padding: "10px 10px",
                                            background: isActive ? "rgba(20,20,20,0.9)" : "#fff",
                                            color: isActive ? "#fff" : "#1e1e1e",
                                            cursor: "pointer",
                                            boxShadow: "0 6px 14px rgba(0,0,0,0.08)",
                                        }}
                                    >
                                        <div style={{ fontWeight: 800 }}>{flight.id}</div>
                                        <div style={{ fontSize: 11, opacity: 0.7 }}>{flight.route}</div>
                                        <div style={{ fontSize: 11, opacity: 0.7 }}>{flight.status}</div>
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
                                    Заглушка карты, будет подключена к реальным данным.
                                </div>
                            </div>
                            <div style={chip("info")}>12 в секторе</div>
                        </div>
                        <div
                            style={{
                                ...card,
                                minHeight: 220,
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                justifyContent: "center",
                                textAlign: "center",
                                color: "#445",
                                background: "linear-gradient(140deg, #f5f7fb 0%, #eef1f7 100%)",
                            }}
                        >
                            <div style={{ fontWeight: 800, marginBottom: 6 }}>Карта (заглушка)</div>
                            <div style={{ fontSize: 12, opacity: 0.7 }}>
                                Подключите реальный слой сюда. Пока отображается описание сектора.
                            </div>
                        </div>
                    </div>

                    <div style={panelWrap}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div>
                                <div style={{ fontWeight: 900, fontSize: 16 }}>Управление рейсом</div>
                                <div style={{ fontSize: 12, opacity: 0.7 }}>
                                    Детали открываются при выборе рейса.
                                </div>
                            </div>
                            <div style={chip("info")}>Активный</div>
                        </div>
                        {selectedFlight ? (
                            <>
                                <div style={card}>
                                    <div style={{ display: "grid", gap: 6, fontSize: 12 }}>
                                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                                            <span style={{ opacity: 0.6 }}>Рейс</span>
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
                                            <span style={{ opacity: 0.6 }}>ВПП</span>
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
                                </div>
                                <div style={card}>
                                    <div style={{ fontWeight: 800, marginBottom: 6 }}>Действия</div>
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                        <div style={chip("info")}>Разрешить руление</div>
                                        <div style={chip()}>Вызвать экипаж</div>
                                        <div style={chip("alert")}>Удерживать</div>
                                    </div>
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
                </div>
            )}

            {tab === "ground" && (
                <div style={panelWrap}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                            <div style={{ fontWeight: 900, fontSize: 16 }}>ВПП и руление</div>
                            <div style={{ fontSize: 12, opacity: 0.7 }}>
                                Назначения полос, точки ожидания, маршруты руления.
                            </div>
                        </div>
                        <div style={chip()}>ВПП 30L активна</div>
                    </div>
                    <div style={card}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                            <div style={{ fontWeight: 800 }}>ВПП 30L</div>
                            <div style={chip("info")}>Посадка</div>
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>
                            Следующий борт через 02:30 · Освобождение по B3 · Ветер 310/12.
                        </div>
                    </div>
                    <div style={card}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                            <div style={{ fontWeight: 800 }}>Поток руления</div>
                            <div style={chip()}>Alpha / Bravo</div>
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>
                            Горячие точки: A4 пересечение · Ограничено из-за работ.
                        </div>
                    </div>
                    <div style={card}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                            <div style={{ fontWeight: 800 }}>Точки ожидания</div>
                            <div style={chip("alert")}>2 заняты</div>
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>
                            B1: UAE214 · C3: SVO902 · Контроль интервалов.
                        </div>
                    </div>
                </div>
            )}

            {tab === "settings" && (
                <div style={panelWrap}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
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

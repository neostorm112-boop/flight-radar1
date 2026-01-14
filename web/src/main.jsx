import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import "leaflet/dist/leaflet.css";

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, errorText: "" };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, errorText: String(error) };
    }

    componentDidCatch(error, info) {
        console.error("App crashed:", error, info);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{ padding: 16, fontFamily: "system-ui" }}>
                    <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 8 }}>
                        Что-то упало в интерфейсе
                    </div>
                    <div style={{ opacity: 0.8, marginBottom: 12 }}>
                        Это не “пропало всё”, это ошибка в коде. Скинь мне текст ниже — починим.
                    </div>
                    <pre
                        style={{
                            background: "#111",
                            color: "#fff",
                            padding: 12,
                            borderRadius: 10,
                            overflow: "auto",
                        }}
                    >
            {this.state.errorText}
          </pre>
                </div>
            );
        }
        return this.props.children;
    }
}

ReactDOM.createRoot(document.getElementById("root")).render(
    <ErrorBoundary>
        <BrowserRouter>
            <App />
        </BrowserRouter>
    </ErrorBoundary>
);
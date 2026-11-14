import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./styles/tokens.css";
import "./styles/fonts.css";
import "./styles/base.css";
import "./styles/shell.css";
import "./styles/panels.css";
import "./styles/map.css";
import "./styles/profile.css";
import "./styles/card.css";
import "./styles/hud.css";
import "./styles/hud3d.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import MobileApp from "./mobile/MobileApp";
import { initNative, isNative } from "./lib/native";

initNative();

// Mobil arayüz: native (Capacitor) uygulamada VEYA ?mobile=1 ile tarayıcı önizlemede.
const wantMobile = isNative() || new URLSearchParams(window.location.search).has("mobile");

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    {wantMobile ? <MobileApp /> : <App />}
  </React.StrictMode>,
);

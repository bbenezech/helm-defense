import React from "react";
import ReactDOM from "react-dom/client";
import "./style.css";
import { App } from "./components/app.tsx";

window.app = <App />;
ReactDOM.createRoot(document.querySelector("#root") as HTMLElement).render(window.app);

const NODE_ENV = import.meta.env.PROD ? "production" : "development";
if (NODE_ENV === "development")
  console.log(`Running with NODE_ENV=${NODE_ENV}, mode=${import.meta.env.MODE}, BASE_URL=${import.meta.env.BASE_URL}`);

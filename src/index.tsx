import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./components/app";
import "./style.css";

window.app = <App />;
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<App />);

const NODE_ENV = import.meta.env.PROD ? "production" : "development";
if (NODE_ENV === "development")
  console.log(`Running with NODE_ENV=${NODE_ENV}, mode=${import.meta.env.MODE}, BASE_URL=${import.meta.env.BASE_URL}`);

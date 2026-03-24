import React from "react";
import { Game } from "./game.tsx";
import { HudPanel } from "./hud-panel.tsx";

export function App() {
  return (
    <div id="app">
      <Game />
      <React.StrictMode>
        <HudPanel />
      </React.StrictMode>
    </div>
  );
}

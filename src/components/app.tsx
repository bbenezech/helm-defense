import React from "react";
import scoreStore from "../store/score.ts";
import fpsBus from "../store/fps.ts";
import timeScaleStore from "../store/time-scale.ts";
import { useBusValue, useStoreValue } from "./useStore.ts";
import { Game } from "./game.tsx";

export function App() {
  const fsp = useBusValue(fpsBus);
  const score = useStoreValue(scoreStore);
  const timeScale = useStoreValue(timeScaleStore);

  return (
    <div id="app">
      <Game />
      <React.StrictMode>
        <div className="hud">
          <div className="hud-top">
            <div>SCORE {score}</div>
            <div
              className="interactive"
              onClick={() => timeScaleStore.togglePause()}
              onDoubleClick={() => timeScaleStore.reset()}
            >
              TimeScale {Math.round(timeScale * 100)}%
            </div>
            <div>FPS {fsp ? Math.round(fsp) : " - "}</div>
          </div>
        </div>
      </React.StrictMode>
    </div>
  );
}

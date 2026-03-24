import React from "react";
import scoreStore from "../store/score.ts";
import fpsBus from "../store/fps.ts";
import threeDebugViewStore from "../store/three-debug-view.ts";
import threeLightingStore from "../store/three-lighting.ts";
import timeScaleStore from "../store/time-scale.ts";
import { useBusValue, useStoreValue } from "./useStore.ts";
import { Game } from "./game.tsx";

export function App() {
  const fsp = useBusValue(fpsBus);
  const score = useStoreValue(scoreStore);
  const timeScale = useStoreValue(timeScaleStore);
  const threeDebugView = useStoreValue(threeDebugViewStore);
  const threeLighting = useStoreValue(threeLightingStore);

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
          <div className="hud-controls">
            <div className="hud-slider">
              <span>Debug View {threeDebugView === "beauty" ? "Beauty" : "Checker"}</span>
              <div className="hud-button-row">
                <button
                  type="button"
                  className="hud-button"
                  data-active={threeDebugView === "beauty"}
                  onClick={() => threeDebugViewStore.set("beauty")}
                >
                  Beauty
                </button>
                <button
                  type="button"
                  className="hud-button"
                  data-active={threeDebugView === "checker"}
                  onClick={() => threeDebugViewStore.set("checker")}
                >
                  Checker
                </button>
              </div>
            </div>
            <label className="hud-slider">
              <span>Sun Azimuth {Math.round(threeLighting.sunAzimuthDeg)}°</span>
              <input
                type="range"
                min={-180}
                max={180}
                step={1}
                value={threeLighting.sunAzimuthDeg}
                onChange={(event) =>
                  threeLightingStore.set((current) => ({
                    ...current,
                    sunAzimuthDeg: event.currentTarget.valueAsNumber,
                  }))
                }
              />
            </label>
            <label className="hud-slider">
              <span>Sun Elevation {Math.round(threeLighting.sunElevationDeg)}°</span>
              <input
                type="range"
                min={5}
                max={85}
                step={1}
                value={threeLighting.sunElevationDeg}
                onChange={(event) =>
                  threeLightingStore.set((current) => ({
                    ...current,
                    sunElevationDeg: event.currentTarget.valueAsNumber,
                  }))
                }
              />
            </label>
            <label className="hud-slider">
              <span>Ambient {threeLighting.ambient.toFixed(2)}</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={threeLighting.ambient}
                onChange={(event) =>
                  threeLightingStore.set((current) => ({
                    ...current,
                    ambient: event.currentTarget.valueAsNumber,
                  }))
                }
              />
            </label>
          </div>
        </div>
      </React.StrictMode>
    </div>
  );
}

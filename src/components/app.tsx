import React from "react";
import scoreStore from "../store/score.ts";
import fpsBus from "../store/fps.ts";
import rendererModeStore from "../store/renderer-mode.ts";
import threeLightingStore from "../store/three-lighting.ts";
import timeScaleStore from "../store/time-scale.ts";
import { useBusValue, useStoreValue } from "./useStore.ts";
import { Game } from "./game.tsx";

export function App() {
  const fsp = useBusValue(fpsBus);
  const score = useStoreValue(scoreStore);
  const rendererMode = useStoreValue(rendererModeStore);
  const timeScale = useStoreValue(timeScaleStore);
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
            <div
              className="interactive"
              onClick={() => rendererModeStore.toggle()}
              onDoubleClick={() => rendererModeStore.reset()}
            >
              Renderer {rendererMode.toUpperCase()}
            </div>
            <div>FPS {fsp ? Math.round(fsp) : " - "}</div>
          </div>
          {rendererMode === "three" ? (
            <div className="hud-controls">
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
          ) : null}
        </div>
      </React.StrictMode>
    </div>
  );
}

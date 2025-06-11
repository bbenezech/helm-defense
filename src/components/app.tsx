import React from "react";
import scoreStore from "../store/score";
import fpsBus from "../store/fps";
import timeScaleStore from "../store/time-scale";
import { PhaserGame } from "./phaser-game";

export function App() {
  const [fsp, setFps] = React.useState<number | null>(null);
  React.useEffect(() => {
    return fpsBus.subscribe(setFps);
  }, []);

  const score = React.useSyncExternalStore(scoreStore.subscribe, scoreStore.get);
  const timeScale = React.useSyncExternalStore(timeScaleStore.subscribe, timeScaleStore.get);
  const gameRef = React.useRef<Phaser.Game>(null);

  React.useLayoutEffect(() => {
    if (window.electron) return;

    const game = gameRef.current;
    if (!game) throw new Error("Game instance not found");

    function handleBlur() {
      if (game && game.isRunning && !game.isPaused) {
        game.pause();
        document.title = `Paused - ${document.title}`;
      }
    }

    function handleFocus() {
      if (game && game.isRunning && game.isPaused) {
        game.resume();
        document.title = document.title.replace("Paused - ", "");
      }
    }
    if (game) {
      window.addEventListener("focus", handleFocus);
      window.addEventListener("blur", handleBlur);
    }

    return () => {
      if (game) {
        window.removeEventListener("blur", handleFocus);
        window.removeEventListener("focus", handleFocus);
      }
    };
  }, []);

  return (
    <div id="app">
      <PhaserGame ref={gameRef} />
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

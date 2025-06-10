import React from "react";
import scoreStore from "../store/score";
import fpsBus from "../store/fps";
import timeScaleStore from "../store/time-scale";
import { PhaserGame } from "./phaser-game";

export function App() {
  const [score] = scoreStore.use();
  const [fps] = fpsBus.use();
  const [timeScale] = timeScaleStore.use();
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
      (window as any).game = game;
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
      <div className="hud">
        <div>SCORE {score}</div>
        <div
          className="interactive"
          onClick={() => timeScaleStore.togglePause()}
          onDoubleClick={() => timeScaleStore.reset()}
        >
          TimeScale {Math.round(timeScale * 100)}%
        </div>
        <div>FPS {fps ? Math.round(fps) : " - "}</div>
      </div>
    </div>
  );
}

import React from "react";
import scoreStore from "../store/score";
import fpsBus from "../store/fps";
import { PhaserGame } from "./phaser-game";

export function App() {
  const [score] = scoreStore.use();
  const [fps] = fpsBus.use();
  const gameRef = React.useRef<Phaser.Game>(null);

  React.useLayoutEffect(() => {
    //const game = gameRef.current;
    //function handleBlur() {
    //  if (game && game.isRunning && !game.isPaused) {
    //    game.pause();
    //    document.title = `Paused - ${document.title}`;
    //  }
    //}
    //
    //function handleFocus() {
    //  if (game && game.isRunning && game.isPaused) {
    //    game.resume();
    //    document.title = document.title.replace("Paused - ", "");
    //  }
    //}
    //if (game) {
    //  (window as any).game = game;
    //  //window.addEventListener("focus", handleFocus);
    //  //window.addEventListener("blur", handleBlur);
    //}
    //
    //return () => {
    //  if (game) {
    //    //window.removeEventListener("blur", handleFocus);
    //    //window.removeEventListener("focus", handleFocus);
    //  }
    //};
  }, []);

  return (
    <div id="app">
      <PhaserGame ref={gameRef} />
      <div className="hud">
        <div className="score-display">SCORE: {score}</div>
        <div className="fps-display">FPS: {fps}</div>
      </div>
    </div>
  );
}

import React from "react";
import { start } from "../game/index.ts";

const PAUSED_PREFIX = "Paused - ";
function handleBlur(game: Phaser.Game) {
  if (globalThis.electron) return;
  if (game.isRunning && !game.isPaused) {
    game.pause();
    if (!document.title.startsWith(PAUSED_PREFIX)) document.title = `${PAUSED_PREFIX}${document.title}`;
  }
}

function handleFocus(game: Phaser.Game) {
  if (globalThis.electron) return;
  if (game.isRunning && game.isPaused) {
    game.resume();
    document.title = document.title.replace(PAUSED_PREFIX, "");
  }
}

const GAME_DOM_ID = "game-container";

export const Game = () => {
  React.useLayoutEffect(() => {
    const game = (globalThis.game = start(GAME_DOM_ID));

    const onFocus = handleFocus.bind(null, game);
    const onBlur = handleBlur.bind(null, game);

    globalThis.addEventListener("focus", onFocus);
    globalThis.addEventListener("blur", onBlur);

    return () => {
      console.log("Cleaning up game resources");
      globalThis.removeEventListener("blur", onFocus);
      globalThis.removeEventListener("focus", onBlur);
      game.destroy(true);
      delete globalThis.game;
    };
  }, []);

  return <div id={GAME_DOM_ID}></div>;
};

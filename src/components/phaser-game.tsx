import React from "react";
import { start } from "../game";

export const PhaserGame = React.forwardRef<Phaser.Game>(function PhaserGame({}, ref) {
  const gameRef = React.useRef<Phaser.Game>(null);

  React.useLayoutEffect(() => {
    const game = start("game-container");
    gameRef.current = game;
    if (ref !== null && typeof ref === "object" && "current" in ref) ref.current = game;

    return () => {
      game.destroy(true);
    };
  }, [ref]);

  return <div id="game-container"></div>;
});

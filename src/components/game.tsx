import React from "react";
import { startThreeApp, type ThreeTerrainApp } from "../../three/index.ts";
import { start } from "../game/index.ts";
import rendererModeStore from "../store/renderer-mode.ts";
import timeScaleStore from "../store/time-scale.ts";
import { useStoreValue } from "./useStore.ts";

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

type RunningApp = { kind: "phaser"; instance: Phaser.Game } | { kind: "three"; instance: ThreeTerrainApp };

export const Game = () => {
  const rendererMode = useStoreValue(rendererModeStore);
  const timeScale = useStoreValue(timeScaleStore);
  const appRef = React.useRef<RunningApp | undefined>(undefined);

  React.useLayoutEffect(() => {
    const host = document.querySelector(`#${GAME_DOM_ID}`) as HTMLDivElement;
    let disposed = false;

    const onFocus = () => {
      const runningApp = appRef.current;
      if (!runningApp) return;
      if (runningApp.kind === "phaser") {
        handleFocus(runningApp.instance);
      } else if (!globalThis.electron) {
        runningApp.instance.setPaused(timeScaleStore.get() === 0);
        document.title = document.title.replace(PAUSED_PREFIX, "");
      }
    };

    const onBlur = () => {
      const runningApp = appRef.current;
      if (!runningApp) return;
      if (runningApp.kind === "phaser") {
        handleBlur(runningApp.instance);
      } else if (!globalThis.electron) {
        runningApp.instance.setPaused(true);
        if (!document.title.startsWith(PAUSED_PREFIX)) document.title = `${PAUSED_PREFIX}${document.title}`;
      }
    };

    const mount = async () => {
      host.replaceChildren();
      if (rendererMode === "phaser") {
        const game = (globalThis.game = start(GAME_DOM_ID));
        appRef.current = { kind: "phaser", instance: game };
      } else {
        try {
          const app = await startThreeApp(host);
          if (disposed) {
            app.destroy();
            return;
          }

          app.setPaused(timeScale === 0);
          app.resize(host.clientWidth, host.clientHeight);
          appRef.current = { kind: "three", instance: app };
        } catch (error) {
          console.error("Failed to start Three terrain app", error);
          host.textContent = error instanceof Error ? error.message : "Failed to start Three terrain app.";
        }
      }
    };

    const onResize = () => {
      const runningApp = appRef.current;
      if (runningApp?.kind !== "three") return;
      runningApp.instance.resize(host.clientWidth, host.clientHeight);
    };

    globalThis.addEventListener("focus", onFocus);
    globalThis.addEventListener("blur", onBlur);
    globalThis.addEventListener("resize", onResize);
    void mount();

    return () => {
      disposed = true;
      globalThis.removeEventListener("focus", onFocus);
      globalThis.removeEventListener("blur", onBlur);
      globalThis.removeEventListener("resize", onResize);
      const runningApp = appRef.current;
      if (runningApp?.kind === "phaser") {
        runningApp.instance.destroy(true);
        delete globalThis.game;
      } else {
        runningApp?.instance.destroy();
      }
      appRef.current = undefined;
      delete globalThis.game;
    };
  }, [rendererMode]);

  React.useEffect(() => {
    const runningApp = appRef.current;
    if (runningApp?.kind === "three") runningApp.instance.setPaused(timeScale === 0);
  }, [timeScale]);
  return <div id={GAME_DOM_ID}></div>;
};

import React from "react";
import { startThreeApp, type ThreeTerrainApp } from "../../three/app.ts";
import threeDebugViewStore from "../store/three-debug-view.ts";
import threeLightingStore from "../store/three-lighting.ts";
import threeCompassStore from "../store/three-compass.ts";
import threeSeaDebugViewStore from "../store/three-sea-debug-view.ts";
import threeSeaStore from "../store/three-sea.ts";
import threeTerrainStore from "../store/three-terrain.ts";
import threeTerrainOverlayStore from "../store/three-terrain-overlay.ts";
import timeScaleStore from "../store/time-scale.ts";
import { useStoreValue } from "./useStore.ts";

const PAUSED_PREFIX = "Paused - ";
const GAME_DOM_ID = "game-container";

export const Game = () => {
  const threeDebugView = useStoreValue(threeDebugViewStore);
  const timeScale = useStoreValue(timeScaleStore);
  const threeLighting = useStoreValue(threeLightingStore);
  const threeSea = useStoreValue(threeSeaStore);
  const threeSeaDebugView = useStoreValue(threeSeaDebugViewStore);
  const threeTerrain = useStoreValue(threeTerrainStore);
  const threeTerrainOverlay = useStoreValue(threeTerrainOverlayStore);
  const appReference = React.useRef<ThreeTerrainApp | undefined>(undefined);

  React.useLayoutEffect(() => {
    const host = document.querySelector<HTMLDivElement>(`#${GAME_DOM_ID}`);
    if (host === null) {
      throw new TypeError(`Expected #${GAME_DOM_ID} to exist before starting the game host.`);
    }
    let disposed = false;
    let unsubscribeCompass: (() => void) | null = null;

    const onFocus = () => {
      const runningApp = appReference.current;
      if (runningApp === undefined || globalThis.electron) return;
      runningApp.setPaused(timeScaleStore.get() === 0);
      document.title = document.title.replace(PAUSED_PREFIX, "");
    };

    const onBlur = () => {
      const runningApp = appReference.current;
      if (runningApp === undefined || globalThis.electron) return;
      runningApp.setPaused(true);
      if (!document.title.startsWith(PAUSED_PREFIX)) document.title = `${PAUSED_PREFIX}${document.title}`;
    };

    const mount = async () => {
      host.replaceChildren();
      try {
        const app = await startThreeApp(host);
        if (disposed) {
          app.destroy();
          return;
        }

        app.setPaused(timeScaleStore.get() === 0);
        app.setLighting(threeLightingStore.get());
        app.setTerrain(threeTerrainStore.get());
        app.setSea(threeSeaStore.get());
        app.setDebugView(threeDebugViewStore.get());
        app.setTerrainOverlay(threeTerrainOverlayStore.get());
        app.setSeaDebugView(threeSeaDebugViewStore.get());
        app.resize(host.clientWidth, host.clientHeight);
        appReference.current = app;
        threeCompassStore.set(app.getCompassState());
        unsubscribeCompass = app.subscribeCompass((state) => {
          threeCompassStore.set(state);
        });
      } catch (error) {
        threeCompassStore.reset();
        console.error("Failed to start Three terrain app", error);
        host.textContent = error instanceof Error ? error.message : "Failed to start Three terrain app.";
      }
    };

    const onResize = () => {
      const runningApp = appReference.current;
      if (runningApp === undefined) return;
      runningApp.resize(host.clientWidth, host.clientHeight);
    };

    globalThis.addEventListener("focus", onFocus);
    globalThis.addEventListener("blur", onBlur);
    globalThis.addEventListener("resize", onResize);
    void mount();

    return () => {
      disposed = true;
      if (unsubscribeCompass !== null) unsubscribeCompass();
      threeCompassStore.reset();
      globalThis.removeEventListener("focus", onFocus);
      globalThis.removeEventListener("blur", onBlur);
      globalThis.removeEventListener("resize", onResize);
      const runningApp = appReference.current;
      if (runningApp !== undefined) runningApp.destroy();
      appReference.current = undefined;
    };
  }, []);

  React.useEffect(() => {
    const runningApp = appReference.current;
    if (runningApp !== undefined) runningApp.setPaused(timeScale === 0);
  }, [timeScale]);

  React.useEffect(() => {
    const runningApp = appReference.current;
    if (runningApp !== undefined) runningApp.setLighting(threeLighting);
  }, [threeLighting]);

  React.useEffect(() => {
    const runningApp = appReference.current;
    if (runningApp !== undefined) runningApp.setTerrain(threeTerrain);
  }, [threeTerrain]);

  React.useEffect(() => {
    const runningApp = appReference.current;
    if (runningApp !== undefined) runningApp.setSea(threeSea);
  }, [threeSea]);

  React.useEffect(() => {
    const runningApp = appReference.current;
    if (runningApp !== undefined) runningApp.setDebugView(threeDebugView);
  }, [threeDebugView]);

  React.useEffect(() => {
    const runningApp = appReference.current;
    if (runningApp !== undefined) runningApp.setTerrainOverlay(threeTerrainOverlay);
  }, [threeTerrainOverlay]);

  React.useEffect(() => {
    const runningApp = appReference.current;
    if (runningApp !== undefined) runningApp.setSeaDebugView(threeSeaDebugView);
  }, [threeSeaDebugView]);

  return <div id={GAME_DOM_ID}></div>;
};

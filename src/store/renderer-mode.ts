import type { RendererMode } from "../../three/index.ts";
import { localStore } from "./index.ts";

function getDefaultRendererMode(): RendererMode {
  const search = new URLSearchParams(globalThis.location.search);
  const requestedRenderer = search.get("renderer");
  return requestedRenderer === "phaser" || requestedRenderer === "three" ? requestedRenderer : "three";
}

const store = localStore<RendererMode>("renderer-mode", getDefaultRendererMode());

export default {
  ...store,
  toggle: () => store.set((current) => (current === "three" ? "phaser" : "three")),
  reset: () => store.set("three"),
};

import { localStore } from "./index.ts";

export type RendererMode = "phaser" | "three";

function getRequestedRendererMode(): RendererMode | null {
  const search = new URLSearchParams(globalThis.location.search);
  const requestedRenderer = search.get("renderer");
  if (requestedRenderer === "phaser" || requestedRenderer === "three") return requestedRenderer;
  return null;
}

const store = localStore<RendererMode>("renderer-mode", "three");

function getRendererMode(): RendererMode {
  const requestedRenderer = getRequestedRendererMode();
  if (requestedRenderer !== null) return requestedRenderer;
  return store.get();
}

export default {
  subscribe: store.subscribe,
  get: getRendererMode,
  set: store.set,
  setDebounced: store.setDebounced,
  toggle: () => store.set((current) => (current === "three" ? "phaser" : "three")),
  reset: () => store.set("three"),
};

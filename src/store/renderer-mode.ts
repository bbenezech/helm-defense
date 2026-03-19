import { localStore } from "./index.ts";

export type RendererMode = "phaser" | "three";

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

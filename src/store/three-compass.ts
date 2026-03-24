import type { ThreeCompassState } from "../../three/projection.ts";
import { memoryStore } from "./index.ts";

const store = memoryStore<ThreeCompassState | null>(null);

export default {
  subscribe: store.subscribe,
  get: store.get,
  set: store.set,
  setDebounced: store.setDebounced,
  reset: () => store.set(null),
};

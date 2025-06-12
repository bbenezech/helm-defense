import { sessionStore } from ".";

const options: number[] = [0, 0.25, 0.5, 1, 2, 4];

const { get, set, subscribe, setDebounced } = sessionStore("time-scale", 1);

export default {
  get,
  subscribe,
  set,
  setDebounced,
  reset: () => set(1),
  togglePause: () => set((timeScale) => (timeScale === 0 ? 1 : 0)),
  slowDown: () => {
    const newTimeScale = options[options.indexOf(get()) - 1];
    if (newTimeScale === undefined) {
      return false;
    } else {
      set(newTimeScale);
      return true;
    }
  },
  speedUp: () => {
    const newTimeScale = options[options.indexOf(get()) + 1];
    if (newTimeScale === undefined) {
      return false;
    } else {
      set(newTimeScale);
      return true;
    }
  },
};

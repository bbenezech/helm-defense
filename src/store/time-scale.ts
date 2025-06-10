import { store } from ".";

const options: number[] = [0, 0.25, 0.5, 1, 2, 4];

const { get, set, use } = store(1);

export default {
  use,
  get,
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

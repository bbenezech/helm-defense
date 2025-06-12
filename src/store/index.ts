import debounce from "lodash.debounce";

type EventCallback<T> = (payload: T) => void;

type SetStateAction<T> = T | ((prevState: T) => T);
type Unsubscribe = () => void;

type Options = {
  debounceDuration?: number;
  debounceOptions?: { leading?: boolean; trailing?: boolean; maxWait?: number };
};
const optionsDefault: Options = {
  debounceDuration: 100,
  debounceOptions: { leading: false, trailing: true, maxWait: 500 },
};

export type Bus<T> = {
  subscribe: (callback: EventCallback<T>) => Unsubscribe;
  emit: (payload: T) => void;
  emitDebounced: (payload: T) => void;
};

// dumb event bus
export function bus<T>(options = optionsDefault): Bus<T> {
  let events: EventCallback<T>[] = [];
  const subscribe = (callback: EventCallback<T>): Unsubscribe => {
    events.push(callback);
    return () => {
      events = events.filter((cb) => cb !== callback);
    };
  };
  const emit = (payload: T) => events.forEach((callback) => callback(payload));
  const emitDebounced = debounce(emit, options.debounceDuration, options.debounceOptions);
  return { subscribe, emit, emitDebounced };
}

export type Store<T> = {
  subscribe: (callback: EventCallback<T>) => Unsubscribe;
  get: () => T;
  set: (newState: SetStateAction<T>) => void;
  setDebounced: (newState: SetStateAction<T>) => void;
};

// dumb zustand-like memory store
export function memoryStore<T>(initialState: T, options = optionsDefault): Store<T> {
  let state = initialState;
  const { subscribe, emit, emitDebounced } = bus<T>(options);
  const get = () => state;
  const set = (action: SetStateAction<T>) => {
    state = typeof action === "function" ? (action as (prevState: T) => T)(state) : action;
    emit(state);
  };
  const setDebounced = (action: SetStateAction<T>) => {
    state = typeof action === "function" ? (action as (prevState: T) => T)(state) : action;
    emitDebounced(state);
  };
  return { subscribe, set, setDebounced, get };
}

const sessionKeys = new Set<string>();
export function sessionStore<T>(key: string, defaultValue: T, options = optionsDefault): Store<T> {
  if (sessionKeys.has(key) && !import.meta.hot) throw new Error(`Session store with key "${key}" already exists.`);
  sessionKeys.add(key);

  const { subscribe, emit, emitDebounced } = bus<T>(options);
  const get = () => readSession<T>(key, defaultValue);
  const set = (action: SetStateAction<T>) => {
    const value = typeof action === "function" ? (action as (prevState: T) => T)(get()) : action;
    writeSession(key, value, defaultValue);
    emit(value);
  };
  const setDebounced = (action: SetStateAction<T>) => {
    const value = typeof action === "function" ? (action as (prevState: T) => T)(get()) : action;
    writeSession(key, value, defaultValue);
    emitDebounced(value);
  };
  return { subscribe, set, setDebounced, get };
}

function readSession<T>(key: string, defaultValue: T): T {
  const storedValue = window.sessionStorage.getItem(key);
  if (storedValue === null) return defaultValue;
  try {
    return JSON.parse(storedValue);
  } catch (e) {
    return defaultValue;
  }
}

function writeSession<T>(key: string, value: T, defaultValue: T): void {
  if (value === undefined || value === defaultValue) {
    window.sessionStorage.removeItem(key);
  } else {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  }
}

const localKeys = new Set<string>();
export function localStore<T>(key: string, defaultValue: T, options = optionsDefault): Store<T> {
  if (localKeys.has(key) && !import.meta.hot) throw new Error(`Local store with key "${key}" already exists.`);
  localKeys.add(key);
  const { subscribe, emit, emitDebounced } = bus<T>(options);
  const get = () => readLocal<T>(key, defaultValue);
  const set = (action: SetStateAction<T>) => {
    const value = typeof action === "function" ? (action as (prevState: T) => T)(get()) : action;
    writeLocal(key, value, defaultValue);
    emit(value);
  };
  const setDebounced = (action: SetStateAction<T>) => {
    const value = typeof action === "function" ? (action as (prevState: T) => T)(get()) : action;
    writeLocal(key, value, defaultValue);
    emitDebounced(value);
  };
  return { subscribe, set, setDebounced, get };
}

function readLocal<T>(key: string, defaultValue: T): T {
  const storedValue = window.localStorage.getItem(key);
  if (storedValue === null) return defaultValue;
  try {
    return JSON.parse(storedValue);
  } catch (e) {
    return defaultValue;
  }
}

function writeLocal<T>(key: string, value: T, defaultValue: T): void {
  if (value === undefined || value === defaultValue) {
    window.localStorage.removeItem(key);
  } else {
    window.localStorage.setItem(key, JSON.stringify(value));
  }
}

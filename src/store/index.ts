import debounce from "lodash.debounce";

type EventCallback<T> = (payload: T) => void;

type SetStateAction<T> = T | ((previousState: T) => T);
type Unsubscribe = () => void;
type DebounceOptions = {
  leading: boolean;
  trailing: boolean;
  maxWait: number;
};

type Options = {
  debounceDuration: number;
  debounceOptions: DebounceOptions;
};

export type StorageCodec<T> = {
  parse: (storedValue: string) => T;
  serialize: (value: T) => string;
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

function isSetStateUpdater<T>(action: SetStateAction<T>): action is (previousState: T) => T {
  return typeof action === "function";
}

function resolveSetStateAction<T>(action: SetStateAction<T>, previousState: T): T {
  if (isSetStateUpdater(action)) {
    return action(previousState);
  }

  return action;
}

// dumb event bus
export function bus<T>(options = optionsDefault): Bus<T> {
  let events: EventCallback<T>[] = [];
  const subscribe = (callback: EventCallback<T>): Unsubscribe => {
    events.push(callback);
    return () => {
      events = events.filter((callback_) => callback_ !== callback);
    };
  };
  const emit = (payload: T) => {
    for (const callback of events) callback(payload);
  };
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
    state = resolveSetStateAction(action, state);
    emit(state);
  };
  const setDebounced = (action: SetStateAction<T>) => {
    state = resolveSetStateAction(action, state);
    emitDebounced(state);
  };
  return { subscribe, set, setDebounced, get };
}

export const finiteNumberStorageCodec: StorageCodec<number> = {
  parse: (storedValue) => {
    const value = Number(storedValue);
    if (!Number.isFinite(value)) throw new Error(`Stored number "${storedValue}" is invalid.`);
    return value;
  },
  serialize: (value) => value.toString(),
};

const sessionKeys = new Set<string>();
export function sessionStore<T>(
  key: string,
  defaultValue: T,
  storageCodec: StorageCodec<T>,
  options = optionsDefault,
): Store<T> {
  if (sessionKeys.has(key) && !import.meta.hot) throw new Error(`Session store with key "${key}" already exists.`);
  sessionKeys.add(key);

  const { subscribe, emit, emitDebounced } = bus<T>(options);
  const get = () => readSession(key, defaultValue, storageCodec);
  const set = (action: SetStateAction<T>) => {
    const value = resolveSetStateAction(action, get());
    writeSession(key, value, defaultValue, storageCodec);
    emit(value);
  };
  const setDebounced = (action: SetStateAction<T>) => {
    const value = resolveSetStateAction(action, get());
    writeSession(key, value, defaultValue, storageCodec);
    emitDebounced(value);
  };
  return { subscribe, set, setDebounced, get };
}

function readSession<T>(key: string, defaultValue: T, storageCodec: StorageCodec<T>): T {
  const storedValue = globalThis.sessionStorage.getItem(key);
  if (storedValue === null) return defaultValue;
  try {
    return storageCodec.parse(storedValue);
  } catch {
    globalThis.sessionStorage.removeItem(key);
    return defaultValue;
  }
}

function writeSession<T>(key: string, value: T, defaultValue: T, storageCodec: StorageCodec<T>): void {
  if (value === defaultValue) {
    globalThis.sessionStorage.removeItem(key);
  } else {
    globalThis.sessionStorage.setItem(key, storageCodec.serialize(value));
  }
}

const localKeys = new Set<string>();
export function localStore<T>(
  key: string,
  defaultValue: T,
  storageCodec: StorageCodec<T>,
  options = optionsDefault,
): Store<T> {
  if (localKeys.has(key) && !import.meta.hot) throw new Error(`Local store with key "${key}" already exists.`);
  localKeys.add(key);
  const { subscribe, emit, emitDebounced } = bus<T>(options);
  const get = () => readLocal(key, defaultValue, storageCodec);
  const set = (action: SetStateAction<T>) => {
    const value = resolveSetStateAction(action, get());
    writeLocal(key, value, defaultValue, storageCodec);
    emit(value);
  };
  const setDebounced = (action: SetStateAction<T>) => {
    const value = resolveSetStateAction(action, get());
    writeLocal(key, value, defaultValue, storageCodec);
    emitDebounced(value);
  };
  return { subscribe, set, setDebounced, get };
}

function readLocal<T>(key: string, defaultValue: T, storageCodec: StorageCodec<T>): T {
  const storedValue = globalThis.localStorage.getItem(key);
  if (storedValue === null) return defaultValue;
  try {
    return storageCodec.parse(storedValue);
  } catch {
    globalThis.localStorage.removeItem(key);
    return defaultValue;
  }
}

function writeLocal<T>(key: string, value: T, defaultValue: T, storageCodec: StorageCodec<T>): void {
  if (value === defaultValue) {
    globalThis.localStorage.removeItem(key);
  } else {
    globalThis.localStorage.setItem(key, storageCodec.serialize(value));
  }
}

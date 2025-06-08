import React from "react";
import debounce from "lodash.debounce";

type EventCallback<T> = (payload: T) => void;
type SetStateAction<T> = T | ((prevState: T) => T);
type Unsubscribe = () => void;

// dumb event bus implementation
export function bus<T>(): {
  subscribe: (callback: EventCallback<T>) => Unsubscribe;
  use: () => readonly [T | undefined, (payload: T) => void];
  emit: (payload: T) => void;
  emitDebounced: (payload: T) => void;
} {
  let events: EventCallback<T>[] = [];
  const subscribe = (callback: EventCallback<T>): Unsubscribe => {
    events.push(callback);
    const unsubscribe = () => {
      events = events.filter((cb) => cb !== callback);
    };
    return unsubscribe;
  };

  const emit = (payload: T) => {
    events.forEach((callback) => callback(payload));
  };

  const emitDebounced = debounce(emit, 100, { leading: true, trailing: true, maxWait: 500 });

  const use = () => {
    const [state, setState] = React.useState<T>();
    React.useEffect(() => subscribe(setState), []);
    return [state, emit] as const;
  };

  return { subscribe, emit, emitDebounced, use };
}

// zustand-like memory store implementation
export function store<T>(initialState: T): {
  subscribe: (callback: EventCallback<T>) => Unsubscribe;
  get: () => T;
  set: (newState: SetStateAction<T>) => void;
  use: () => readonly [T, (newState: SetStateAction<T>) => void];
} {
  let state = initialState;
  const { subscribe, emit } = bus<T>();

  const get = () => state;

  const set = (action: SetStateAction<T>) => {
    state = typeof action === "function" ? (action as (prevState: T) => T)(state) : action;
    emit(state);
  };

  const use = () => [React.useSyncExternalStore(subscribe, get), set] as const;
  return { subscribe, set, get, use };
}

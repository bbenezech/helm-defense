import React from "react";
import type { Bus, Store } from "../store/index.js";

export function useBusValue<T>({ subscribe }: Bus<T>): T | undefined {
  const [state, setState] = React.useState<T>();
  React.useEffect(() => subscribe(setState), [subscribe]);
  return state;
}

export function useStoreValue<T>({ subscribe, get }: Store<T>): T {
  return React.useSyncExternalStore(subscribe, get);
}

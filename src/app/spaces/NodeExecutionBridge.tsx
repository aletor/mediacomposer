"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
} from "react";

type RunFn = () => Promise<void>;

const Ctx = createContext<{
  register: (id: string, run: RunFn) => () => void;
  runSequential: (ids: string[]) => Promise<void>;
} | null>(null);

export function NodeExecutionProvider({ children }: { children: React.ReactNode }) {
  const mapRef = useRef(new Map<string, RunFn>());

  const register = useCallback((id: string, run: RunFn) => {
    mapRef.current.set(id, run);
    return () => {
      if (mapRef.current.get(id) === run) mapRef.current.delete(id);
    };
  }, []);

  const runSequential = useCallback(async (ids: string[]) => {
    for (const id of ids) {
      const fn = mapRef.current.get(id);
      if (fn) {
        try {
          await fn();
        } catch (e) {
          console.error("[NodeExecution]", id, e);
        }
      } else {
        console.warn("[NodeExecution] No handler registered for node", id);
      }
      await new Promise((r) => setTimeout(r, 120));
    }
  }, []);

  return (
    <Ctx.Provider value={{ register, runSequential }}>{children}</Ctx.Provider>
  );
}

export function useNodeExecutionRegister(): (id: string, run: RunFn) => () => void {
  const ctx = useContext(Ctx);
  if (!ctx) {
    return () => () => {};
  }
  return ctx.register;
}

export function useNodeExecutionRunner(): ((ids: string[]) => Promise<void>) | null {
  const ctx = useContext(Ctx);
  if (!ctx) return null;
  return ctx.runSequential;
}

/** Registra la misma función que el botón Run del nodo (estable vía ref). */
export function useRegisterAssistantNodeRun(id: string, run: () => Promise<void>) {
  const register = useNodeExecutionRegister();
  const runRef = useRef(run);
  runRef.current = run;

  useEffect(() => {
    return register(id, () => runRef.current());
  }, [id, register]);
}

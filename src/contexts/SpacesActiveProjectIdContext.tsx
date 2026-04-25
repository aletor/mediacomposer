"use client";

import { createContext, useContext } from "react";

export const SpacesActiveProjectIdContext = createContext<string | null>(null);

export function useSpacesActiveProjectId(): string | null {
  return useContext(SpacesActiveProjectIdContext);
}

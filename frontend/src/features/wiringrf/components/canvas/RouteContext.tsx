import { createContext, useContext } from "react";
import type { Pt } from "@/features/wiringrf/lib/router";

export const RouteContext = createContext<Record<string, Pt[]>>({});
export const useRoutes = () => useContext(RouteContext);

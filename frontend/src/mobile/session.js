import { createContext, useContext } from "react";

// Oturum context'i (username + logout). MobileApp sağlar; ekranlar tüketir.
// Ayrı dosya: Products <-> MobileApp dairesel importunu önler.
export const SessionCtx = createContext(null);
export const useSession = () => useContext(SessionCtx);

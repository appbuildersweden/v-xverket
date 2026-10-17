import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Panel } from './lib/auth-types';
import { FIRST_PAGE } from './lib/nav';
import { parseHashRoute } from './lib/hash-route';

/**
 * Navigationstillståndet. Panelen är rollens panel och sidan är ett sid-id från
 * lib/nav. Detta är den enda källan för "var är vi" — ruttvakten i App avgör om
 * användaren får vara kvar där, och adressfältet speglar bara tillståndet.
 */
export type PanelType = Panel;

export interface NavRoute {
  panel: Panel;
  page: string;
}

interface NavContextValue extends NavRoute {
  setPanel: (panel: Panel) => void;
  setPage: (page: string) => void;
  setRoute: (route: NavRoute) => void;
  reset: () => void;
}

const NavCtx = createContext<NavContextValue | null>(null);

export const useNavigate = (): NavContextValue => {
  const ctx = useContext(NavCtx);
  if (!ctx) throw new Error('useNavigate måste användas inom Router');
  return ctx;
};

const INITIAL: NavRoute = { panel: 'elev', page: FIRST_PAGE.elev };

/**
 * Startrutt: en giltig adress (#/panel/sida) gäller från första renderingen, så
 * att en direktöppnad eller delad länk aldrig tappas. Ruttvakten i App avgör
 * sedan om användaren får vara kvar där.
 */
function initialRoute(): NavRoute {
  if (typeof window === 'undefined') return INITIAL;
  return parseHashRoute(window.location.hash) ?? INITIAL;
}

export const Router: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [route, setRouteState] = useState<NavRoute>(initialRoute);

  const setPanel = useCallback((panel: Panel) => {
    setRouteState((prev) => (prev.panel === panel ? prev : { ...prev, panel }));
  }, []);

  const setPage = useCallback((page: string) => {
    setRouteState((prev) => (prev.page === page ? prev : { ...prev, page }));
  }, []);

  const setRoute = useCallback((next: NavRoute) => {
    setRouteState((prev) =>
      prev.panel === next.panel && prev.page === next.page ? prev : next,
    );
  }, []);

  const reset = useCallback(() => setRouteState(INITIAL), []);

  const value = useMemo<NavContextValue>(
    () => ({ ...route, setPanel, setPage, setRoute, reset }),
    [route, setPanel, setPage, setRoute, reset],
  );

  return <NavCtx.Provider value={value}>{children}</NavCtx.Provider>;
};

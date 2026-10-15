import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

export type PanelType = 'elev' | 'speciallarar' | 'admin';

interface RouterState {
  activePanel: PanelType;
  activePage: string;
  showProfile: boolean;
  /** Sidan som visades innan profilsidan öppnades (används för att återställa). */
  prevPage?: string;
}

interface RouterContextValue {
  getActivePanel: () => PanelType;
  getActivePage: () => string;
  setActivePanel: (panel: PanelType) => void;
  setActivePage: (page: string) => void;
  setShowProfile: (show: boolean) => void;
  hideLogin: () => void;
}

const RouterCtx = createContext<RouterContextValue | null>(null);

export const useNavigate = (): RouterContextValue => {
  const ctx = useContext(RouterCtx);
  if (!ctx) throw new Error('useNavigate must be used within Router');
  return ctx;
};

interface RouterProps {
  children: React.ReactNode;
}

export const Router: React.FC<RouterProps> = ({ children }) => {
  const [state, setState] = useState<RouterState>({
    activePanel: 'elev',
    activePage: 'start',
    showProfile: false,
  });

  const getActivePanel = useCallback(() => state.activePanel, [state.activePanel]);
  const getActivePage = useCallback(() => state.activePage, [state.activePage]);

  const setActivePanel = useCallback(
    (panel: PanelType) => {
      setState((prev) => ({ ...prev, activePanel: panel }));
    },
    []
  );

  const setActivePage = useCallback(
    (page: string) => {
      setState((prev) => ({ ...prev, activePage: page, showProfile: false }));
    },
    []
  );

  const setShowProfile = useCallback(
    (show: boolean) => {
      setState((prev) =>
        show
          ? {
              ...prev,
              showProfile: true,
              activePage: '__profil',
              prevPage: prev.showProfile ? prev.prevPage : prev.activePage,
            }
          : {
              ...prev,
              showProfile: false,
              activePage: prev.prevPage ?? prev.activePage,
              prevPage: undefined,
            },
      );
    },
    []
  );

  const hideLogin = useCallback(() => {
    // Login view hides itself, nothing else needed.
  }, []);

  const value = useMemo(
    () => ({
      getActivePanel,
      getActivePage,
      setActivePanel,
      setActivePage,
      setShowProfile,
      hideLogin,
    }),
    [getActivePanel, getActivePage, setActivePanel, setActivePage, setShowProfile, hideLogin]
  );

  return (
    <RouterCtx.Provider value={value}>
      {children}
    </RouterCtx.Provider>
  );
};

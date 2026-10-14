import { useCallback, useEffect, useState } from "react";

const current = (routes, fallback) => {
  const r = window.location.hash.replace(/^#\/?/, "");
  return routes.includes(r) ? r : fallback;
};

export function useHashRoute(routes, fallback) {
  const [route, setRoute] = useState(() => current(routes, fallback));
  useEffect(() => {
    const onHash = () => { setRoute(current(routes, fallback)); window.scrollTo({ top: 0 }); };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [routes, fallback]);
  const go = useCallback(r => { window.location.hash = `/${r}`; }, []);
  return [route, go];
}

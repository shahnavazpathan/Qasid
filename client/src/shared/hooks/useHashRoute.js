import { useCallback, useEffect, useState } from "react";

// "#/ipos" -> { route: "ipos", param: null }, "#/ipo/FUSIONCX" -> { route: "ipo", param: "FUSIONCX" }
const parse = (routes, fallback) => {
  const [route, ...rest] = window.location.hash.replace(/^#\/?/, "").split("/");
  return routes.includes(route) ? { route, param: rest.length ? decodeURIComponent(rest.join("/")) : null } : { route: fallback, param: null };
};

export function useHashRoute(routes, fallback) {
  const [state, setState] = useState(() => parse(routes, fallback));
  useEffect(() => {
    const onHash = () => {
      const next = parse(routes, fallback);
      setState(prev => {
        if (prev.route !== next.route) window.scrollTo({ top: 0 });
        return next;
      });
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [routes, fallback]);
  const go = useCallback((route, param) => {
    window.location.hash = `/${route}${param ? `/${encodeURIComponent(param)}` : ""}`;
  }, []);
  return [state.route, go, state.param];
}

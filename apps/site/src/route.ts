import { useEffect, useState } from "react";

export const REPO = "https://github.com/DominikScholz/open-bot-avatar";

export type Route = "studio" | "moods" | "docs";

const ROUTES: Record<string, Route> = { "": "studio", "#/": "studio", "#/moods": "moods", "#/docs": "docs" };

/** Hash routes, so every page works from GitHub Pages without server rewrites. */
export function useRoute(): Route {
  const read = () => ROUTES[window.location.hash] ?? "studio";
  const [route, setRoute] = useState<Route>(read);
  useEffect(() => {
    const onChange = () => {
      setRoute(read());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

export const href: Record<Route, string> = { studio: "#/", moods: "#/moods", docs: "#/docs" };

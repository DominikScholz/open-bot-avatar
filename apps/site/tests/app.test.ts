// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { App } from "../src/App";

const studio = vi.hoisted(() => {
  let reject!: (error: Error) => void;
  const promise = new Promise<never>((_, fail) => { reject = fail; });
  return { promise, reject };
});
vi.mock("../src/Studio", () => studio.promise);
vi.mock("../src/Docs", () => ({ Docs: () => createElement("main", null, "Docs loaded") }));
vi.mock("../src/BotAvatar", () => ({ BotAvatar: () => null }));
vi.mock("../src/contributorData", () => ({ CONTRIBUTORS: [], pictureAt: () => "" }));

it("keeps navigation during loading and failure, and can navigate away and back", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const originalUrl = window.location.href;
  const navigate = async (hash: string) => {
    await act(async () => {
      window.history.replaceState(null, "", hash);
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
  };
  try {
    window.history.replaceState(null, "", "#/");
    await act(async () => { root.render(createElement(App)); });
    expect(host.querySelector("[role=status]")?.textContent).toBe("Loading page…");
    expect(host.querySelector("nav")?.textContent).toContain("Docs");
    expect(host.querySelector(".credit")).not.toBeNull();

    await act(async () => { studio.reject(new Error("Page chunk unavailable")); });
    expect(host.querySelector("[role=alert]")?.textContent).toContain("Could not load this page");
    expect(host.querySelector("[role=alert] button")?.textContent).toBe("Reload page");
    expect(host.querySelector("nav")).not.toBeNull();

    await navigate("#/docs");
    expect(host.querySelector("[role=alert]")).toBeNull();
    expect(host.querySelector("main")?.textContent).toBe("Docs loaded");

    await navigate("#/");
    expect(host.querySelector("[role=alert]")?.textContent).toContain("Reload page");
    expect(host.querySelector("nav")).not.toBeNull();
  } finally {
    await act(async () => { root.unmount(); });
    host.remove();
    window.history.replaceState(null, "", originalUrl);
    scroll.mockRestore();
    errors.mockRestore();
    vi.unstubAllGlobals();
  }
});

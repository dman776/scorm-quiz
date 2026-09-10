import type { Api1484_11 } from "./api1484_11.js";

/**
 * Locates window.API_1484_11 by searching the current window, then walking
 * up through window.parent and window.opener chains, as recommended by the
 * SCORM RTE spec for content launched in a frameset or new window.
 *
 * Guards against:
 * - cross-origin access throwing (try/catch around every property read)
 * - infinite loops (a visited-window Set; parent-of-top-window is itself)
 * - unbounded search depth (maxParentDepth)
 *
 * Returns null (never a fake/mocked API) when nothing is found — callers
 * must fall back to a clearly labeled standalone preview mode rather than
 * simulating successful LMS communication.
 */
export function findScormApi(startWindow: Window, maxParentDepth = 10): Api1484_11 | null {
  const visited = new Set<Window>();
  let current: Window | null = startWindow;
  let depth = 0;

  while (current && !visited.has(current) && depth <= maxParentDepth) {
    visited.add(current);

    try {
      if (current.API_1484_11) {
        return current.API_1484_11;
      }
    } catch {
      // Cross-origin access blocked; stop walking this chain.
      break;
    }

    let next: Window | null = null;
    try {
      next = current.parent && current.parent !== current ? current.parent : null;
    } catch {
      next = null;
    }
    if (!next) {
      try {
        next = current.opener ?? null;
      } catch {
        next = null;
      }
    }

    current = next;
    depth += 1;
  }

  return null;
}

import { z } from "zod";

/**
 * Secure, URL-safe unique ID. Uses crypto.randomUUID under the hood — never
 * Math.random — since IDs are used as SCORM interaction ids and file names.
 */
export function generateId(prefix?: string): string {
  const uuid = crypto.randomUUID();
  return prefix ? `${prefix}_${uuid}` : uuid;
}

/**
 * SCORM interaction ids must use a restricted character set. We derive a safe
 * id from a question's own id by stripping anything outside [A-Za-z0-9_-.].
 */
export function toScormSafeId(id: string): string {
  return id.replace(/[^A-Za-z0-9_\-.]/g, "_").slice(0, 250);
}

export const IdSchema = z.string().min(1).max(255);

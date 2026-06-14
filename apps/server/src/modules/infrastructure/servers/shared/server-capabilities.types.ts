/**
 * Shapes for the JSON columns that replaced the ServerCapability and
 * ServerInstalledTool join tables (single source of truth on Server).
 */

/** Flat map of detected capabilities, e.g. { "os.name": "Ubuntu", "docker": "true" }. */
export interface ServerCapabilities {
  [key: string]: string | undefined;
}

export type InstalledToolStatus = 'INSTALLED' | 'MISSING' | 'FAILED' | 'UNKNOWN';

/** One detected tool, stored in the Server.installedTools JSON array. */
export interface InstalledTool {
  toolKey: string;
  displayName: string;
  version: string | null;
  installedBy: string | null;
  status: InstalledToolStatus;
  /** ISO date string, or null when the tool is not installed. */
  installedAt: string | null;
}

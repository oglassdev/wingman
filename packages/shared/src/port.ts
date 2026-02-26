import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const DEFAULT_WINGMAN_PORT = 7891;
export const WINGMAN_PORT_FILE = join(tmpdir(), "wingman.port");

export async function readWingmanPort(
  fallbackPort = DEFAULT_WINGMAN_PORT,
): Promise<number> {
  try {
    const value = (await readFile(WINGMAN_PORT_FILE, "utf8")).trim();
    const port = Number.parseInt(value, 10);
    return Number.isFinite(port) ? port : fallbackPort;
  } catch {
    return fallbackPort;
  }
}

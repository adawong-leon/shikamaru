import type { ChildProcess } from "node:child_process";
import type { Readable } from "node:stream";

export type HistoryRecord = { id: number; name: string; line: string };

export type ProcItem = { name: string; stream: Readable; proc?: ChildProcess };

export type Mode = "filter" | "search" | null;

export const ESC = "\x1b";
export const FOOTER_REFRESH_MS = 500;
export const STARTUP_GRACE_MS = 2000;
export const REQUIRE_EACH_SERVICE_FIRST_LINE = true;
export const HISTORY_LIMIT = 2000;

export const nowIsoTime = () =>
  new Date().toISOString().split("T")[1].replace("Z", "");
export const normalizeChunk = (buf: Buffer | string) =>
  buf.toString().replace(/\r(?!\n)/g, "\n");

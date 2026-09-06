import type { EventEmitter } from "node:events";

type StopSignal = "SIGINT" | "SIGTERM";
export interface StopSignalRecord {
  receivedAt: string;
  pid: number;
  signal: StopSignal;
  firstSignal: StopSignal;
  action: "wait-for-checkpoint" | "already-stopping" | "force-exit";
}

/** Requests stop only: the caller finishes and saves its current unit of work.
 * Repeated SIGTERM stays graceful. Ctrl-C while stopping is an explicit escape.
 * Keep installed through async resource cleanup, then dispose. */
export function installRunStopHandlers(
  onSignal: (record: StopSignalRecord) => void,
  host: Pick<EventEmitter, "on" | "off"> & {
    pid: number;
    exit: (code: number) => void;
  } = process
) {
  let firstSignal: StopSignal | undefined;
  const records: StopSignalRecord[] = [];
  const receive = (signal: StopSignal) => {
    const force = firstSignal !== undefined && signal === "SIGINT";
    const action = force
      ? "force-exit"
      : firstSignal
        ? "already-stopping"
        : "wait-for-checkpoint";
    firstSignal ??= signal;
    const record: StopSignalRecord = {
      receivedAt: new Date().toISOString(),
      pid: host.pid,
      signal,
      firstSignal,
      action,
    };
    records.push(record);
    // Synchronous audit before a deliberate force-exit.
    onSignal(record);
    if (force) host.exit(130);
  };
  const onInt = () => receive("SIGINT");
  const onTerm = () => receive("SIGTERM");
  host.on("SIGINT", onInt);
  host.on("SIGTERM", onTerm);
  return {
    get requested() {
      return firstSignal !== undefined;
    },
    get signal() {
      return firstSignal;
    },
    get records(): readonly StopSignalRecord[] {
      return records;
    },
    dispose() {
      host.off("SIGINT", onInt);
      host.off("SIGTERM", onTerm);
    },
  };
}

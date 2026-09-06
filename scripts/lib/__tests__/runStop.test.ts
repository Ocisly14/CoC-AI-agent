import { EventEmitter } from "node:events";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { installRunStopHandlers, type StopSignalRecord } from "../runStop.js";

describe("run stop signals", () => {
  it("waits on either first signal and repeated SIGTERM, then audits before forced Ctrl-C exit", () => {
    for (const first of ["SIGINT", "SIGTERM"]) {
      const records: StopSignalRecord[] = [];
      const host = Object.assign(new EventEmitter(), {
        pid: 123,
        exit: vi.fn(() => expect(records.at(-1)?.action).toBe("force-exit")),
      });
      const unrelated = vi.fn();
      host.on("SIGTERM", unrelated);
      const stop = installRunStopHandlers(
        (record) => records.push(record),
        host
      );
      host.emit(first);
      host.emit("SIGTERM");
      expect(stop.requested).toBe(true);
      expect(stop.signal).toBe(first);
      expect(records.map((r) => r.action)).toEqual([
        "wait-for-checkpoint",
        "already-stopping",
      ]);
      expect(host.exit).not.toHaveBeenCalled();
      host.emit("SIGINT");
      expect(host.exit).toHaveBeenCalledWith(130);
      expect(records[0]).toMatchObject({ pid: 123, signal: first });
      expect(Number.isNaN(Date.parse(records[0].receivedAt))).toBe(false);
      stop.dispose();
      expect(host.listenerCount("SIGINT")).toBe(0);
      expect(host.listeners("SIGTERM")).toEqual([unrelated]);
    }
  });

  it.each(["SIGINT", "SIGTERM"] as const)(
    "%s lets the in-flight checkpoint finish and prevents the next unit of work",
    async (signal) => {
      const dir = mkdtempSync(path.join(tmpdir(), "coc-stop-"));
      const checkpoint = path.join(dir, "checkpoint.json");
      const helperUrl = new URL("../runStop.ts", import.meta.url).href;
      // A real Node subprocess, with a controllably blocked checkpoint. No
      // engine, database, model call or native embedding library is involved.
      const code = `
        import { writeFileSync } from 'node:fs';
        import { once } from 'node:events';
        import { installRunStopHandlers } from ${JSON.stringify(helperUrl)};
        const stop = installRunStopHandlers(r => console.log('signal:' + r.signal));
        let ticks = 0;
        for (; ticks < 2 && !stop.requested;) {
          console.log('tick-started');
          await once(process.stdin, 'data');
          ticks++;
          writeFileSync(${JSON.stringify(checkpoint)}, JSON.stringify({ ticks, stopSignal: stop.signal }));
        }
        console.log('saved:' + ticks);
        stop.dispose();
        process.stdin.destroy();
      `;
      const child = spawn(
        process.execPath,
        ["--import", "tsx", "--input-type=module", "-e", code],
        {
          cwd: process.cwd(),
          stdio: ["pipe", "pipe", "pipe"],
        }
      );
      let stdout = "";
      let stderr = "";
      const events = new EventEmitter();
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
        events.emit("output");
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
      const closed = new Promise<{
        code: number | null;
        signal: string | null;
      }>((resolve, reject) => {
        child.once("error", reject);
        child.once("close", (code, signal) => {
          resolve({ code, signal });
          events.emit("output");
        });
      });
      async function waitFor(text: string) {
        while (!stdout.includes(text)) {
          if (child.exitCode !== null || child.signalCode !== null)
            throw new Error(stderr || stdout);
          await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => {
              events.off("output", done);
              reject(new Error(`Timed out waiting for ${text}: ${stderr}`));
            }, 5000);
            const done = () => {
              clearTimeout(timer);
              resolve();
            };
            events.once("output", done);
          });
        }
      }
      try {
        await waitFor("tick-started");
        expect(child.kill(signal)).toBe(true);
        await waitFor(`signal:${signal}`);
        expect(stdout).not.toContain("saved:");
        expect(child.exitCode).toBeNull();
        child.stdin.end("finish checkpoint\n");
        expect(await closed).toEqual({ code: 0, signal: null });
        expect(JSON.parse(readFileSync(checkpoint, "utf8"))).toEqual({
          ticks: 1,
          stopSignal: signal,
        });
        expect(stdout.match(/tick-started/g)).toHaveLength(1);
      } finally {
        if (child.exitCode === null && child.signalCode === null)
          child.kill("SIGKILL");
        await closed;
        rmSync(dir, { recursive: true, force: true });
      }
    },
    15000
  );
});

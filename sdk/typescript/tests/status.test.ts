import * as child_process from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";

import { describe, expect, it } from "@jest/globals";

import { createMockClient } from "./testCodex";

jest.mock("node:child_process", () => {
  const actual = jest.requireActual<typeof import("node:child_process")>("node:child_process");
  return { ...actual, spawn: jest.fn(actual.spawn) };
});

const actualChildProcess =
  jest.requireActual<typeof import("node:child_process")>("node:child_process");
const spawnMock = child_process.spawn as jest.MockedFunction<typeof actualChildProcess.spawn>;

class FakeChildProcess extends EventEmitter {
  stdin = new PassThrough();
  stdout = new PassThrough();
  stderr = new PassThrough();
  killed = false;

  kill(): boolean {
    this.killed = true;
    return true;
  }
}

describe("Codex status", () => {
  it("returns usage limits with percent left and reset dates", async () => {
    const previousImplementation = spawnMock.getMockImplementation() ?? actualChildProcess.spawn;
    spawnMock.mockImplementation(((...spawnArgs: Parameters<typeof child_process.spawn>) => {
      const commandArgs = spawnArgs[1];
      if (Array.isArray(commandArgs) && commandArgs[0] === "status") {
        const child = new FakeChildProcess();
        setImmediate(() => {
          child.stdout.write(
            JSON.stringify({
              rateLimits: {
                limitId: "codex",
                limitName: null,
                primary: {
                  usedPercent: 42,
                  windowDurationMins: 60,
                  resetsAt: 1735689720,
                },
                secondary: {
                  usedPercent: 5,
                  windowDurationMins: 1440,
                  resetsAt: 1735732800,
                },
                credits: null,
                planType: "pro",
                rateLimitReachedType: null,
              },
              rateLimitsByLimitId: {
                codex_other: {
                  limitId: "codex_other",
                  limitName: "codex_other",
                  primary: {
                    usedPercent: 88,
                    windowDurationMins: 30,
                    resetsAt: 1735693200,
                  },
                  secondary: null,
                  credits: null,
                  planType: "pro",
                  rateLimitReachedType: null,
                },
              },
            }),
          );
          child.stdout.end();
          child.stderr.end();
          child.emit("exit", 0, null);
        });
        return child as unknown as child_process.ChildProcess;
      }

      return previousImplementation(...spawnArgs);
    }) as typeof actualChildProcess.spawn);

    const { client, cleanup } = createMockClient("http://unused.test");

    try {
      const status = await client.status();

      expect(status.rateLimits.primary).toEqual({
        usedPercent: 42,
        percentLeft: 58,
        windowDurationMins: 60,
        resetsAt: 1735689720,
        resetDate: new Date(1735689720 * 1000),
      });
      expect(status.rateLimits.secondary).toEqual({
        usedPercent: 5,
        percentLeft: 95,
        windowDurationMins: 1440,
        resetsAt: 1735732800,
        resetDate: new Date(1735732800 * 1000),
      });
      expect(status.rateLimitsByLimitId?.codex_other?.primary?.percentLeft).toBe(12);
    } finally {
      spawnMock.mockImplementation(previousImplementation);
      cleanup();
    }
  });
});

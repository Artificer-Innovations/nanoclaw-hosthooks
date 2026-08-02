import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isCliEntry, main, parseArgs, runCommand } from "./bin.js";
import { fixtureSources } from "./test-fixtures.js";

const roots: string[] = [];

function makeHost(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hosthooks-bin-"));
  roots.push(root);
  for (const [relativePath, content] of Object.entries({
    "src/router.ts": fixtureSources.router,
    "src/delivery.ts": fixtureSources.delivery,
    "container/agent-runner/src/providers/claude.ts": fixtureSources.claude,
    "container/agent-runner/src/providers/codex.ts": fixtureSources.codex,
    "container/agent-runner/src/providers/opencode.ts": fixtureSources.opencode,
    "container/agent-runner/src/poll-loop.ts": fixtureSources.poll,
    "src/container-runner.ts": fixtureSources.container,
  })) {
    const target = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("CLI", () => {
  it("parses commands and tolerates unknown flags", () => {
    expect(parseArgs(["node", "bin"])).toEqual({
      command: "help",
      path: undefined,
    });
    expect(
      parseArgs(["node", "bin", "install", "--other", "--path", "/tmp/host"])
    ).toEqual({
      command: "install",
      path: "/tmp/host",
    });
  });

  it("runs the complete command lifecycle", () => {
    const root = makeHost();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(runCommand(["node", "bin", "install", "--path", root])).toBe(0);
    expect(runCommand(["node", "bin", "verify", "--path", root])).toBe(0);
    expect(runCommand(["node", "bin", "upgrade", "--path", root])).toBe(0);
    expect(runCommand(["node", "bin", "sync-skill", "--path", root])).toBe(0);
    expect(runCommand(["node", "bin", "uninstall", "--path", root])).toBe(0);
    expect(runCommand(["node", "bin", "verify", "--path", root])).toBe(1);
  });

  it("prints help and rejects unknown commands", () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    expect(runCommand(["node", "bin"])).toBe(0);
    expect(runCommand(["node", "bin", "wat"])).toBe(1);
  });

  it("turns command exceptions into exit code one", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(
      runCommand(["node", "bin", "install", "--path", "/does/not/exist"])
    ).toBe(1);
  });

  it("recognizes the executable entry path", () => {
    const root = makeHost();
    const file = path.join(root, "bin.js");
    fs.writeFileSync(file, "");
    expect(isCliEntry(file, ["node", file])).toBe(true);
    expect(isCliEntry(file, ["node"])).toBe(false);
    expect(isCliEntry("same", ["node", "same"])).toBe(true);
    expect(isCliEntry("one", ["node", "two"])).toBe(false);
  });

  it("main exits with the command result", () => {
    const exit = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("exit");
    }) as never);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    expect(() => main()).toThrow("exit");
    expect(exit).toHaveBeenCalledWith(0);
    expect(log).toHaveBeenCalled();
  });
});

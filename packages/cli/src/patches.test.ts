import { describe, expect, it } from "vitest";
import {
  FILE_TRANSFORMS,
  patchClaudeProvider,
  patchCodexProvider,
  patchContainerRunner,
  patchDelivery,
  patchOpenCodeProvider,
  patchPollLoop,
  patchRouter,
  unpatchClaudeProvider,
  unpatchCodexProvider,
  unpatchContainerRunner,
  unpatchDelivery,
  unpatchOpenCodeProvider,
  unpatchPollLoop,
  unpatchRouter,
} from "./patches.js";
import { fixtureSources } from "./test-fixtures.js";

const { router, delivery, claude, poll, codex, opencode, container } =
  fixtureSources;

describe("source transforms", () => {
  it.each([
    ["router", router, patchRouter, unpatchRouter],
    ["delivery", delivery, patchDelivery, unpatchDelivery],
    ["claude", claude, patchClaudeProvider, unpatchClaudeProvider],
    ["codex", codex, patchCodexProvider, unpatchCodexProvider],
    ["opencode", opencode, patchOpenCodeProvider, unpatchOpenCodeProvider],
    ["poll", poll, patchPollLoop, unpatchPollLoop],
    ["container", container, patchContainerRunner, unpatchContainerRunner],
  ] as const)(
    "%s installs idempotently and uninstalls to stock",
    (_name, source, install, uninstall) => {
      const patched = install(source);
      expect(patched).toContain("@nanoclaw-hosthooks");
      expect(install(patched)).toBe(patched);
      expect(uninstall(patched)).toBe(source);
      expect(uninstall(source)).toBe(source);
    }
  );

  it("threads policy results without changing the accumulate predicate", () => {
    const patched = patchRouter(router);
    expect(patched).toContain(
      "agent.ignored_message_policy === 'accumulate' && !(engages && (!accessOk || !scopeOk))"
    );
    expect(patched).toContain("hosthooksPolicy.wake");
    expect(patched).toContain("hosthooksPolicy.skipCommandGate");
    expect(patched).toContain("if (!skipCommandGate &&");
  });

  it("adds all runner hooks at the real anchors", () => {
    const patchedClaude = patchClaudeProvider(claude);
    expect(patchedClaude).toContain("runProviderQueryOptionsContributors");
    expect(patchedClaude).toContain("runProviderMessageObservers");
    expect(patchedClaude).toContain("stage: 'sdk_query'");
    expect(patchedClaude).toContain("runProviderQueryStartObservers");

    const patchedPoll = patchPollLoop(poll);
    expect(patchedPoll).toContain("runInboundBatchObservers(messages)");
    expect(patchedPoll).toContain("stage: 'provider_query'");
    expect(patchedPoll).toContain("stage: 'session_init'");

    expect(patchCodexProvider(codex)).toContain("provider: 'codex'");
    expect(patchOpenCodeProvider(opencode)).toContain("provider: 'opencode'");
    expect(patchContainerRunner(container)).toContain(
      "runContainerEnvContributors"
    );
    expect(patchContainerRunner(container)).toContain(
      "providerContribution.env"
    );
  });

  it("upgrades an older poll import to include query-start observers", () => {
    const legacy = `${poll.replace(
      "import { getPendingMessages } from './db.js';\n",
      `// @nanoclaw-hosthooks:poll-import:begin
import { runInboundBatchObservers } from './hosthooks.js';
// @nanoclaw-hosthooks:poll-import:end
import { getPendingMessages } from './db.js';
`
    )}`;
    const withObserver = legacy.replace(
      "    const messages = getPendingMessages(isFirstPoll).filter((m) => m.kind !== 'system');\n",
      `    const messages = getPendingMessages(isFirstPoll).filter((m) => m.kind !== 'system');
// @nanoclaw-hosthooks:poll-observer:begin
    if (messages.length > 0) {
      runInboundBatchObservers(messages);
    }
// @nanoclaw-hosthooks:poll-observer:end
`
    );
    const upgraded = patchPollLoop(withObserver);
    expect(upgraded).toContain("runProviderQueryStartObservers");
    expect(upgraded).toContain("poll-query-start:begin");
    expect(upgraded).toContain("poll-session-init:begin");
    expect(patchPollLoop(upgraded)).toBe(upgraded);
  });

  it("widens poll-import when peer markers nest inside the block", () => {
    const nested = `// @nanoclaw-hosthooks:poll-import:begin
// @nanoclaw-sessionio:poll-loop-peer-import:begin
import fs from 'node:fs';
// @nanoclaw-sessionio:poll-loop-peer-import:end
import { runInboundBatchObservers } from './hosthooks.js';
// @nanoclaw-hosthooks:poll-import:end
${poll}`;
    const withObserver = nested.replace(
      "    const messages = getPendingMessages(isFirstPoll).filter((m) => m.kind !== 'system');\n",
      `    const messages = getPendingMessages(isFirstPoll).filter((m) => m.kind !== 'system');
// @nanoclaw-hosthooks:poll-observer:begin
    if (messages.length > 0) {
      runInboundBatchObservers(messages);
    }
// @nanoclaw-hosthooks:poll-observer:end
`
    );
    const upgraded = patchPollLoop(withObserver);
    expect(upgraded).toContain(
      "import { runInboundBatchObservers, runProviderQueryStartObservers } from './hosthooks.js';"
    );
    expect(upgraded).toContain(
      "@nanoclaw-sessionio:poll-loop-peer-import:begin"
    );
    expect(upgraded).toContain("poll-query-start:begin");
  });

  it("fails loudly for missing and ambiguous anchors", () => {
    expect(() => patchRouter("import x from 'x';")).toThrow(
      "router engage policy"
    );
    expect(() => patchDelivery(`${delivery}\n${delivery}`)).toThrow(
      "delivery adapter call"
    );
    expect(() => patchClaudeProvider("import x from 'x';")).toThrow(
      "Claude query options"
    );
    expect(() => patchPollLoop("import x from 'x';")).toThrow(
      "poll-loop pending"
    );
    expect(() => patchCodexProvider("import x from 'x';")).toThrow(
      "Codex query generator"
    );
    expect(() => patchOpenCodeProvider("import x from 'x';")).toThrow(
      "OpenCode query generator"
    );
    expect(() => patchContainerRunner("import x from 'x';")).toThrow(
      "container environment"
    );
    expect(() => patchDelivery("const noImports = true;")).toThrow(
      "import anchor"
    );
  });

  it("exports the complete seven-file transform surface", () => {
    expect(FILE_TRANSFORMS.map((transform) => transform.path)).toEqual([
      "src/router.ts",
      "src/delivery.ts",
      "container/agent-runner/src/providers/claude.ts",
      "container/agent-runner/src/providers/codex.ts",
      "container/agent-runner/src/providers/opencode.ts",
      "container/agent-runner/src/poll-loop.ts",
      "src/container-runner.ts",
    ]);
  });

  it("rejects corrupt marked blocks during uninstall", () => {
    expect(() =>
      unpatchRouter(`// @nanoclaw-hosthooks:router-command-gate:begin\nbroken`)
    ).toThrow("Corrupt hosthooks block");
    expect(() =>
      patchPollLoop(
        `${poll}// @nanoclaw-hosthooks:poll-import:begin\nimport './hosthooks.js';\n// @nanoclaw-hosthooks:poll-import:end\n`
      )
    ).toThrow("Corrupt hosthooks import block");
    expect(() =>
      unpatchPollLoop(
        `${poll}// @nanoclaw-hosthooks:poll-observer:begin\nbroken`
      )
    ).toThrow("Corrupt hosthooks block");
  });
});

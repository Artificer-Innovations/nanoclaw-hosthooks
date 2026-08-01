export const HOSTHOOKS_MARKER = "@nanoclaw-hosthooks";

const begin = (name: string): string => `// ${HOSTHOOKS_MARKER}:${name}:begin`;
const end = (name: string): string => `// ${HOSTHOOKS_MARKER}:${name}:end`;

export interface FileTransform {
  path: string;
  transform: (content: string) => string;
  uninstall: (content: string) => string;
}

function replaceOnce(
  content: string,
  search: string,
  replacement: string,
  label: string
): string {
  const first = content.indexOf(search);
  if (first < 0) throw new Error(`Could not find ${label} anchor`);
  if (content.indexOf(search, first + search.length) >= 0) {
    throw new Error(`${label} anchor is ambiguous`);
  }
  return (
    content.slice(0, first) + replacement + content.slice(first + search.length)
  );
}

function installImport(
  content: string,
  modulePath: string,
  symbols: string[],
  name: string
): string {
  if (content.includes(begin(name))) return content;
  const firstImport = content.search(/^import /m);
  if (firstImport < 0)
    throw new Error(`Could not find import anchor for ${name}`);
  const block = `${begin(name)}\nimport { ${symbols.join(
    ", "
  )} } from '${modulePath}';\n${end(name)}\n`;
  return content.slice(0, firstImport) + block + content.slice(firstImport);
}

function removeMarkedBlock(content: string, name: string): string {
  const pattern = new RegExp(
    `^[ \\t]*${escapeRegExp(
      begin(name)
    )}\\r?\\n[\\s\\S]*?^[ \\t]*${escapeRegExp(end(name))}\\r?\\n?`,
    "m"
  );
  const next = content.replace(pattern, "");
  if (content.includes(begin(name)) && next === content) {
    throw new Error(`Corrupt hosthooks block: ${name}`);
  }
  return next;
}

function marked(name: string, body: string): string {
  return `${begin(name)}\n${body}\n${end(name)}`;
}

export function patchRouter(source: string): string {
  if (
    isFullyPatched(source, [
      "router-import",
      "router-policy",
      "router-engaged-delivery",
      "router-accumulate-delivery",
      "router-delivery-signature",
      "router-command-gate",
    ])
  ) {
    return source;
  }
  let content = installImport(
    source,
    "./hosthooks.js",
    ["runDeliveryPolicies"],
    "router-import"
  );

  content = replaceOnce(
    content,
    "    const engages = evaluateEngage(agent, messageText, isMention, mg, effectiveThreadId);",
    marked(
      "router-policy",
      `    const defaultEngages = evaluateEngage(agent, messageText, isMention, mg, effectiveThreadId);
    const hosthooksPolicy = runDeliveryPolicies({
      event,
      parsed,
      agent,
      agentGroup,
      messagingGroup: mg,
      messageText,
      isMention,
      effectiveThreadId,
      defaultEngages,
    });
    const engages = hosthooksPolicy.engages;`
    ),
    "router engage policy"
  );

  content = replaceOnce(
    content,
    "      await deliverToAgent(agent, agentGroup, mg, event, userId, threadsEnabled, effectiveThreadId, true);",
    marked(
      "router-engaged-delivery",
      `      await deliverToAgent(
        agent,
        agentGroup,
        mg,
        event,
        userId,
        threadsEnabled,
        effectiveThreadId,
        hosthooksPolicy.wake,
        hosthooksPolicy.skipCommandGate,
      );`
    ),
    "router engaged delivery"
  );

  content = replaceOnce(
    content,
    "      await deliverToAgent(agent, agentGroup, mg, event, userId, threadsEnabled, effectiveThreadId, false);",
    marked(
      "router-accumulate-delivery",
      `      await deliverToAgent(
        agent,
        agentGroup,
        mg,
        event,
        userId,
        threadsEnabled,
        effectiveThreadId,
        false,
        hosthooksPolicy.skipCommandGate,
      );`
    ),
    "router accumulate delivery"
  );

  content = replaceOnce(
    content,
    "  wake: boolean,\n): Promise<void> {",
    marked(
      "router-delivery-signature",
      "  wake: boolean,\n  skipCommandGate = false,"
    ) + "\n): Promise<void> {",
    "deliverToAgent signature"
  );

  content = replaceOnce(
    content,
    "  if (event.message.kind === 'chat' || event.message.kind === 'chat-sdk') {",
    marked(
      "router-command-gate",
      "  if (!skipCommandGate && (event.message.kind === 'chat' || event.message.kind === 'chat-sdk')) {"
    ),
    "router command gate"
  );
  return content;
}

export function unpatchRouter(source: string): string {
  let content = source;
  content = removeAndRestore(
    content,
    "router-command-gate",
    "  if (event.message.kind === 'chat' || event.message.kind === 'chat-sdk') {"
  );
  content = removeAndRestore(
    content,
    "router-delivery-signature",
    "  wake: boolean,"
  );
  content = removeAndRestore(
    content,
    "router-accumulate-delivery",
    "      await deliverToAgent(agent, agentGroup, mg, event, userId, threadsEnabled, effectiveThreadId, false);"
  );
  content = removeAndRestore(
    content,
    "router-engaged-delivery",
    "      await deliverToAgent(agent, agentGroup, mg, event, userId, threadsEnabled, effectiveThreadId, true);"
  );
  content = removeAndRestore(
    content,
    "router-policy",
    "    const engages = evaluateEngage(agent, messageText, isMention, mg, effectiveThreadId);"
  );
  return removeMarkedBlock(content, "router-import");
}

export function patchDelivery(source: string): string {
  if (isFullyPatched(source, ["delivery-import", "delivery-transform"]))
    return source;
  let content = installImport(
    source,
    "./hosthooks.js",
    ["runOutboundContentTransforms"],
    "delivery-import"
  );
  const call = "  const platformMsgId = await deliveryAdapter.deliver(";
  const block = marked(
    "delivery-transform",
    `  const deliverContent = runOutboundContentTransforms({
    content: msg.content,
    message: msg,
    session,
    agentGroup: getAgentGroup(session.agent_group_id),
    parsed: content,
  });`
  );
  content = replaceOnce(
    content,
    call,
    `${block}\n${call}`,
    "delivery adapter call"
  );
  content = replaceOnce(
    content,
    "    msg.kind,\n    msg.content,\n    files,",
    "    msg.kind,\n    deliverContent,\n    files,",
    "delivery content argument"
  );
  return content;
}

export function unpatchDelivery(source: string): string {
  let content = source.replace(
    "    msg.kind,\n    deliverContent,\n    files,",
    "    msg.kind,\n    msg.content,\n    files,"
  );
  content = removeMarkedBlock(content, "delivery-transform");
  return removeMarkedBlock(content, "delivery-import");
}

const CLAUDE_IMPORT_SYMBOLS = [
  "runProviderMessageObservers",
  "runProviderQueryOptionsContributors",
  "runProviderQueryStartObservers",
] as const;

const POLL_IMPORT_SYMBOLS = [
  "runInboundBatchObservers",
  "runProviderQueryStartObservers",
] as const;

function hasCompleteBlock(content: string, name: string): boolean {
  return content.includes(begin(name)) && content.includes(end(name));
}

function assertNoCorruptBlocks(content: string, names: string[]): void {
  for (const name of names) {
    const hasBegin = content.includes(begin(name));
    const hasEnd = content.includes(end(name));
    if (hasBegin !== hasEnd) {
      throw new Error(
        `Partial or corrupt hosthooks patch; expected blocks: ${names.join(
          ", "
        )}`
      );
    }
  }
}

/** Widen an existing marked import to include any missing symbols (upgrade path). */
function ensureImportSymbols(
  content: string,
  markerName: string,
  modulePath: string,
  symbols: readonly string[]
): string {
  if (!content.includes(begin(markerName))) {
    return installImport(content, modulePath, [...symbols], markerName);
  }
  const blockStart = content.indexOf(begin(markerName));
  const blockEnd = content.indexOf(end(markerName), blockStart);
  if (blockStart < 0 || blockEnd < 0) {
    throw new Error(`Corrupt hosthooks import block: ${markerName}`);
  }
  const afterEnd = blockEnd + end(markerName).length;
  const block = content.slice(blockStart, afterEnd);
  // Allow nested peer markers inside the block (e.g. sessionio inside poll-import).
  const importPattern = new RegExp(
    `import \\{([^}]*)\\} from ['"]${escapeRegExp(modulePath)}['"];`
  );
  const match = block.match(importPattern);
  if (!match) {
    throw new Error(`Corrupt hosthooks import block: ${markerName}`);
  }
  const existing = match[1]!
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const merged = [...existing];
  for (const symbol of symbols) {
    if (!merged.includes(symbol)) merged.push(symbol);
  }
  if (merged.length === existing.length) return content;
  const nextImport = `import { ${merged.join(", ")} } from '${modulePath}';`;
  const nextBlock = block.replace(importPattern, nextImport);
  return content.slice(0, blockStart) + nextBlock + content.slice(afterEnd);
}

export function patchClaudeProvider(source: string): string {
  const markers = [
    "claude-import",
    "claude-query-options",
    "claude-observer",
    "claude-query-start",
  ];
  assertNoCorruptBlocks(source, markers);
  if (
    markers.every((name) => hasCompleteBlock(source, name)) &&
    source.includes("runProviderQueryStartObservers")
  ) {
    return source;
  }
  let content = ensureImportSymbols(
    source,
    "claude-import",
    "../hosthooks.js",
    CLAUDE_IMPORT_SYMBOLS
  );
  if (!hasCompleteBlock(content, "claude-query-options")) {
    content = replaceOnce(
      content,
      "        permissionMode: 'bypassPermissions',",
      `${marked(
        "claude-query-options",
        "        ...runProviderQueryOptionsContributors({ provider: 'claude' }),"
      )}\n        permissionMode: 'bypassPermissions',`,
      "Claude query options"
    );
  }
  if (!hasCompleteBlock(content, "claude-query-start")) {
    content = replaceOnce(
      content,
      "    const sdkResult = sdkQuery({",
      `${marked(
        "claude-query-start",
        `    runProviderQueryStartObservers({
      provider: 'claude',
      stage: 'sdk_query',
      hasContinuation: Boolean(input.continuation),
    });`
      )}\n    const sdkResult = sdkQuery({`,
      "Claude sdkQuery call"
    );
  }
  if (!hasCompleteBlock(content, "claude-observer")) {
    const observerAnchor = `        messageCount++;

        // Yield activity for every SDK event so the poll loop knows the agent is working
        yield { type: 'activity' };`;
    content = replaceOnce(
      content,
      observerAnchor,
      `${observerAnchor}\n${marked(
        "claude-observer",
        "        runProviderMessageObservers(message, { provider: 'claude' });"
      )}`,
      "Claude SDK message activity yield"
    );
  }
  return content;
}

export function unpatchClaudeProvider(source: string): string {
  let content = removeMarkedBlock(source, "claude-observer");
  content = removeMarkedBlock(content, "claude-query-start");
  content = removeMarkedBlock(content, "claude-query-options");
  return removeMarkedBlock(content, "claude-import");
}

export function patchPollLoop(source: string): string {
  const markers = [
    "poll-import",
    "poll-observer",
    "poll-query-start",
    "poll-session-init",
  ];
  assertNoCorruptBlocks(source, markers);
  if (
    markers.every((name) => hasCompleteBlock(source, name)) &&
    source.includes("runProviderQueryStartObservers")
  ) {
    return source;
  }
  let content = ensureImportSymbols(
    source,
    "poll-import",
    "./hosthooks.js",
    POLL_IMPORT_SYMBOLS
  );
  if (!hasCompleteBlock(content, "poll-observer")) {
    const anchor =
      "    const messages = getPendingMessages(isFirstPoll).filter((m) => m.kind !== 'system');";
    const block = marked(
      "poll-observer",
      `    if (messages.length > 0) {
      runInboundBatchObservers(messages);
    }`
    );
    content = replaceOnce(
      content,
      anchor,
      `${anchor}\n${block}`,
      "poll-loop pending messages"
    );
  }
  if (!hasCompleteBlock(content, "poll-query-start")) {
    const anchor = "    const query = config.provider.query({";
    const block = marked(
      "poll-query-start",
      `    runProviderQueryStartObservers({
      provider: config.providerName,
      stage: 'provider_query',
      hasContinuation: Boolean(continuation),
    });`
    );
    content = replaceOnce(
      content,
      anchor,
      `${block}\n${anchor}`,
      "poll-loop provider.query call"
    );
  }
  if (!hasCompleteBlock(content, "poll-session-init")) {
    const anchor = `      if (event.type === 'init') {
        queryContinuation = event.continuation;`;
    const block = marked(
      "poll-session-init",
      `        runProviderQueryStartObservers({
          provider: providerName,
          stage: 'session_init',
          hasContinuation: true,
        });`
    );
    content = replaceOnce(
      content,
      anchor,
      `      if (event.type === 'init') {
${block}
        queryContinuation = event.continuation;`,
      "poll-loop ProviderEvent init"
    );
  }
  return content;
}

export function unpatchPollLoop(source: string): string {
  let content = removeMarkedBlock(source, "poll-session-init");
  content = removeMarkedBlock(content, "poll-query-start");
  content = removeMarkedBlock(content, "poll-observer");
  return removeMarkedBlock(content, "poll-import");
}

export function patchCodexProvider(source: string): string {
  const markers = ["codex-import", "codex-query-start"];
  assertNoCorruptBlocks(source, markers);
  if (markers.every((name) => hasCompleteBlock(source, name))) return source;
  let content = ensureImportSymbols(source, "codex-import", "../hosthooks.js", [
    "runProviderQueryStartObservers",
  ]);
  if (!hasCompleteBlock(content, "codex-query-start")) {
    const anchor = "    async function* gen(): AsyncGenerator<ProviderEvent> {";
    const block = marked(
      "codex-query-start",
      `      runProviderQueryStartObservers({
        provider: 'codex',
        stage: 'sdk_query',
        hasContinuation: Boolean(input.continuation),
      });`
    );
    content = replaceOnce(
      content,
      anchor,
      `${anchor}\n${block}`,
      "Codex query generator"
    );
  }
  return content;
}

export function unpatchCodexProvider(source: string): string {
  let content = removeMarkedBlock(source, "codex-query-start");
  return removeMarkedBlock(content, "codex-import");
}

export function patchOpenCodeProvider(source: string): string {
  const markers = ["opencode-import", "opencode-query-start"];
  assertNoCorruptBlocks(source, markers);
  if (markers.every((name) => hasCompleteBlock(source, name))) return source;
  let content = ensureImportSymbols(
    source,
    "opencode-import",
    "../hosthooks.js",
    ["runProviderQueryStartObservers"]
  );
  if (!hasCompleteBlock(content, "opencode-query-start")) {
    const anchor = "    async function* gen(): AsyncGenerator<ProviderEvent> {";
    const block = marked(
      "opencode-query-start",
      `      runProviderQueryStartObservers({
        provider: 'opencode',
        stage: 'sdk_query',
        hasContinuation: Boolean(input.continuation),
      });`
    );
    content = replaceOnce(
      content,
      anchor,
      `${anchor}\n${block}`,
      "OpenCode query generator"
    );
  }
  return content;
}

export function unpatchOpenCodeProvider(source: string): string {
  let content = removeMarkedBlock(source, "opencode-query-start");
  return removeMarkedBlock(content, "opencode-import");
}

export function patchContainerRunner(source: string): string {
  if (isFullyPatched(source, ["container-import", "container-env"]))
    return source;
  let content = installImport(
    source,
    "./hosthooks.js",
    ["runContainerEnvContributors"],
    "container-import"
  );
  const anchor = "  args.push('-e', `TZ=${TIMEZONE}`);";
  const block = marked(
    "container-env",
    `  // providerContribution is the buildContainerArgs parameter already in
  // scope at the TZ anchor in stock NanoClaw (upstream/main).
  const hosthookEnv = runContainerEnvContributors([
    'TZ',
    ...Object.keys(providerContribution.env ?? {}),
  ]);
  for (const [key, value] of Object.entries(hosthookEnv)) {
    args.push('-e', \`\${key}=\${value}\`);
  }`
  );
  return replaceOnce(
    content,
    anchor,
    `${anchor}\n${block}`,
    "container environment"
  );
}

export function unpatchContainerRunner(source: string): string {
  let content = removeMarkedBlock(source, "container-env");
  content = removeMarkedBlock(content, "container-import");
  return content;
}

export const FILE_TRANSFORMS: FileTransform[] = [
  { path: "src/router.ts", transform: patchRouter, uninstall: unpatchRouter },
  {
    path: "src/delivery.ts",
    transform: patchDelivery,
    uninstall: unpatchDelivery,
  },
  {
    path: "container/agent-runner/src/providers/claude.ts",
    transform: patchClaudeProvider,
    uninstall: unpatchClaudeProvider,
  },
  {
    path: "container/agent-runner/src/providers/codex.ts",
    transform: patchCodexProvider,
    uninstall: unpatchCodexProvider,
  },
  {
    path: "container/agent-runner/src/providers/opencode.ts",
    transform: patchOpenCodeProvider,
    uninstall: unpatchOpenCodeProvider,
  },
  {
    path: "container/agent-runner/src/poll-loop.ts",
    transform: patchPollLoop,
    uninstall: unpatchPollLoop,
  },
  {
    path: "src/container-runner.ts",
    transform: patchContainerRunner,
    uninstall: unpatchContainerRunner,
  },
];

function removeAndRestore(
  content: string,
  name: string,
  original: string
): string {
  const start = content.indexOf(begin(name));
  if (start < 0) return content;
  const finish = content.indexOf(end(name), start);
  if (finish < 0) throw new Error(`Corrupt hosthooks block: ${name}`);
  const after = finish + end(name).length;
  const lineStart = content.lastIndexOf("\n", start - 1) + 1;
  const lineEnd = content.indexOf("\n", after);
  return (
    content.slice(0, lineStart) +
    original +
    content.slice(lineEnd < 0 ? after : lineEnd)
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isFullyPatched(content: string, names: string[]): boolean {
  const present = names.filter(
    (name) => content.includes(begin(name)) || content.includes(end(name))
  );
  if (present.length === 0) return false;
  const complete = names.every(
    (name) => content.includes(begin(name)) && content.includes(end(name))
  );
  if (!complete) {
    throw new Error(
      `Partial or corrupt hosthooks patch; expected blocks: ${names.join(", ")}`
    );
  }
  return true;
}

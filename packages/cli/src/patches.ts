export const HOSTHOOKS_MARKER = '@nanoclaw-hosthooks';

const begin = (name: string): string => `// ${HOSTHOOKS_MARKER}:${name}:begin`;
const end = (name: string): string => `// ${HOSTHOOKS_MARKER}:${name}:end`;

export interface FileTransform {
  path: string;
  transform: (content: string) => string;
  uninstall: (content: string) => string;
}

function replaceOnce(content: string, search: string, replacement: string, label: string): string {
  const first = content.indexOf(search);
  if (first < 0) throw new Error(`Could not find ${label} anchor`);
  if (content.indexOf(search, first + search.length) >= 0) {
    throw new Error(`${label} anchor is ambiguous`);
  }
  return content.slice(0, first) + replacement + content.slice(first + search.length);
}

function installImport(content: string, modulePath: string, symbols: string[], name: string): string {
  if (content.includes(begin(name))) return content;
  const firstImport = content.search(/^import /m);
  if (firstImport < 0) throw new Error(`Could not find import anchor for ${name}`);
  const block = `${begin(name)}\nimport { ${symbols.join(', ')} } from '${modulePath}';\n${end(name)}\n`;
  return content.slice(0, firstImport) + block + content.slice(firstImport);
}

function removeMarkedBlock(content: string, name: string): string {
  const pattern = new RegExp(
    `^[ \\t]*${escapeRegExp(begin(name))}\\r?\\n[\\s\\S]*?^[ \\t]*${escapeRegExp(end(name))}\\r?\\n?`,
    'm',
  );
  const next = content.replace(pattern, '');
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
      'router-import',
      'router-policy',
      'router-engaged-delivery',
      'router-accumulate-delivery',
      'router-delivery-signature',
      'router-command-gate',
    ])
  ) {
    return source;
  }
  let content = installImport(
    source,
    './hosthooks.js',
    ['runDeliveryPolicies'],
    'router-import',
  );

  content = replaceOnce(
    content,
    '    const engages = evaluateEngage(agent, messageText, isMention, mg, effectiveThreadId);',
    marked(
      'router-policy',
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
    const engages = hosthooksPolicy.engages;`,
    ),
    'router engage policy',
  );

  content = replaceOnce(
    content,
    '      await deliverToAgent(agent, agentGroup, mg, event, userId, threadsEnabled, effectiveThreadId, true);',
    marked(
      'router-engaged-delivery',
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
      );`,
    ),
    'router engaged delivery',
  );

  content = replaceOnce(
    content,
    '      await deliverToAgent(agent, agentGroup, mg, event, userId, threadsEnabled, effectiveThreadId, false);',
    marked(
      'router-accumulate-delivery',
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
      );`,
    ),
    'router accumulate delivery',
  );

  content = replaceOnce(
    content,
    '  wake: boolean,\n): Promise<void> {',
    marked('router-delivery-signature', '  wake: boolean,\n  skipCommandGate = false,') +
      '\n): Promise<void> {',
    'deliverToAgent signature',
  );

  content = replaceOnce(
    content,
    "  if (event.message.kind === 'chat' || event.message.kind === 'chat-sdk') {",
    marked(
      'router-command-gate',
      "  if (!skipCommandGate && (event.message.kind === 'chat' || event.message.kind === 'chat-sdk')) {",
    ),
    'router command gate',
  );
  return content;
}

export function unpatchRouter(source: string): string {
  let content = source;
  content = removeAndRestore(
    content,
    'router-command-gate',
    "  if (event.message.kind === 'chat' || event.message.kind === 'chat-sdk') {",
  );
  content = removeAndRestore(
    content,
    'router-delivery-signature',
    '  wake: boolean,',
  );
  content = removeAndRestore(
    content,
    'router-accumulate-delivery',
    '      await deliverToAgent(agent, agentGroup, mg, event, userId, threadsEnabled, effectiveThreadId, false);',
  );
  content = removeAndRestore(
    content,
    'router-engaged-delivery',
    '      await deliverToAgent(agent, agentGroup, mg, event, userId, threadsEnabled, effectiveThreadId, true);',
  );
  content = removeAndRestore(
    content,
    'router-policy',
    '    const engages = evaluateEngage(agent, messageText, isMention, mg, effectiveThreadId);',
  );
  return removeMarkedBlock(content, 'router-import');
}

export function patchDelivery(source: string): string {
  if (isFullyPatched(source, ['delivery-import', 'delivery-transform'])) return source;
  let content = installImport(
    source,
    './hosthooks.js',
    ['runOutboundContentTransforms'],
    'delivery-import',
  );
  const call = '  const platformMsgId = await deliveryAdapter.deliver(';
  const block = marked(
    'delivery-transform',
    `  const deliverContent = runOutboundContentTransforms({
    content: msg.content,
    message: msg,
    session,
    agentGroup: getAgentGroup(session.agent_group_id),
    parsed: content,
  });`,
  );
  content = replaceOnce(content, call, `${block}\n${call}`, 'delivery adapter call');
  content = replaceOnce(
    content,
    '    msg.kind,\n    msg.content,\n    files,',
    '    msg.kind,\n    deliverContent,\n    files,',
    'delivery content argument',
  );
  return content;
}

export function unpatchDelivery(source: string): string {
  let content = source.replace(
    '    msg.kind,\n    deliverContent,\n    files,',
    '    msg.kind,\n    msg.content,\n    files,',
  );
  content = removeMarkedBlock(content, 'delivery-transform');
  return removeMarkedBlock(content, 'delivery-import');
}

export function patchClaudeProvider(source: string): string {
  if (
    isFullyPatched(source, ['claude-import', 'claude-query-options', 'claude-observer'])
  ) {
    return source;
  }
  let content = installImport(
    source,
    '../hosthooks.js',
    ['runProviderMessageObservers', 'runProviderQueryOptionsContributors'],
    'claude-import',
  );
  content = replaceOnce(
    content,
    "        permissionMode: 'bypassPermissions',",
    `${marked(
      'claude-query-options',
      "        ...runProviderQueryOptionsContributors({ provider: 'claude' }),",
    )}\n        permissionMode: 'bypassPermissions',`,
    'Claude query options',
  );
  const observerAnchor = `        messageCount++;

        // Yield activity for every SDK event so the poll loop knows the agent is working
        yield { type: 'activity' };`;
  content = replaceOnce(
    content,
    observerAnchor,
    `${observerAnchor}\n${marked(
      'claude-observer',
      "        runProviderMessageObservers(message, { provider: 'claude' });",
    )}`,
    'Claude SDK message activity yield',
  );
  return content;
}

export function unpatchClaudeProvider(source: string): string {
  let content = removeMarkedBlock(source, 'claude-observer');
  content = removeMarkedBlock(content, 'claude-query-options');
  return removeMarkedBlock(content, 'claude-import');
}

export function patchPollLoop(source: string): string {
  if (isFullyPatched(source, ['poll-import', 'poll-observer'])) return source;
  let content = installImport(
    source,
    './hosthooks.js',
    ['runInboundBatchObservers'],
    'poll-import',
  );
  const anchor =
    "    const messages = getPendingMessages(isFirstPoll).filter((m) => m.kind !== 'system');";
  const block = marked(
    'poll-observer',
    `    if (messages.length > 0) {
      runInboundBatchObservers(messages);
    }`,
  );
  return replaceOnce(content, anchor, `${anchor}\n${block}`, 'poll-loop pending messages');
}

export function unpatchPollLoop(source: string): string {
  let content = removeMarkedBlock(source, 'poll-observer');
  content = removeMarkedBlock(content, 'poll-import');
  return content;
}

export function patchContainerRunner(source: string): string {
  if (isFullyPatched(source, ['container-import', 'container-env'])) return source;
  let content = installImport(
    source,
    './hosthooks.js',
    ['runContainerEnvContributors'],
    'container-import',
  );
  const anchor = "  args.push('-e', `TZ=${TIMEZONE}`);";
  const block = marked(
    'container-env',
    `  const hosthookEnv = runContainerEnvContributors([
    'TZ',
    ...Object.keys(providerContribution.env ?? {}),
  ]);
  for (const [key, value] of Object.entries(hosthookEnv)) {
    args.push('-e', \`\${key}=\${value}\`);
  }`,
  );
  return replaceOnce(content, anchor, `${anchor}\n${block}`, 'container environment');
}

export function unpatchContainerRunner(source: string): string {
  let content = removeMarkedBlock(source, 'container-env');
  content = removeMarkedBlock(content, 'container-import');
  return content;
}

export const FILE_TRANSFORMS: FileTransform[] = [
  { path: 'src/router.ts', transform: patchRouter, uninstall: unpatchRouter },
  { path: 'src/delivery.ts', transform: patchDelivery, uninstall: unpatchDelivery },
  {
    path: 'container/agent-runner/src/providers/claude.ts',
    transform: patchClaudeProvider,
    uninstall: unpatchClaudeProvider,
  },
  {
    path: 'container/agent-runner/src/poll-loop.ts',
    transform: patchPollLoop,
    uninstall: unpatchPollLoop,
  },
  {
    path: 'src/container-runner.ts',
    transform: patchContainerRunner,
    uninstall: unpatchContainerRunner,
  },
];

function removeAndRestore(content: string, name: string, original: string): string {
  const start = content.indexOf(begin(name));
  if (start < 0) return content;
  const finish = content.indexOf(end(name), start);
  if (finish < 0) throw new Error(`Corrupt hosthooks block: ${name}`);
  const after = finish + end(name).length;
  const lineStart = content.lastIndexOf('\n', start - 1) + 1;
  const lineEnd = content.indexOf('\n', after);
  return content.slice(0, lineStart) + original + content.slice(lineEnd < 0 ? after : lineEnd);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isFullyPatched(content: string, names: string[]): boolean {
  const present = names.filter(
    (name) => content.includes(begin(name)) || content.includes(end(name)),
  );
  if (present.length === 0) return false;
  const complete = names.every(
    (name) => content.includes(begin(name)) && content.includes(end(name)),
  );
  if (!complete) {
    throw new Error(`Partial or corrupt hosthooks patch; expected blocks: ${names.join(', ')}`);
  }
  return true;
}

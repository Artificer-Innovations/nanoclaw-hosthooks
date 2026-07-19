async function main() {
  await startCliServer();
  await initChannelAdapters(() => ({}));
}

declare function startCliServer(): Promise<void>;
declare function initChannelAdapters(factory: unknown): Promise<void>;

void main();

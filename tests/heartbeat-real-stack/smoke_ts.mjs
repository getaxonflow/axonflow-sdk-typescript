// Cross-platform real-stack smoke for the TypeScript SDK. ESM so we
// can `import` without bundling. CI compiles the SDK first via
// `npm run build`; this file imports the compiled CJS via the package's
// public entry point (see SDK_DIST_DIR env var resolution below).

import * as fs from 'node:fs';
import * as path from 'node:path';

function stampPath() {
  if (process.platform === 'darwin') {
    return path.join(
      process.env.HOME,
      'Library',
      'Caches',
      'axonflow',
      'typescript-telemetry-last-sent'
    );
  }
  if (process.platform === 'win32') {
    return path.join(
      process.env.LOCALAPPDATA,
      'axonflow',
      'typescript-telemetry-last-sent'
    );
  }
  if (process.env.XDG_CACHE_HOME) {
    return path.join(
      process.env.XDG_CACHE_HOME,
      'axonflow',
      'typescript-telemetry-last-sent'
    );
  }
  return path.join(
    process.env.HOME,
    '.cache',
    'axonflow',
    'typescript-telemetry-last-sent'
  );
}

async function main() {
  const sdkPath = process.env.SDK_DIST_DIR; // set by CI: /github/workspace/dist/cjs/index.js
  if (!sdkPath) {
    console.error('FAIL: SDK_DIST_DIR not set');
    process.exit(1);
  }
  const { AxonFlow } = await import(sdkPath);

  const agent = process.env.AXONFLOW_AGENT_URL;
  if (!agent) {
    console.error('FAIL: AXONFLOW_AGENT_URL not set');
    process.exit(1);
  }

  const expected = stampPath();

  const client = new AxonFlow({
    endpoint: agent,
    clientId: 'smoke-test',
    clientSecret: 'smoke-secret',
  });
  try {
    await client.healthCheck();
  } catch {
    // ignore
  }
  // heartbeatReady resolves only after the POST has settled (see
  // src/client.ts — chains _preRequestHook + flushHeartbeat).
  await client.heartbeatReady;

  if (!fs.existsSync(expected)) {
    console.error(`FAIL: stamp not at ${expected}`);
    process.exit(1);
  }
  console.log(`OK: stamp at ${expected}`);
  process.exit(0);
}

main().catch((e) => {
  console.error('FAIL:', e);
  process.exit(1);
});

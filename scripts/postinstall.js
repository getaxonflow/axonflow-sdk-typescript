#!/usr/bin/env node

/**
 * Postinstall warning about npm publishing issues
 * This script runs after `npm install @axonflow/sdk`
 */

const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

console.log(`
${RED}${BOLD}╔════════════════════════════════════════════════════════════════════════════╗${RESET}
${RED}${BOLD}║                    ⚠️  IMPORTANT: OUTDATED VERSION  ⚠️                       ║${RESET}
${RED}${BOLD}╚════════════════════════════════════════════════════════════════════════════╝${RESET}

${YELLOW}The npm version of @axonflow/sdk is SIGNIFICANTLY OUTDATED due to npm registry issues.${RESET}

  ${BOLD}npm version:${RESET}    v2.3.0 (you just installed this)
  ${BOLD}latest version:${RESET} v2.7.0 (available on GitHub)

${YELLOW}Missing features in npm version:${RESET}
  • Unified Execution Tracking (MAP + WCP status)
  • MAS FEAT Compliance Module (Enterprise)
  • Workflow Control Plane with governance gates
  • Workflow Policy Enforcement transparency
  • MCP Exfiltration Detection
  • MCP Dynamic Policies
  • proxyLLMCall() method

${BOLD}To get the latest features, build from source:${RESET}

  git clone https://github.com/getaxonflow/axonflow-sdk-typescript.git
  cd axonflow-sdk-typescript
  npm install && npm run build
  npm link

  # Then in your project:
  npm link @axonflow/sdk

${YELLOW}For updates: https://github.com/getaxonflow/axonflow-sdk-typescript/issues${RESET}
${YELLOW}Contact: dev@getaxonflow.com${RESET}

`);

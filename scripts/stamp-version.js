#!/usr/bin/env node
/**
 * Stamps the version from package.json into src/version.ts.
 *
 * This runs as a prebuild step to avoid runtime package.json resolution
 * issues in CJS/ESM builds (dist/cjs/ and dist/esm/ can't resolve
 * ../package.json at the correct depth).
 */
const fs = require('fs');
const path = require('path');

const pkg = require(path.resolve(__dirname, '..', 'package.json'));
const versionFile = path.resolve(__dirname, '..', 'src', 'version.ts');

const content = `/**
 * SDK version constant.
 *
 * This value is auto-stamped from package.json by the prebuild script
 * (\`scripts/stamp-version.js\`). Do not edit manually.
 *
 * During tests, Jest runs source directly and the test suite verifies
 * this value matches package.json.
 */
// AUTO-GENERATED — do not edit. Run \`npm run stamp-version\` to update.
export const VERSION = '${pkg.version}';
`;

fs.writeFileSync(versionFile, content, 'utf8');
console.log(`Stamped VERSION = '${pkg.version}' into src/version.ts`);

/**
 * SDK version constant.
 *
 * Read from package.json to avoid version drift between the npm package
 * and the telemetry payload. Uses import syntax for CJS/ESM compatibility.
 */
import packageJson from '../package.json';

export const VERSION: string = packageJson.version;

/**
 * SDK version constant.
 *
 * Read from package.json to avoid version drift between the npm package
 * and the telemetry payload.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
export const VERSION: string = require('../package.json').version;

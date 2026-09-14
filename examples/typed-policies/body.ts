/**
 * Where `examples/typed-policies` finds its default document: the body the
 * platform's own route test proves publishable. It is found from this file's own
 * location, so the example runs from any directory. It is kept apart from the
 * example so a unit test can check the path without importing the SDK.
 */

import { join } from 'path';

export const DEFAULT_BODY_PATH = join(
  __dirname,
  '..',
  '..',
  'tests',
  'fixtures',
  'typed-policy-publish-body.json'
);

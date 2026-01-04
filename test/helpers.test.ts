/**
 * Unit tests for AxonFlow Helper Functions
 */

import {
  generateRequestId,
  debugLog,
  sleep,
  isBrowser,
  isNode,
  safeStringify,
} from '../src/utils/helpers';

describe('Helper Functions', () => {
  describe('generateRequestId', () => {
    it('should generate a unique request ID', () => {
      const id = generateRequestId();
      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
    });

    it('should start with req_ prefix', () => {
      const id = generateRequestId();
      expect(id.startsWith('req_')).toBe(true);
    });

    it('should contain timestamp', () => {
      const before = Date.now();
      const id = generateRequestId();
      const after = Date.now();

      // Extract timestamp from ID
      const parts = id.split('_');
      const timestamp = parseInt(parts[1], 10);
      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });

    it('should generate different IDs on each call', () => {
      const id1 = generateRequestId();
      const id2 = generateRequestId();
      expect(id1).not.toBe(id2);
    });

    it('should have random suffix', () => {
      const id = generateRequestId();
      const parts = id.split('_');
      expect(parts.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('debugLog', () => {
    let consoleSpy: jest.SpyInstance;

    beforeEach(() => {
      consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    it('should log message with [AxonFlow] prefix', () => {
      debugLog('Test message');
      expect(consoleSpy).toHaveBeenCalled();
      const call = consoleSpy.mock.calls[0];
      expect(call[0]).toBe('[AxonFlow] Test message');
    });

    it('should log message without data', () => {
      debugLog('Simple message');
      expect(consoleSpy).toHaveBeenCalledWith('[AxonFlow] Simple message', '');
    });

    it('should log message with data as JSON', () => {
      const data = { key: 'value', count: 42 };
      debugLog('With data', data);
      const call = consoleSpy.mock.calls[0];
      expect(call[1]).toContain('"key": "value"');
      expect(call[1]).toContain('"count": 42');
    });

    it('should handle nested objects', () => {
      const data = {
        level1: {
          level2: {
            value: 'deep',
          },
        },
      };
      debugLog('Nested', data);
      const call = consoleSpy.mock.calls[0];
      expect(call[1]).toContain('"value": "deep"');
    });
  });

  describe('sleep', () => {
    it('should return a promise', () => {
      const result = sleep(0);
      expect(result).toBeInstanceOf(Promise);
    });

    it('should resolve after specified time', async () => {
      const start = Date.now();
      await sleep(50);
      const elapsed = Date.now() - start;
      // Allow for some timing variance
      expect(elapsed).toBeGreaterThanOrEqual(40);
    });

    it('should work with 0ms', async () => {
      const start = Date.now();
      await sleep(0);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(100);
    });
  });

  describe('isBrowser', () => {
    it('should return false in Node.js environment', () => {
      expect(isBrowser()).toBe(false);
    });
  });

  describe('isNode', () => {
    it('should return true in Node.js environment', () => {
      expect(isNode()).toBe(true);
    });

    it('should check for process.versions.node', () => {
      expect(process.versions.node).toBeDefined();
    });
  });

  describe('safeStringify', () => {
    it('should stringify simple objects', () => {
      const obj = { key: 'value' };
      const result = safeStringify(obj);
      expect(result).toBe('{"key":"value"}');
    });

    it('should stringify nested objects', () => {
      const obj = { a: { b: { c: 1 } } };
      const result = safeStringify(obj);
      expect(result).toBe('{"a":{"b":{"c":1}}}');
    });

    it('should handle arrays', () => {
      const obj = { items: [1, 2, 3] };
      const result = safeStringify(obj);
      expect(result).toBe('{"items":[1,2,3]}');
    });

    it('should handle circular references', () => {
      const obj: any = { name: 'test' };
      obj.self = obj;

      const result = safeStringify(obj);
      expect(result).toContain('[Circular]');
      expect(result).toContain('"name":"test"');
    });

    it('should handle multiple circular references', () => {
      const a: any = { name: 'a' };
      const b: any = { name: 'b' };
      a.ref = b;
      b.ref = a;

      const result = safeStringify(a);
      expect(result).toContain('[Circular]');
    });

    it('should handle null values', () => {
      const obj = { key: null };
      const result = safeStringify(obj);
      expect(result).toBe('{"key":null}');
    });

    it('should handle undefined values', () => {
      const obj = { key: undefined };
      const result = safeStringify(obj);
      // JSON.stringify omits undefined values
      expect(result).toBe('{}');
    });

    it('should handle mixed types', () => {
      const obj = {
        str: 'hello',
        num: 42,
        bool: true,
        arr: [1, 'two'],
        obj: { nested: true },
      };
      const result = safeStringify(obj);
      expect(result).toContain('"str":"hello"');
      expect(result).toContain('"num":42');
      expect(result).toContain('"bool":true');
    });
  });

  describe('isBrowser edge cases', () => {
    it('should return true when window and document exist', () => {
      // Simulate browser environment
      const originalWindow = (global as any).window;
      (global as any).window = { document: {} };

      expect(isBrowser()).toBe(true);

      // Restore
      if (originalWindow === undefined) {
        delete (global as any).window;
      } else {
        (global as any).window = originalWindow;
      }
    });

    it('should return false when window exists but document does not', () => {
      const originalWindow = (global as any).window;
      (global as any).window = {};

      expect(isBrowser()).toBe(false);

      // Restore
      if (originalWindow === undefined) {
        delete (global as any).window;
      } else {
        (global as any).window = originalWindow;
      }
    });
  });

  describe('isNode edge cases', () => {
    it('should return false when process is undefined', () => {
      const originalProcess = global.process;
      (global as any).process = undefined;

      expect(isNode()).toBe(false);

      // Restore
      global.process = originalProcess;
    });

    it('should return false when process.versions.node is undefined', () => {
      const originalProcess = global.process;
      // Create a mock process object with versions but no node property
      (global as any).process = {
        versions: {},
      };

      expect(isNode()).toBe(false);

      // Restore
      global.process = originalProcess;
    });
  });
});

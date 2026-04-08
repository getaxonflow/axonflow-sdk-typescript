/**
 * Tests for classifyEndpoint (issue #1525).
 */
import { classifyEndpoint, TelemetryPayload } from '../src/telemetry';

describe('classifyEndpoint', () => {
  describe('localhost', () => {
    it('classifies hostname localhost', () => {
      expect(classifyEndpoint('http://localhost:8080')).toBe('localhost');
      expect(classifyEndpoint('https://localhost')).toBe('localhost');
    });
    it('classifies IPv4 127.0.0.1', () => {
      expect(classifyEndpoint('http://127.0.0.1')).toBe('localhost');
      expect(classifyEndpoint('http://127.0.0.1:8080')).toBe('localhost');
    });
    it('classifies IPv6 ::1', () => {
      expect(classifyEndpoint('http://[::1]')).toBe('localhost');
      expect(classifyEndpoint('http://[::1]:8080')).toBe('localhost');
    });
    it('classifies 0.0.0.0', () => {
      expect(classifyEndpoint('http://0.0.0.0:8080')).toBe('localhost');
    });
    it('classifies *.localhost', () => {
      expect(classifyEndpoint('http://agent.localhost')).toBe('localhost');
    });
    it('classifies 127/8 as localhost', () => {
      expect(classifyEndpoint('http://127.1.2.3')).toBe('localhost');
    });
  });

  describe('private_network', () => {
    it('classifies RFC1918 10.x', () => {
      expect(classifyEndpoint('http://10.0.0.1')).toBe('private_network');
      expect(classifyEndpoint('http://10.1.2.3')).toBe('private_network');
    });
    it('classifies RFC1918 192.168.x', () => {
      expect(classifyEndpoint('http://192.168.1.1')).toBe('private_network');
    });
    it('classifies RFC1918 172.16-31', () => {
      expect(classifyEndpoint('http://172.16.0.1')).toBe('private_network');
      expect(classifyEndpoint('http://172.31.255.254')).toBe('private_network');
    });
    it('does NOT classify 172.15 or 172.32 as private', () => {
      expect(classifyEndpoint('http://172.15.0.1')).toBe('remote');
      expect(classifyEndpoint('http://172.32.0.1')).toBe('remote');
    });
    it('classifies link-local 169.254', () => {
      expect(classifyEndpoint('http://169.254.169.254')).toBe('private_network');
    });
    it('classifies .internal and .local and .lan and .intranet', () => {
      expect(classifyEndpoint('http://agent.internal')).toBe('private_network');
      expect(classifyEndpoint('http://agent.local')).toBe('private_network');
      expect(classifyEndpoint('http://agent.lan')).toBe('private_network');
      expect(classifyEndpoint('http://agent.intranet')).toBe('private_network');
    });
  });

  describe('remote', () => {
    it('classifies public hostnames', () => {
      expect(classifyEndpoint('https://production-us.getaxonflow.com')).toBe('remote');
      expect(classifyEndpoint('https://api.example.com')).toBe('remote');
    });
    it('classifies public IPv4', () => {
      expect(classifyEndpoint('http://8.8.8.8')).toBe('remote');
      expect(classifyEndpoint('http://1.1.1.1')).toBe('remote');
    });
  });

  describe('unknown', () => {
    it('classifies empty string', () => {
      expect(classifyEndpoint('')).toBe('unknown');
    });
    it('classifies null', () => {
      expect(classifyEndpoint(null)).toBe('unknown');
    });
    it('classifies undefined', () => {
      expect(classifyEndpoint(undefined)).toBe('unknown');
    });
    it('classifies malformed URL', () => {
      expect(classifyEndpoint('not-a-url')).toBe('unknown');
      expect(classifyEndpoint('://nohost')).toBe('unknown');
    });
  });

  describe('case insensitivity', () => {
    it('uppercase host becomes lowercase', () => {
      expect(classifyEndpoint('http://LOCALHOST')).toBe('localhost');
      expect(classifyEndpoint('http://AGENT.INTERNAL')).toBe('private_network');
    });
  });
});

describe('TelemetryPayload shape', () => {
  it('type includes endpoint_type', () => {
    // Compile-time check via type assertion. No runtime assert needed.
    const p: TelemetryPayload = {
      sdk: 'typescript',
      sdk_version: '5.2.0',
      platform_version: null,
      os: 'linux',
      arch: 'x64',
      runtime_version: '20',
      deployment_mode: 'production',
      endpoint_type: 'localhost',
      features: [],
      instance_id: 'test',
    };
    expect(p.endpoint_type).toBe('localhost');
  });
});

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
    it('classifies expanded IPv6 loopback 0:0:0:0:0:0:0:1', () => {
      // v5.3.0 fix: alternate loopback forms must match. Python/Go
      // handled these via stdlib; TS used to misclassify as remote.
      expect(classifyEndpoint('http://[0:0:0:0:0:0:0:1]')).toBe('localhost');
      expect(classifyEndpoint('http://[0000:0000:0000:0000:0000:0000:0000:0001]')).toBe(
        'localhost'
      );
    });
    it('classifies IPv6 unspecified :: as localhost', () => {
      // :: is the IPv6 equivalent of 0.0.0.0 — listen-all marker.
      expect(classifyEndpoint('http://[::]:8080')).toBe('localhost');
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
    it('classifies IPv6 ULA fc00::/7 as private_network', () => {
      // v5.3.0 fix (review finding P3): IPv6 ULA addresses used to fall
      // through to "remote". Python/Go classify them as private via stdlib.
      expect(classifyEndpoint('http://[fd00::1]:8080')).toBe('private_network');
      expect(classifyEndpoint('http://[fd12:3456:789a::1]')).toBe('private_network');
      expect(classifyEndpoint('http://[fc00::1]')).toBe('private_network');
      expect(classifyEndpoint('http://[fcff:ffff::]')).toBe('private_network');
    });
    it('classifies IPv6 link-local fe80::/10 as private_network', () => {
      expect(classifyEndpoint('http://[fe80::1]')).toBe('private_network');
      expect(classifyEndpoint('http://[febf::1]')).toBe('private_network');
    });
    it('does NOT classify IPv6 fec0::/10 (deprecated site-local) as private', () => {
      // fec0::/10 is deprecated (RFC 3879) and not part of fe80::/10 or fc00::/7.
      expect(classifyEndpoint('http://[fec0::1]')).toBe('remote');
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
    it('classifies public IPv6 as remote', () => {
      expect(classifyEndpoint('http://[2001:4860:4860::8888]')).toBe('remote');
      expect(classifyEndpoint('http://[2606:4700:4700::1111]')).toBe('remote');
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
    const p: TelemetryPayload = {
      telemetry_type: 'sdk',
      sdk: 'typescript',
      sdk_version: '5.3.0',
      platform_version: null,
      os: 'linux',
      arch: 'x64',
      runtime_version: '20',
      deployment_mode: 'self_hosted',
      profile: 'unknown',
      endpoint_type: 'localhost',
      features: [],
      instance_id: 'test',
    };
    expect(p.endpoint_type).toBe('localhost');
  });

  it('serialized payload does not contain the raw URL or fragments of it', () => {
    // v5.3.0: strengthened test (review M8). Previously the test was a
    // type-shape check only. Now serialize a payload with a realistic
    // sensitive URL classification and grep the JSON body for any fragment.
    const sensitiveUrl = 'https://my-private-cluster.banking-internal.example.com:8443';
    const endpointType = classifyEndpoint(sensitiveUrl);
    expect(endpointType).toBe('remote');

    const payload: TelemetryPayload = {
      telemetry_type: 'sdk',
      sdk: 'typescript',
      sdk_version: '5.3.0',
      platform_version: null,
      os: 'linux',
      arch: 'x64',
      runtime_version: '20',
      deployment_mode: 'self_hosted',
      profile: 'unknown',
      endpoint_type: endpointType,
      features: [],
      instance_id: 'leak-test',
    };
    const json = JSON.stringify(payload);
    for (const fragment of [
      'my-private-cluster',
      'banking-internal',
      'example.com',
      '8443',
      'https://',
    ]) {
      expect(json).not.toContain(fragment);
    }
  });
});

/**
 * Tests for Connector methods and Orchestrator health check
 * Part of Issue #849 - SDK Comprehensive Audit
 */

import { AxonFlow } from '../src/client';
import type { ConnectorMetadata } from '../src/types/connector';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe('Connector and Orchestrator Methods', () => {
  let client: AxonFlow;

  beforeEach(() => {
    jest.clearAllMocks();
    client = new AxonFlow({
      endpoint: 'http://localhost:8080',
      clientId: 'test-client',
      clientSecret: 'test-secret',
      tenant: 'test-tenant',
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // Helper to create mock responses
  const mockResponse = (data: unknown, status = 200) => {
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? 'OK' : 'Error',
      json: () => Promise.resolve(data),
      text: () => Promise.resolve(JSON.stringify(data)),
    });
  };

  // Sample test data
  const sampleConnector: ConnectorMetadata = {
    id: 'postgres',
    name: 'PostgreSQL Connector',
    type: 'database',
    description: 'Connect to PostgreSQL databases',
    version: '1.0.0',
    category: 'database',
    icon: 'postgres-icon',
    tags: ['sql', 'database'],
    capabilities: ['query', 'write'],
    configSchema: {},
    installed: true,
    healthy: true,
  };

  // ========================================================================
  // Orchestrator Health Check Tests
  // ========================================================================

  describe('orchestratorHealthCheck', () => {
    it('should return healthy status when orchestrator is up', async () => {
      mockFetch.mockReturnValueOnce(
        mockResponse({
          status: 'healthy',
          version: '2.5.0',
          components: {
            database: { status: 'healthy' },
            llm: { status: 'healthy' },
          },
        })
      );

      const health = await client.orchestratorHealthCheck();

      expect(health.status).toBe('healthy');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/health',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should return unhealthy status when orchestrator returns error', async () => {
      mockFetch.mockReturnValueOnce(mockResponse({}, 500));

      const health = await client.orchestratorHealthCheck();

      expect(health.status).toBe('unhealthy');
      expect(health.components?.orchestrator?.status).toBe('error');
    });

    it('should return unhealthy status when orchestrator is unreachable', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      const health = await client.orchestratorHealthCheck();

      expect(health.status).toBe('unhealthy');
      expect(health.components?.orchestrator?.message).toContain('Connection refused');
    });

    it('should handle timeout gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('timeout'));

      const health = await client.orchestratorHealthCheck();

      expect(health.status).toBe('unhealthy');
    });
  });

  // ========================================================================
  // Connector Tests
  // ========================================================================

  describe('listConnectors', () => {
    it('should list all connectors', async () => {
      mockFetch.mockReturnValueOnce(
        mockResponse({
          connectors: [sampleConnector],
          total: 1,
        })
      );

      const connectors = await client.listConnectors();

      expect(connectors).toHaveLength(1);
      expect(connectors[0].id).toBe('postgres');
      expect(connectors[0].name).toBe('PostgreSQL Connector');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/connectors',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should handle empty connector list', async () => {
      mockFetch.mockReturnValueOnce(
        mockResponse({
          connectors: [],
          total: 0,
        })
      );

      const connectors = await client.listConnectors();

      expect(connectors).toHaveLength(0);
    });
  });

  describe('installConnector', () => {
    it('should install a connector', async () => {
      mockFetch.mockReturnValueOnce(mockResponse({}));

      await client.installConnector({
        connector_id: 'postgres',
        name: 'my-postgres',
        tenant_id: 'test-tenant',
        options: { host: 'localhost', port: 5432 },
        credentials: { password: 'secret' },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/connectors/postgres/install',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"name":"my-postgres"'),
        })
      );
    });
  });

  describe('uninstallConnector', () => {
    it('should uninstall a connector', async () => {
      mockFetch.mockReturnValueOnce(mockResponse({}));

      await client.uninstallConnector('postgres');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/connectors/postgres',
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('should handle not found error', async () => {
      mockFetch.mockReturnValueOnce(mockResponse({ error: 'Connector not found' }, 404));

      await expect(client.uninstallConnector('unknown')).rejects.toThrow();
    });
  });

  describe('queryConnector', () => {
    it('should execute a query against a connector', async () => {
      mockFetch.mockReturnValueOnce(
        mockResponse({
          success: true,
          data: [{ id: 1, name: 'Test' }],
          metadata: { rowCount: 1 },
        })
      );

      const result = await client.queryConnector('postgres', 'SELECT * FROM users');

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/request',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"request_type":"mcp-query"'),
        })
      );
    });

    it('should pass parameters to the query', async () => {
      mockFetch.mockReturnValueOnce(
        mockResponse({
          success: true,
          data: [{ id: 1 }],
        })
      );

      await client.queryConnector('postgres', 'SELECT * FROM users WHERE id = $1', {
        id: 1,
      });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.context.params).toEqual({ id: 1 });
    });
  });

  // ========================================================================
  // MCP Query Tests (Policy Enforcement)
  // ========================================================================

  describe('mcpQuery', () => {
    it('should execute a query with policy enforcement', async () => {
      mockFetch.mockReturnValueOnce(
        mockResponse({
          success: true,
          data: [{ id: 1, name: 'Test' }],
          redacted: false,
          policy_info: {
            policies_evaluated: 5,
            blocked: false,
            redactions_applied: 0,
            processing_time_ms: 2,
          },
        })
      );

      const result = await client.mcpQuery({
        connector: 'postgres',
        statement: 'SELECT * FROM users',
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.policy_info?.policies_evaluated).toBe(5);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/mcp/resources/query',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"connector":"postgres"'),
        })
      );
    });

    it('should handle redacted response', async () => {
      mockFetch.mockReturnValueOnce(
        mockResponse({
          success: true,
          data: [{ id: 1, ssn: '***REDACTED***' }],
          redacted: true,
          redacted_fields: ['data[0].ssn'],
          policy_info: {
            policies_evaluated: 5,
            blocked: false,
            redactions_applied: 1,
            processing_time_ms: 3,
          },
        })
      );

      const result = await client.mcpQuery({
        connector: 'postgres',
        statement: 'SELECT * FROM customers',
      });

      expect(result.redacted).toBe(true);
      expect(result.redacted_fields).toContain('data[0].ssn');
      expect(result.policy_info?.redactions_applied).toBe(1);
    });

    it('should throw error when connector is missing', async () => {
      await expect(client.mcpQuery({ connector: '', statement: 'SELECT 1' })).rejects.toThrow(
        'connector name is required'
      );
    });

    it('should throw error when statement is missing', async () => {
      await expect(client.mcpQuery({ connector: 'postgres', statement: '' })).rejects.toThrow(
        'statement is required'
      );
    });

    it('should handle policy block (403)', async () => {
      mockFetch.mockReturnValueOnce(mockResponse({ error: 'Request blocked: SQLi detected' }, 403));

      await expect(
        client.mcpQuery({
          connector: 'postgres',
          statement: 'SELECT * FROM users; DROP TABLE users;--',
        })
      ).rejects.toThrow('blocked');
    });
  });

  describe('mcpExecute', () => {
    it('should execute a statement (alias for mcpQuery)', async () => {
      mockFetch.mockReturnValueOnce(
        mockResponse({
          success: true,
          data: { affected_rows: 1 },
          policy_info: {
            policies_evaluated: 3,
            blocked: false,
            redactions_applied: 0,
            processing_time_ms: 1,
          },
        })
      );

      const result = await client.mcpExecute({
        connector: 'postgres',
        statement: 'UPDATE users SET name = $1 WHERE id = $2',
      });

      expect(result.success).toBe(true);
      expect(result.policy_info?.policies_evaluated).toBe(3);
    });
  });
});

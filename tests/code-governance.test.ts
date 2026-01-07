/**
 * Tests for Code Governance methods (Enterprise)
 * Covers Git provider configuration, PR creation, metrics, and export
 */

import { AxonFlow } from '../src/client';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe('Code Governance Methods', () => {
  let client: AxonFlow;

  // Helper to create mock responses
  const mockResponse = (data: unknown, status = 200, headers: Record<string, string> = {}) => {
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? 'OK' : 'Error',
      headers: {
        get: (name: string) => headers[name.toLowerCase()] || null,
      },
      json: () => Promise.resolve(data),
      text: () => Promise.resolve(JSON.stringify(data)),
    });
  };

  // Helper to mock portal login
  const mockPortalLogin = () => {
    mockFetch.mockReturnValueOnce(
      mockResponse(
        {
          session_id: 'test-session',
          org_id: 'test-org',
          email: 'test@example.com',
          name: 'Test User',
          expires_at: new Date(Date.now() + 86400000).toISOString(),
        },
        200,
        { 'set-cookie': 'axonflow_session=test-session-cookie; Path=/' }
      )
    );
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    client = new AxonFlow({
      endpoint: 'http://localhost:8080',
      licenseKey: 'test-license-key',
      tenant: 'test-tenant',
    });
    // Login to portal before each test since Code Governance requires auth
    mockPortalLogin();
    await client.loginToPortal('test-org', 'test-pass');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // Sample test data
  const samplePRRecord = {
    id: 'pr_123',
    pr_number: 42,
    pr_url: 'https://github.com/org/repo/pull/42',
    title: 'feat: add validation',
    state: 'open',
    owner: 'org',
    repo: 'repo',
    head_branch: 'feat/validation',
    base_branch: 'main',
    files_count: 3,
    secrets_detected: 0,
    unsafe_patterns: 0,
    created_at: '2025-01-01T00:00:00Z',
    created_by: 'user@example.com',
    provider_type: 'github',
  };

  const sampleMetrics = {
    tenant_id: 'test-tenant',
    total_prs: 100,
    open_prs: 10,
    merged_prs: 85,
    closed_prs: 5,
    total_files: 500,
    total_secrets_detected: 3,
    total_unsafe_patterns: 7,
    first_pr_at: '2024-01-01T00:00:00Z',
    last_pr_at: '2025-01-01T00:00:00Z',
  };

  // ========================================================================
  // Git Provider Tests
  // ========================================================================

  describe('Git Provider Configuration', () => {
    describe('validateGitProvider', () => {
      it('should validate GitHub credentials', async () => {
        mockFetch.mockReturnValueOnce(
          mockResponse({
            valid: true,
            message: 'Credentials are valid',
          })
        );

        const result = await client.validateGitProvider({
          type: 'github',
          token: 'ghp_xxxxxxxxxxxx',
        });

        expect(result.valid).toBe(true);
        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:8080/api/v1/code-governance/git-providers/validate',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({
              type: 'github',
              token: 'ghp_xxxxxxxxxxxx',
            }),
          })
        );
      });

      it('should validate GitLab self-hosted with base URL', async () => {
        mockFetch.mockReturnValueOnce(
          mockResponse({
            valid: true,
            message: 'Credentials are valid',
          })
        );

        const result = await client.validateGitProvider({
          type: 'gitlab',
          token: 'glpat-xxxx',
          baseUrl: 'https://gitlab.mycompany.com',
        });

        expect(result.valid).toBe(true);
        expect(mockFetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            body: JSON.stringify({
              type: 'gitlab',
              token: 'glpat-xxxx',
              base_url: 'https://gitlab.mycompany.com',
            }),
          })
        );
      });

      it('should validate GitHub App credentials', async () => {
        mockFetch.mockReturnValueOnce(
          mockResponse({
            valid: true,
            message: 'GitHub App credentials are valid',
          })
        );

        const result = await client.validateGitProvider({
          type: 'github',
          appId: 12345,
          installationId: 67890,
          privateKey: '-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----',
        });

        expect(result.valid).toBe(true);
        expect(mockFetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            body: JSON.stringify({
              type: 'github',
              app_id: 12345,
              installation_id: 67890,
              private_key: '-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----',
            }),
          })
        );
      });

      it('should return invalid for bad credentials', async () => {
        mockFetch.mockReturnValueOnce(
          mockResponse({
            valid: false,
            message: 'Invalid token: 401 Unauthorized',
          })
        );

        const result = await client.validateGitProvider({
          type: 'github',
          token: 'bad-token',
        });

        expect(result.valid).toBe(false);
        expect(result.message).toContain('Invalid');
      });
    });

    describe('configureGitProvider', () => {
      it('should configure GitHub provider', async () => {
        mockFetch.mockReturnValueOnce(
          mockResponse({
            message: 'Git provider configured successfully',
            type: 'github',
          })
        );

        const result = await client.configureGitProvider({
          type: 'github',
          token: 'ghp_xxxxxxxxxxxx',
        });

        expect(result.message).toBe('Git provider configured successfully');
        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:8080/api/v1/code-governance/git-providers',
          expect.objectContaining({
            method: 'POST',
          })
        );
      });

      it('should configure Bitbucket provider', async () => {
        mockFetch.mockReturnValueOnce(
          mockResponse({
            message: 'Git provider configured successfully',
            type: 'bitbucket',
          })
        );

        const result = await client.configureGitProvider({
          type: 'bitbucket',
          token: 'bitbucket-token',
          baseUrl: 'https://bitbucket.mycompany.com',
        });

        expect(result.type).toBe('bitbucket');
      });
    });

    describe('listGitProviders', () => {
      it('should list configured providers', async () => {
        mockFetch.mockReturnValueOnce(
          mockResponse({
            providers: [
              {
                type: 'github',
                configured_at: '2025-01-01T00:00:00Z',
                auth_type: 'token',
              },
            ],
            count: 1,
          })
        );

        const result = await client.listGitProviders();

        expect(result.count).toBe(1);
        expect(result.providers).toHaveLength(1);
        expect(result.providers[0].type).toBe('github');
      });

      it('should return empty list when no providers configured', async () => {
        mockFetch.mockReturnValueOnce(
          mockResponse({
            providers: [],
            count: 0,
          })
        );

        const result = await client.listGitProviders();

        expect(result.count).toBe(0);
        expect(result.providers).toHaveLength(0);
      });
    });

    describe('deleteGitProvider', () => {
      it('should delete a configured provider', async () => {
        mockFetch.mockReturnValueOnce(mockResponse(undefined, 204));

        await client.deleteGitProvider('github');

        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:8080/api/v1/code-governance/git-providers/github',
          expect.objectContaining({
            method: 'DELETE',
          })
        );
      });
    });
  });

  // ========================================================================
  // PR Management Tests
  // ========================================================================

  describe('PR Management', () => {
    describe('createPR', () => {
      it('should create a PR with minimal options', async () => {
        mockFetch.mockReturnValueOnce(
          mockResponse({
            pr_id: 'pr_123',
            pr_number: 42,
            pr_url: 'https://github.com/org/repo/pull/42',
            state: 'open',
            head_branch: 'axonflow/generated-code',
            created_at: '2025-01-01T00:00:00Z',
          })
        );

        const result = await client.createPR({
          owner: 'org',
          repo: 'repo',
          title: 'feat: add validation',
          files: [
            {
              path: 'src/utils/validation.ts',
              content: 'export function validate() {}',
              language: 'typescript',
              action: 'create',
            },
          ],
        });

        expect(result.prId).toBe('pr_123');
        expect(result.prNumber).toBe(42);
        expect(result.prUrl).toBe('https://github.com/org/repo/pull/42');
      });

      it('should create a PR with all options', async () => {
        mockFetch.mockReturnValueOnce(
          mockResponse({
            pr_id: 'pr_456',
            pr_number: 43,
            pr_url: 'https://github.com/org/repo/pull/43',
            state: 'open',
            head_branch: 'feat/custom-branch',
            created_at: '2025-01-01T00:00:00Z',
          })
        );

        const result = await client.createPR({
          owner: 'org',
          repo: 'repo',
          title: 'feat: add validation',
          description: 'Generated validation utilities',
          baseBranch: 'develop',
          branchName: 'feat/custom-branch',
          draft: true,
          files: [
            {
              path: 'src/utils/validation.ts',
              content: 'export function validate() {}',
              language: 'typescript',
              action: 'create',
            },
          ],
          agentRequestId: 'req_123',
          model: 'gpt-4',
          policiesChecked: ['code-secrets', 'code-unsafe'],
          secretsDetected: 0,
          unsafePatterns: 0,
        });

        expect(result.prNumber).toBe(43);
        expect(result.headBranch).toBe('feat/custom-branch');

        // Verify all fields were sent (calls[1] because calls[0] is the login)
        const callBody = JSON.parse(mockFetch.mock.calls[1][1].body);
        expect(callBody.description).toBe('Generated validation utilities');
        expect(callBody.base_branch).toBe('develop');
        expect(callBody.branch_name).toBe('feat/custom-branch');
        expect(callBody.draft).toBe(true);
        expect(callBody.agent_request_id).toBe('req_123');
        expect(callBody.model).toBe('gpt-4');
        expect(callBody.policies_checked).toEqual(['code-secrets', 'code-unsafe']);
        expect(callBody.secrets_detected).toBe(0);
        expect(callBody.unsafe_patterns).toBe(0);
      });
    });

    describe('listPRs', () => {
      it('should list all PRs', async () => {
        mockFetch.mockReturnValueOnce(
          mockResponse({
            prs: [samplePRRecord],
            count: 1,
          })
        );

        const result = await client.listPRs();

        expect(result.count).toBe(1);
        expect(result.prs).toHaveLength(1);
        expect(result.prs[0].prNumber).toBe(42);
        expect(result.prs[0].prUrl).toBe('https://github.com/org/repo/pull/42');
      });

      it('should list PRs with filters', async () => {
        mockFetch.mockReturnValueOnce(
          mockResponse({
            prs: [samplePRRecord],
            count: 1,
          })
        );

        await client.listPRs({
          state: 'open',
          limit: 10,
          offset: 5,
        });

        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:8080/api/v1/code-governance/prs?limit=10&offset=5&state=open',
          expect.any(Object)
        );
      });

      it('should transform snake_case to camelCase', async () => {
        mockFetch.mockReturnValueOnce(
          mockResponse({
            prs: [samplePRRecord],
            count: 1,
          })
        );

        const result = await client.listPRs();

        expect(result.prs[0].headBranch).toBe('feat/validation');
        expect(result.prs[0].baseBranch).toBe('main');
        expect(result.prs[0].filesCount).toBe(3);
        expect(result.prs[0].secretsDetected).toBe(0);
        expect(result.prs[0].unsafePatterns).toBe(0);
        expect(result.prs[0].createdAt).toBe('2025-01-01T00:00:00Z');
        expect(result.prs[0].createdBy).toBe('user@example.com');
        expect(result.prs[0].providerType).toBe('github');
      });
    });

    describe('getPR', () => {
      it('should get a specific PR', async () => {
        mockFetch.mockReturnValueOnce(mockResponse(samplePRRecord));

        const result = await client.getPR('pr_123');

        expect(result.id).toBe('pr_123');
        expect(result.prNumber).toBe(42);
        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:8080/api/v1/code-governance/prs/pr_123',
          expect.any(Object)
        );
      });
    });

    describe('syncPRStatus', () => {
      it('should sync PR status with Git provider', async () => {
        const updatedPR = { ...samplePRRecord, state: 'merged' };
        mockFetch.mockReturnValueOnce(mockResponse(updatedPR));

        const result = await client.syncPRStatus('pr_123');

        expect(result.state).toBe('merged');
        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:8080/api/v1/code-governance/prs/pr_123/sync',
          expect.objectContaining({
            method: 'POST',
          })
        );
      });
    });

    describe('closePR', () => {
      it('should close PR and delete branch by default', async () => {
        const closedPR = { ...samplePRRecord, state: 'closed', closed_at: '2025-01-02T00:00:00Z' };
        mockFetch.mockReturnValueOnce(mockResponse(closedPR));

        const result = await client.closePR('pr_123');

        expect(result.state).toBe('closed');
        expect(result.closedAt).toBe('2025-01-02T00:00:00Z');
        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:8080/api/v1/code-governance/prs/pr_123?delete_branch=true',
          expect.objectContaining({
            method: 'DELETE',
          })
        );
      });

      it('should close PR without deleting branch when specified', async () => {
        const closedPR = { ...samplePRRecord, state: 'closed', closed_at: '2025-01-02T00:00:00Z' };
        mockFetch.mockReturnValueOnce(mockResponse(closedPR));

        const result = await client.closePR('pr_123', false);

        expect(result.state).toBe('closed');
        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:8080/api/v1/code-governance/prs/pr_123',
          expect.objectContaining({
            method: 'DELETE',
          })
        );
      });

      it('should transform snake_case to camelCase in response', async () => {
        const closedPR = {
          ...samplePRRecord,
          state: 'closed',
          closed_at: '2025-01-02T00:00:00Z',
        };
        mockFetch.mockReturnValueOnce(mockResponse(closedPR));

        const result = await client.closePR('pr_123');

        expect(result.headBranch).toBe('feat/validation');
        expect(result.baseBranch).toBe('main');
        expect(result.filesCount).toBe(3);
        expect(result.secretsDetected).toBe(0);
        expect(result.unsafePatterns).toBe(0);
        expect(result.createdAt).toBe('2025-01-01T00:00:00Z');
        expect(result.closedAt).toBe('2025-01-02T00:00:00Z');
      });

      it('should throw APIError on 404', async () => {
        mockFetch.mockReturnValueOnce(mockResponse({ error: 'PR not found' }, 404));

        await expect(client.closePR('nonexistent')).rejects.toThrow('Not Found');
      });
    });
  });

  // ========================================================================
  // Metrics and Export Tests
  // ========================================================================

  describe('Metrics and Export', () => {
    describe('getCodeGovernanceMetrics', () => {
      it('should get code governance metrics', async () => {
        mockFetch.mockReturnValueOnce(mockResponse(sampleMetrics));

        const result = await client.getCodeGovernanceMetrics();

        expect(result.tenantId).toBe('test-tenant');
        expect(result.totalPrs).toBe(100);
        expect(result.openPrs).toBe(10);
        expect(result.mergedPrs).toBe(85);
        expect(result.closedPrs).toBe(5);
        expect(result.totalFiles).toBe(500);
        expect(result.totalSecretsDetected).toBe(3);
        expect(result.totalUnsafePatterns).toBe(7);
        expect(result.firstPrAt).toBe('2024-01-01T00:00:00Z');
        expect(result.lastPrAt).toBe('2025-01-01T00:00:00Z');
      });

      it('should handle missing optional fields', async () => {
        mockFetch.mockReturnValueOnce(
          mockResponse({
            tenant_id: 'test-tenant',
            total_prs: 0,
            open_prs: 0,
            merged_prs: 0,
            closed_prs: 0,
            total_files: 0,
            total_secrets_detected: 0,
            total_unsafe_patterns: 0,
          })
        );

        const result = await client.getCodeGovernanceMetrics();

        expect(result.firstPrAt).toBeUndefined();
        expect(result.lastPrAt).toBeUndefined();
      });
    });

    describe('exportCodeGovernanceData', () => {
      it('should export all data without filters', async () => {
        mockFetch.mockReturnValueOnce(
          mockResponse({
            records: [samplePRRecord],
            count: 1,
            exported_at: '2025-01-01T12:00:00Z',
          })
        );

        const result = await client.exportCodeGovernanceData();

        expect(result.count).toBe(1);
        expect(result.exportedAt).toBe('2025-01-01T12:00:00Z');
        expect(result.records).toHaveLength(1);
        expect(result.records[0].prNumber).toBe(42);
        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:8080/api/v1/code-governance/export?format=json',
          expect.any(Object)
        );
      });

      it('should export data with date filters', async () => {
        mockFetch.mockReturnValueOnce(
          mockResponse({
            records: [samplePRRecord],
            count: 1,
            exported_at: '2025-01-01T12:00:00Z',
          })
        );

        await client.exportCodeGovernanceData({
          startDate: '2024-01-01T00:00:00Z',
          endDate: '2024-12-31T23:59:59Z',
          state: 'merged',
        });

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('start_date=2024-01-01T00%3A00%3A00Z'),
          expect.any(Object)
        );
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('end_date=2024-12-31T23%3A59%3A59Z'),
          expect.any(Object)
        );
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('state=merged'),
          expect.any(Object)
        );
      });

      it('should transform snake_case to camelCase in records', async () => {
        mockFetch.mockReturnValueOnce(
          mockResponse({
            records: [samplePRRecord],
            count: 1,
            exported_at: '2025-01-01T12:00:00Z',
          })
        );

        const result = await client.exportCodeGovernanceData();

        expect(result.records[0].headBranch).toBe('feat/validation');
        expect(result.records[0].baseBranch).toBe('main');
        expect(result.records[0].filesCount).toBe(3);
        expect(result.records[0].createdBy).toBe('user@example.com');
        expect(result.records[0].providerType).toBe('github');
      });
    });

    describe('exportCodeGovernanceDataCSV', () => {
      it('should export data as CSV without filters', async () => {
        mockFetch.mockReturnValueOnce(
          Promise.resolve({
            ok: true,
            status: 200,
            statusText: 'OK',
            headers: { get: () => null },
            text: () => Promise.resolve('id,title,state\npr_123,Test PR,open'),
          })
        );

        const result = await client.exportCodeGovernanceDataCSV();
        expect(result).toContain('id,title,state');
        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:8080/api/v1/code-governance/export?format=csv',
          expect.any(Object)
        );
      });

      it('should export CSV with date filters', async () => {
        mockFetch.mockReturnValueOnce(
          Promise.resolve({
            ok: true,
            status: 200,
            statusText: 'OK',
            headers: { get: () => null },
            text: () => Promise.resolve('id,title,state\npr_123,Test PR,merged'),
          })
        );

        await client.exportCodeGovernanceDataCSV({
          startDate: '2024-01-01',
          endDate: '2024-12-31',
          state: 'merged',
        });

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('start_date=2024-01-01'),
          expect.any(Object)
        );
      });
    });
  });

  // ========================================================================
  // Debug Mode Tests
  // ========================================================================

  describe('Debug Mode', () => {
    it('should log debug info when debug mode is enabled', async () => {
      const debugClient = new AxonFlow({
        endpoint: 'http://localhost:8080',
        licenseKey: 'test-license-key',
        tenant: 'test-tenant',
        debug: true,
      });

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      // First mock the portal login
      mockFetch.mockReturnValueOnce(
        mockResponse(
          {
            session_id: 'test-session',
            org_id: 'test-org',
            email: 'test@example.com',
            name: 'Test User',
            expires_at: new Date(Date.now() + 86400000).toISOString(),
          },
          200,
          { 'set-cookie': 'axonflow_session=test-session-cookie; Path=/' }
        )
      );
      await debugClient.loginToPortal('test-org', 'test-pass');

      // Then mock the actual API call
      mockFetch.mockReturnValueOnce(
        mockResponse({
          valid: true,
          message: 'Credentials are valid',
        })
      );

      await debugClient.validateGitProvider({
        type: 'github',
        token: 'ghp_xxxx',
      });

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  // ========================================================================
  // Error Handling Tests
  // ========================================================================

  describe('Error Handling', () => {
    it('should throw AuthenticationError on 401', async () => {
      mockFetch.mockReturnValueOnce(mockResponse({ error: 'Unauthorized' }, 401));

      await expect(
        client.validateGitProvider({
          type: 'github',
          token: 'bad-token',
        })
      ).rejects.toThrow('Request failed');
    });

    it('should throw AuthenticationError on 403', async () => {
      mockFetch.mockReturnValueOnce(mockResponse({ error: 'Forbidden' }, 403));

      await expect(
        client.createPR({
          owner: 'org',
          repo: 'repo',
          title: 'test',
          files: [],
        })
      ).rejects.toThrow('Request failed');
    });

    it('should throw APIError on server error', async () => {
      mockFetch.mockReturnValueOnce(mockResponse({ error: 'Internal server error' }, 500));

      await expect(client.getCodeGovernanceMetrics()).rejects.toThrow();
    });

    it('should throw APIError on 404', async () => {
      mockFetch.mockReturnValueOnce(mockResponse({ error: 'Not found' }, 404));

      await expect(client.getPR('nonexistent')).rejects.toThrow('Not Found');
    });

    it('should log debug info on portal request with body', async () => {
      const debugClient = new AxonFlow({
        endpoint: 'http://localhost:8080',
        licenseKey: 'test-license-key',
        tenant: 'test-tenant',
        debug: true,
      });

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      // First login
      mockFetch.mockReturnValueOnce(
        mockResponse(
          {
            session_id: 'test-session',
            org_id: 'test-org',
            email: 'test@example.com',
            name: 'Test User',
            expires_at: new Date(Date.now() + 86400000).toISOString(),
          },
          200,
          { 'set-cookie': 'axonflow_session=test-session-cookie; Path=/' }
        )
      );
      await debugClient.loginToPortal('test-org', 'test-pass');

      // Then configure provider (POST with body)
      mockFetch.mockReturnValueOnce(mockResponse({ message: 'configured' }));
      await debugClient.configureGitProvider({ type: 'github', token: 'ghp_xxx' });

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  // ========================================================================
  // Portal Authentication Edge Cases
  // ========================================================================

  describe('Portal Authentication Edge Cases', () => {
    it('should handle login failure', async () => {
      const freshClient = new AxonFlow({
        endpoint: 'http://localhost:8080',
        licenseKey: 'test-license-key',
        tenant: 'test-tenant',
      });

      mockFetch.mockReturnValueOnce(mockResponse({ error: 'Invalid credentials' }, 401));

      await expect(freshClient.loginToPortal('bad-org', 'bad-pass')).rejects.toThrow(
        'Login failed'
      );
    });

    it('should use session_id fallback when no cookie header', async () => {
      const freshClient = new AxonFlow({
        endpoint: 'http://localhost:8080',
        licenseKey: 'test-license-key',
        tenant: 'test-tenant',
      });

      // Mock login response without set-cookie header
      mockFetch.mockReturnValueOnce(
        mockResponse({
          session_id: 'fallback-session-id',
          org_id: 'test-org',
          email: 'test@example.com',
          name: 'Test User',
          expires_at: new Date(Date.now() + 86400000).toISOString(),
        })
      );

      const result = await freshClient.loginToPortal('test-org', 'test-pass');
      expect(result.sessionId).toBe('fallback-session-id');
      expect(freshClient.isLoggedIn()).toBe(true);
    });

    it('should check isLoggedIn correctly', () => {
      // Client from beforeEach is logged in
      expect(client.isLoggedIn()).toBe(true);

      // Fresh client is not logged in
      const freshClient = new AxonFlow({
        endpoint: 'http://localhost:8080',
        licenseKey: 'test-license-key',
        tenant: 'test-tenant',
      });
      expect(freshClient.isLoggedIn()).toBe(false);
    });

    it('should handle logout successfully', async () => {
      // Client is logged in from beforeEach
      expect(client.isLoggedIn()).toBe(true);

      // Mock logout response
      mockFetch.mockReturnValueOnce(mockResponse({ success: true }));

      await client.logoutFromPortal();
      expect(client.isLoggedIn()).toBe(false);
    });

    it('should handle logout when not logged in', async () => {
      const freshClient = new AxonFlow({
        endpoint: 'http://localhost:8080',
        licenseKey: 'test-license-key',
        tenant: 'test-tenant',
      });

      // Should not throw and should return early
      await freshClient.logoutFromPortal();
      expect(freshClient.isLoggedIn()).toBe(false);
    });

    it('should handle logout network error silently', async () => {
      // Client is logged in from beforeEach
      expect(client.isLoggedIn()).toBe(true);

      // Mock network error
      mockFetch.mockReturnValueOnce(Promise.reject(new Error('Network error')));

      // Should not throw
      await client.logoutFromPortal();
      expect(client.isLoggedIn()).toBe(false);
    });

    it('should log debug info during portal login', async () => {
      const debugClient = new AxonFlow({
        endpoint: 'http://localhost:8080',
        licenseKey: 'test-license-key',
        tenant: 'test-tenant',
        debug: true,
      });

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      mockFetch.mockReturnValueOnce(
        mockResponse(
          {
            session_id: 'test-session',
            org_id: 'test-org',
            email: 'test@example.com',
            name: 'Test User',
            expires_at: new Date(Date.now() + 86400000).toISOString(),
          },
          200,
          { 'set-cookie': 'axonflow_session=test-session-cookie; Path=/' }
        )
      );

      await debugClient.loginToPortal('test-org', 'test-pass');
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should log debug info during portal logout', async () => {
      const debugClient = new AxonFlow({
        endpoint: 'http://localhost:8080',
        licenseKey: 'test-license-key',
        tenant: 'test-tenant',
        debug: true,
      });

      // First login
      mockFetch.mockReturnValueOnce(
        mockResponse(
          {
            session_id: 'test-session',
            org_id: 'test-org',
            email: 'test@example.com',
            name: 'Test User',
            expires_at: new Date(Date.now() + 86400000).toISOString(),
          },
          200,
          { 'set-cookie': 'axonflow_session=test-session-cookie; Path=/' }
        )
      );
      await debugClient.loginToPortal('test-org', 'test-pass');

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      // Mock logout response
      mockFetch.mockReturnValueOnce(mockResponse({ success: true }));

      await debugClient.logoutFromPortal();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});

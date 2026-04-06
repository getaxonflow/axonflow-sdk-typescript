import { GovernedTool, governTools, ToolDefinition, GovernedToolOptions } from '../src/adapters/governed-tool';
import { PolicyViolationError } from '../src/errors';
import { AxonFlow } from '../src/client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockClient(overrides?: {
  mcpCheckInput?: jest.Mock;
  mcpCheckOutput?: jest.Mock;
}) {
  return {
    mcpCheckInput: overrides?.mcpCheckInput ??
      jest.fn().mockResolvedValue({ allowed: true, policies_evaluated: 1 }),
    mcpCheckOutput: overrides?.mcpCheckOutput ??
      jest.fn().mockResolvedValue({ allowed: true, policies_evaluated: 1 }),
  } as unknown as AxonFlow;
}

function createMockTool(overrides?: Partial<ToolDefinition>): ToolDefinition {
  return {
    name: 'search',
    description: 'Search the web',
    invoke: jest.fn().mockResolvedValue('search result'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GovernedTool', () => {
  // 1. Clean call allowed
  it('allows a clean call when input and output checks pass', async () => {
    const mockClient = createMockClient();
    const mockTool = createMockTool();
    const governed = new GovernedTool(mockTool, mockClient);

    const result = await governed.invoke({ query: 'test' });

    expect(result).toBe('search result');
    expect(mockTool.invoke).toHaveBeenCalledWith({ query: 'test' });
    expect((mockClient.mcpCheckInput as jest.Mock)).toHaveBeenCalledWith({
      connectorType: 'search',
      statement: '{"query":"test"}',
      operation: 'execute',
    });
    expect((mockClient.mcpCheckOutput as jest.Mock)).toHaveBeenCalledWith({
      connectorType: 'search',
      message: 'search result',
    });
  });

  // 2. Input blocked
  it('throws PolicyViolationError when input is blocked', async () => {
    const mockClient = createMockClient({
      mcpCheckInput: jest.fn().mockResolvedValue({
        allowed: false,
        block_reason: 'SQL injection detected',
        policies_evaluated: 1,
      }),
    });
    const mockTool = createMockTool();
    const governed = new GovernedTool(mockTool, mockClient);

    await expect(governed.invoke('DROP TABLE users'))
      .rejects
      .toThrow(PolicyViolationError);

    await expect(governed.invoke('DROP TABLE users'))
      .rejects
      .toThrow('SQL injection detected');

    // Tool should never have been invoked
    expect(mockTool.invoke).not.toHaveBeenCalled();
  });

  // 3. Output blocked
  it('throws PolicyViolationError when output is blocked (tool WAS invoked)', async () => {
    const mockClient = createMockClient({
      mcpCheckOutput: jest.fn().mockResolvedValue({
        allowed: false,
        block_reason: 'PII detected in response',
        policies_evaluated: 2,
      }),
    });
    const mockTool = createMockTool();
    const governed = new GovernedTool(mockTool, mockClient);

    await expect(governed.invoke('find user data'))
      .rejects
      .toThrow(PolicyViolationError);

    // Tool WAS invoked before output check blocked it
    expect(mockTool.invoke).toHaveBeenCalledWith('find user data');
  });

  // 4. Output redacted
  it('returns redacted_data when output is redacted', async () => {
    const mockClient = createMockClient({
      mcpCheckOutput: jest.fn().mockResolvedValue({
        allowed: true,
        policies_evaluated: 1,
        redacted_data: 'Name: [REDACTED:pii], SSN: [REDACTED:ssn]',
      }),
    });
    const mockTool = createMockTool({
      invoke: jest.fn().mockResolvedValue('Name: John Doe, SSN: 123-45-6789'),
    });
    const governed = new GovernedTool(mockTool, mockClient);

    const result = await governed.invoke('get user info');

    expect(result).toBe('Name: [REDACTED:pii], SSN: [REDACTED:ssn]');
  });

  // 5. Custom connectorTypeFn
  it('uses custom connectorTypeFn to derive connector type', async () => {
    const mockClient = createMockClient();
    const mockTool = createMockTool({ name: 'web_search' });
    const governed = new GovernedTool(mockTool, mockClient, {
      connectorTypeFn: (name) => `custom_${name}`,
    });

    await governed.invoke('test');

    expect((mockClient.mcpCheckInput as jest.Mock)).toHaveBeenCalledWith(
      expect.objectContaining({ connectorType: 'custom_web_search' }),
    );
    expect((mockClient.mcpCheckOutput as jest.Mock)).toHaveBeenCalledWith(
      expect.objectContaining({ connectorType: 'custom_web_search' }),
    );
  });

  // 6. Custom operation
  it('uses custom operation for input check', async () => {
    const mockClient = createMockClient();
    const mockTool = createMockTool();
    const governed = new GovernedTool(mockTool, mockClient, { operation: 'query' });

    await governed.invoke('SELECT * FROM users');

    expect((mockClient.mcpCheckInput as jest.Mock)).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'query' }),
    );
  });

  // 7. governTools batch helper
  it('governTools wraps multiple tools', async () => {
    const mockClient = createMockClient();
    const tool1 = createMockTool({ name: 'search', description: 'Search' });
    const tool2 = createMockTool({ name: 'calculator', description: 'Calculate' });
    const tool3 = createMockTool({ name: 'email', description: 'Send email' });

    const governed = governTools([tool1, tool2, tool3], mockClient);

    expect(governed).toHaveLength(3);
    expect(governed[0]).toBeInstanceOf(GovernedTool);
    expect(governed[1]).toBeInstanceOf(GovernedTool);
    expect(governed[2]).toBeInstanceOf(GovernedTool);
    expect(governed[0].name).toBe('search');
    expect(governed[1].name).toBe('calculator');
    expect(governed[2].name).toBe('email');
  });

  // 7b. governTools passes options through
  it('governTools passes options to each GovernedTool', async () => {
    const mockClient = createMockClient();
    const tool1 = createMockTool({ name: 'db_read' });
    const tool2 = createMockTool({ name: 'db_write' });

    const governed = governTools([tool1, tool2], mockClient, {
      connectorTypeFn: (name) => `postgres_${name}`,
      operation: 'query',
    });

    await governed[0].invoke('test');

    expect((mockClient.mcpCheckInput as jest.Mock)).toHaveBeenCalledWith(
      expect.objectContaining({
        connectorType: 'postgres_db_read',
        operation: 'query',
      }),
    );
  });

  // 8. String input passed through (not double-serialized)
  it('passes string input through without double-serialization', async () => {
    const mockClient = createMockClient();
    const mockTool = createMockTool();
    const governed = new GovernedTool(mockTool, mockClient);

    await governed.invoke('plain text query');

    expect((mockClient.mcpCheckInput as jest.Mock)).toHaveBeenCalledWith(
      expect.objectContaining({ statement: 'plain text query' }),
    );
    // Tool receives the original string, not a JSON-quoted string
    expect(mockTool.invoke).toHaveBeenCalledWith('plain text query');
  });

  // 9. Object input JSON.stringify'd
  it('JSON-serializes object input for policy check', async () => {
    const mockClient = createMockClient();
    const mockTool = createMockTool();
    const governed = new GovernedTool(mockTool, mockClient);

    const input = { query: 'test', filters: [1, 2, 3] };
    await governed.invoke(input);

    expect((mockClient.mcpCheckInput as jest.Mock)).toHaveBeenCalledWith(
      expect.objectContaining({
        statement: JSON.stringify(input),
      }),
    );
    // Tool receives original object, not serialized string
    expect(mockTool.invoke).toHaveBeenCalledWith(input);
  });

  // 10. Constructor rejects invalid tool
  describe('constructor validation', () => {
    it('rejects tool with missing name', () => {
      const mockClient = createMockClient();
      expect(() => new GovernedTool(
        { name: '', description: 'test', invoke: jest.fn() },
        mockClient,
      )).toThrow(TypeError);
      expect(() => new GovernedTool(
        { name: '', description: 'test', invoke: jest.fn() },
        mockClient,
      )).toThrow('non-empty "name"');
    });

    it('rejects tool with missing invoke', () => {
      const mockClient = createMockClient();
      expect(() => new GovernedTool(
        { name: 'test', description: 'test' } as any,
        mockClient,
      )).toThrow(TypeError);
      expect(() => new GovernedTool(
        { name: 'test', description: 'test' } as any,
        mockClient,
      )).toThrow('"invoke" method');
    });

    it('rejects null tool', () => {
      const mockClient = createMockClient();
      expect(() => new GovernedTool(null as any, mockClient)).toThrow(TypeError);
    });

    it('accepts tool with empty description', () => {
      const mockClient = createMockClient();
      const tool = createMockTool({ description: '' });
      const governed = new GovernedTool(tool, mockClient);
      expect(governed.description).toBe('');
    });
  });

  // 11. fromLangChain adapts duck-typed object
  describe('fromLangChain', () => {
    it('adapts a duck-typed LangChain tool', async () => {
      const mockClient = createMockClient();
      const langchainTool = {
        name: 'tavily_search',
        description: 'Search using Tavily API',
        invoke: jest.fn().mockResolvedValue('tavily results'),
      };

      const governed = GovernedTool.fromLangChain(langchainTool, mockClient);

      expect(governed).toBeInstanceOf(GovernedTool);
      expect(governed.name).toBe('tavily_search');
      expect(governed.description).toBe('Search using Tavily API');

      const result = await governed.invoke('AI governance');
      expect(result).toBe('tavily results');
      expect(langchainTool.invoke).toHaveBeenCalledWith('AI governance');
    });

    it('accepts options when adapting LangChain tool', async () => {
      const mockClient = createMockClient();
      const langchainTool = {
        name: 'db_query',
        description: 'Query database',
        invoke: jest.fn().mockResolvedValue([]),
      };

      const governed = GovernedTool.fromLangChain(langchainTool, mockClient, {
        connectorTypeFn: () => 'postgres',
        operation: 'query',
      });

      await governed.invoke('SELECT 1');

      expect((mockClient.mcpCheckInput as jest.Mock)).toHaveBeenCalledWith(
        expect.objectContaining({
          connectorType: 'postgres',
          operation: 'query',
        }),
      );
    });
  });

  // 12. toString format
  it('toString returns expected format', () => {
    const mockClient = createMockClient();
    const mockTool = createMockTool({ name: 'web_search' });
    const governed = new GovernedTool(mockTool, mockClient);

    expect(governed.toString()).toBe('GovernedTool(name=web_search, connectorType=web_search)');
  });

  it('toString reflects custom connectorType', () => {
    const mockClient = createMockClient();
    const mockTool = createMockTool({ name: 'web_search' });
    const governed = new GovernedTool(mockTool, mockClient, {
      connectorTypeFn: () => 'http',
    });

    expect(governed.toString()).toBe('GovernedTool(name=web_search, connectorType=http)');
  });

  // Edge cases
  describe('edge cases', () => {
    it('uses default block reason when input block_reason is undefined', async () => {
      const mockClient = createMockClient({
        mcpCheckInput: jest.fn().mockResolvedValue({
          allowed: false,
          policies_evaluated: 1,
        }),
      });
      const governed = new GovernedTool(createMockTool(), mockClient);

      await expect(governed.invoke('test'))
        .rejects
        .toThrow('Tool call blocked by input policy');
    });

    it('uses default block reason when output block_reason is undefined', async () => {
      const mockClient = createMockClient({
        mcpCheckOutput: jest.fn().mockResolvedValue({
          allowed: false,
          policies_evaluated: 1,
        }),
      });
      const governed = new GovernedTool(createMockTool(), mockClient);

      await expect(governed.invoke('test'))
        .rejects
        .toThrow('Tool output blocked by policy');
    });

    it('does not return redacted_data when it is null', async () => {
      const mockClient = createMockClient({
        mcpCheckOutput: jest.fn().mockResolvedValue({
          allowed: true,
          policies_evaluated: 1,
          redacted_data: null,
        }),
      });
      const mockTool = createMockTool({
        invoke: jest.fn().mockResolvedValue('original'),
      });
      const governed = new GovernedTool(mockTool, mockClient);

      const result = await governed.invoke('test');
      expect(result).toBe('original');
    });

    it('does not return redacted_data when it is undefined', async () => {
      const mockClient = createMockClient({
        mcpCheckOutput: jest.fn().mockResolvedValue({
          allowed: true,
          policies_evaluated: 1,
          redacted_data: undefined,
        }),
      });
      const mockTool = createMockTool({
        invoke: jest.fn().mockResolvedValue('original'),
      });
      const governed = new GovernedTool(mockTool, mockClient);

      const result = await governed.invoke('test');
      expect(result).toBe('original');
    });

    it('serializes non-string tool output for output check', async () => {
      const mockClient = createMockClient();
      const mockTool = createMockTool({
        invoke: jest.fn().mockResolvedValue({ data: [1, 2, 3] }),
      });
      const governed = new GovernedTool(mockTool, mockClient);

      const result = await governed.invoke('test');

      expect((mockClient.mcpCheckOutput as jest.Mock)).toHaveBeenCalledWith(
        expect.objectContaining({
          message: '{"data":[1,2,3]}',
        }),
      );
      expect(result).toEqual({ data: [1, 2, 3] });
    });

    it('handles numeric input', async () => {
      const mockClient = createMockClient();
      const mockTool = createMockTool();
      const governed = new GovernedTool(mockTool, mockClient);

      await governed.invoke(42);

      expect((mockClient.mcpCheckInput as jest.Mock)).toHaveBeenCalledWith(
        expect.objectContaining({ statement: '42' }),
      );
      expect(mockTool.invoke).toHaveBeenCalledWith(42);
    });
  });
});

import { AxonFlow } from '../src/client';
import { registerTry } from '../src/community';

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

const originalTry = process.env.AXONFLOW_TRY;

afterEach(() => {
  mockFetch.mockReset();
  if (originalTry === undefined) delete process.env.AXONFLOW_TRY;
  else process.env.AXONFLOW_TRY = originalTry;
});

it('sends new Hosted signup to the verified Portal without a registration request', async () => {
  await expect(registerTry()).rejects.toThrow('https://portal.try.getaxonflow.com/hosted/start');
  await expect(registerTry('trial', 'https://try-staging.getaxonflow.com')).rejects.toThrow(
    'https://portal.try.getaxonflow.com/hosted/start'
  );
  await expect(registerTry('trial', 'https://try.getaxonflow.com.')).rejects.toThrow(
    'https://portal.try.getaxonflow.com/hosted/start'
  );
  await expect(registerTry('trial', 'https://try-staging.getaxonflow.com.:443')).rejects.toThrow(
    'https://portal.try.getaxonflow.com/hosted/start'
  );
  expect(mockFetch).not.toHaveBeenCalled();
});

it('keeps explicit self-hosted Community registration available', async () => {
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ tenant_id: 'local-tenant', secret: 'local-secret' }),
  });
  await expect(registerTry('local', 'http://localhost:8080')).resolves.toMatchObject({
    tenant_id: 'local-tenant',
  });
  expect(mockFetch).toHaveBeenCalledWith(
    'http://localhost:8080/api/v1/register',
    expect.objectContaining({ method: 'POST', body: '{"label":"local"}' })
  );
});

it('keeps an explicit self-hosted endpoint when AXONFLOW_TRY is inherited', async () => {
  process.env.AXONFLOW_TRY = '1';
  mockFetch.mockResolvedValue({ ok: true, json: async () => ({ allowed: true }) });
  const client = new AxonFlow({ endpoint: 'http://localhost:8080' });
  await client.mcpCheckInput({ connectorType: 'postgres', statement: 'SELECT 1' });
  expect(mockFetch).toHaveBeenCalledWith(
    'http://localhost:8080/api/v1/mcp/check-input',
    expect.any(Object)
  );
});

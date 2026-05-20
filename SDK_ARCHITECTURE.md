# AxonFlow TypeScript SDK Architecture

## Core Design Principles

### 1. Invisible Governance
- Zero UI changes required
- No user training needed
- Drop-in replacement for AI calls
- 30-day pilot-to-production promise

### 2. Simple Integration
```typescript
// Before: Direct AI call
const response = await openai.complete(prompt);

// After: With AxonFlow (3 lines)
import { AxonFlow } from '@axonflow/sdk';
const af = new AxonFlow({ apiKey: 'your-key' });
const response = await af.protect(() => openai.complete(prompt));
```

### 3. Universal Compatibility
- Works in Node.js (backend)
- Works in browsers (frontend)
- Works with React/Next.js/Vue
- TypeScript + JavaScript support

## SDK Architecture

### Package Structure
```
@axonflow/sdk/
├── src/
│   ├── index.ts           # Main entry point
│   ├── client.ts          # AxonFlow client class
│   ├── interceptors/
│   │   ├── openai.ts      # OpenAI interceptor
│   │   ├── anthropic.ts   # Anthropic interceptor
│   │   └── base.ts        # Base interceptor interface
│   ├── types/
│   │   ├── config.ts      # Configuration types
│   │   ├── policy.ts      # Policy types
│   │   └── response.ts    # Response types
│   ├── utils/
│   │   ├── cache.ts       # Response caching
│   │   └── logger.ts      # Debug logging
│   └── constants.ts       # SDK constants
├── dist/                  # Compiled output
├── examples/
│   ├── node-basic/        # Basic Node.js example
│   ├── react-app/         # React integration
│   └── nextjs-app/        # Next.js integration
├── tests/
├── package.json
├── tsconfig.json
└── README.md
```

### Core Components

#### 1. AxonFlow Client
```typescript
class AxonFlow {
  constructor(config: AxonFlowConfig) {
    this.apiKey = config.apiKey;
    this.endpoint = config.endpoint || 'https://api.axonflow.com';
    this.mode = config.mode || 'production';
  }

  async protect<T>(aiCall: () => Promise<T>): Promise<T> {
    // Intercept and govern the AI call
    const request = this.interceptRequest(aiCall);
    const validated = await this.validateWithAgent(request);
    const response = await this.executeCall(validated);
    return this.processResponse(response);
  }
}
```

#### 2. Interceptor Pattern
```typescript
interface Interceptor {
  canHandle(call: any): boolean;
  extractRequest(call: any): Request;
  executeProtected(request: Request): Promise<Response>;
}
```

#### 3. Configuration
```typescript
interface AxonFlowConfig {
  apiKey: string;
  endpoint?: string;
  mode?: 'sandbox' | 'production';
  tenant?: string;
  cache?: CacheConfig;
  debug?: boolean;
}
```

> **A note on HTTP retries.** The SDK does not wrap HTTP calls in an
> internal retry loop. Each outbound request is issued exactly once,
> and `401 Unauthorized` is terminal — the SDK throws
> `AuthenticationError` and does not retry. If you need retries for
> transient infra errors (5xx, network), wrap the SDK call in your
> own retry helper but **do not retry on `AuthenticationError`**. See
> [getaxonflow/axonflow-enterprise#2275](https://github.com/getaxonflow/axonflow-enterprise/issues/2275)
> and the "A note on HTTP retries" callout in the main README.
> `AxonFlowConfig.retry` is preserved as a deprecated, silently-ignored
> field for backward compatibility and will be removed in v10.

## Implementation Plan

### Phase 1: Core SDK (Today)
1. Package setup with TypeScript
2. Basic client with protect() method
3. OpenAI interceptor
4. Simple policy enforcement

### Phase 2: Industry Demo (Today)
1. Travel booking example
2. PII protection demo
3. Cost control policies
4. Audit trail

### Phase 3: Documentation (Today)
1. Quickstart guide
2. API reference
3. Integration examples
4. Troubleshooting

### Phase 4: Testing & Deployment (Tomorrow)
1. Unit tests
2. Integration tests
3. npm publishing
4. Staging deployment

## Success Metrics
- Integration time: <30 minutes
- Code changes: <5 lines
- Performance overhead: <10ms
- Bundle size: <50KB

## Risk Mitigation
- No external dependencies (pure TypeScript)
- Graceful fallback if AxonFlow unavailable
- Clear error messages
- Extensive logging for debugging
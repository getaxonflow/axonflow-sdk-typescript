/**
 * Tests for the AuthZEN-native surface (ADR-065).
 *
 * Every guard in `src/authzen.ts` has a case here that FAILS without it, which
 * is the only thing that makes a guard evidence rather than decoration. The
 * ones that would otherwise be silent are called out in the test's own name or
 * comment.
 *
 * The transport is a recording stub. That is deliberate for this file: what it
 * pins is what the SDK does with a given set of bytes, and it must be able to
 * produce bytes a real server would only emit if it were broken (a decision
 * whose boolean and state disagree, an allow with no profile context). The
 * other half — that a real gateway actually behaves this way — is
 * `runtime-e2e/authzen_evaluation/test.mjs`, which drives a live agent.
 */

import {
  AUTHZEN_PATH,
  AUTHZEN_PROFILE_HEADER,
  assertFullyResolved,
  AUTHZEN_UNKNOWN_RESOLUTION_FAILED,
  AuthZENAttribute,
  AuthZENDecision,
  AuthZENProtocolError,
  AuthZENRefusal,
  AuthZENTransport,
  evaluateEnvelope,
  toWire,
} from '../src/authzen';
import { AuthenticationError, AxonFlowError } from '../src/errors';
import {
  AUTHZEN_PROFILE_V1,
  AuthZENBulk,
  AuthZENEnvelope,
  AuthZENRequest,
} from '../src/types/authzen.gen';

// Aliases kept so the fixtures below read the same as their Python siblings.
type GenRequest = AuthZENRequest;
type GenBulk = AuthZENBulk;

const ALLOW_CONTEXT = {
  profile: AUTHZEN_PROFILE_V1,
  state: 'ALLOW',
  category: 'allowed',
  reason: 'permitted',
  decision_id: 'dec-1',
  schema_version: '2026-08-29',
};
const DENY_CONTEXT = {
  profile: AUTHZEN_PROFILE_V1,
  state: 'DENY',
  category: 'not_permitted',
  reason: 'explicit_constraint',
  decision_id: 'dec-2',
  schema_version: '2026-08-29',
};

interface Call {
  path: string;
  body: unknown;
  headers: Record<string, string>;
}

class Recorder {
  public readonly calls: Call[] = [];
  public readonly send: AuthZENTransport;

  constructor(
    private readonly status: number = 200,
    private readonly body: unknown = { decision: true, context: ALLOW_CONTEXT }
  ) {
    this.send = async (path, body, headers) => {
      this.calls.push({ path, body, headers });
      return {
        status: this.status,
        body: typeof this.body === 'string' ? this.body : JSON.stringify(this.body),
      };
    };
  }

  get sent(): Record<string, any> {
    if (this.calls.length === 0) throw new Error('the transport was never called');
    return this.calls[this.calls.length - 1].body as Record<string, any>;
  }
}

function singular(overrides: Partial<GenRequest> = {}): GenRequest {
  return {
    subject: { type: 'gateway', id: 'llm-gateway-01' },
    action: { name: 'llm.completion' },
    resource: { type: 'llm', id: 'llm' },
    context: { args: { query: "summarise yesterday's incident report" } },
    ...overrides,
  };
}

function evaluate(recorder: Recorder, request: GenRequest): Promise<AuthZENDecision> {
  return evaluateEnvelope(recorder.send, { evaluation: request });
}

async function expectRefusal(promise: Promise<unknown>): Promise<AuthZENRefusal> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof AuthZENRefusal) return err;
    throw err;
  }
  throw new Error('expected an AuthZENRefusal, got a decision');
}

async function expectProtocolError(promise: Promise<unknown>): Promise<AuthZENProtocolError> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof AuthZENProtocolError) return err;
    throw err;
  }
  throw new Error('expected an AuthZENProtocolError, got a decision');
}

// ---------------------------------------------------------------------------
// The tri-state
// ---------------------------------------------------------------------------

describe('the tri-state', () => {
  it('gives known, absent and unknown three different outcomes', async () => {
    // The whole reason the type exists. With `undefined` standing in for "no
    // value", absent and unknown are the same thing and these three cases
    // collapse into two. Asserting all three together is what makes the
    // collapse visible: delete the `absent` branch of resolveValue and the
    // second case starts throwing; delete the `unknown` branch and the third
    // case starts SENDING a request whose attribute nobody resolved.
    const known = new Recorder();
    await evaluate(
      known,
      singular({
        context: {
          args: { query: 'q' },
          correlation: { trace_id: AuthZENAttribute.known('t-1') },
        },
      })
    );
    expect(known.sent.evaluation.context.correlation).toEqual({ trace_id: 't-1' });

    const absent = new Recorder();
    await evaluate(
      absent,
      singular({
        context: {
          args: { query: 'q' },
          correlation: { trace_id: AuthZENAttribute.absent() },
        },
      })
    );
    // The member is GONE, and the request was still sent: absence is resolved
    // data, so there is a question to ask.
    expect(absent.calls).toHaveLength(1);
    expect(absent.sent.evaluation.context.correlation).toEqual({});

    const unknown = new Recorder();
    const refusal = await expectRefusal(
      evaluate(
        unknown,
        singular({
          context: {
            args: { query: 'q' },
            correlation: {
              trace_id: AuthZENAttribute.unknown(AUTHZEN_UNKNOWN_RESOLUTION_FAILED),
            },
          },
        })
      )
    );
    expect(unknown.calls).toHaveLength(0);
    expect(refusal.code).toBe('unevaluable_attribute');
    expect(refusal.pointer).toBe('/evaluation/context/correlation/trace_id');
    expect(refusal.refusedBy).toBe('client');
    expect(refusal.message).toContain(AUTHZEN_UNKNOWN_RESOLUTION_FAILED);
  });

  it('separates absent from unknown on a required member too', async () => {
    // An ABSENT query leaves the request evaluable-looking and lets the SERVER
    // answer (it refuses with missing_evaluable_content, a deployment rule the
    // SDK deliberately does not duplicate). An UNKNOWN query is refused here,
    // before anything is sent. Same member, two places, two codes.
    const absent = new Recorder(422, {
      code: 'missing_evaluable_content',
      message: 'the query must be a non-empty string',
      pointer: '/evaluation/context/args/query',
    });
    const fromServer = await expectRefusal(
      evaluate(absent, singular({ context: { args: { query: AuthZENAttribute.absent() } } }))
    );
    expect(absent.calls).toHaveLength(1);
    expect(fromServer.refusedBy).toBe('gateway');
    expect(fromServer.code).toBe('missing_evaluable_content');

    const unknown = new Recorder();
    const fromClient = await expectRefusal(
      evaluate(
        unknown,
        singular({ context: { args: { query: AuthZENAttribute.unknown('resolution_failed') } } })
      )
    );
    expect(unknown.calls).toHaveLength(0);
    expect(fromClient.refusedBy).toBe('client');
    expect(fromClient.code).toBe('unevaluable_attribute');
  });

  it('keeps a known null distinct from absence', async () => {
    // Without the DROP sentinel these are the same value and the first case
    // silently becomes the second — the SDK rewriting a caller's null into a
    // missing member.
    const recorder = new Recorder();
    await evaluate(
      recorder,
      singular({
        context: {
          args: { query: 'q' },
          correlation: {
            explicit_null: AuthZENAttribute.known(null),
            gone: AuthZENAttribute.absent(),
          },
        },
      })
    );
    expect(recorder.sent.evaluation.context.correlation).toEqual({ explicit_null: null });
  });

  it('requires a reason on an unknown attribute', () => {
    expect(() => AuthZENAttribute.unknown('   ')).toThrow(/must name why/);
  });

  it('escapes JSON Pointer metacharacters in a key', async () => {
    // RFC 6901. Without escaping, a key containing "/" produces a pointer that
    // resolves to nothing — on the refusal whose whole value is the pointer.
    const recorder = new Recorder();
    const refusal = await expectRefusal(
      evaluate(
        recorder,
        singular({
          context: {
            args: { query: 'q' },
            correlation: { 'a/b~c': AuthZENAttribute.unknown('stale') },
          },
        })
      )
    );
    expect(refusal.pointer).toBe('/evaluation/context/correlation/a~1b~0c');
  });

  it('resolves attributes inside a properties bag', async () => {
    const recorder = new Recorder();
    const refusal = await expectRefusal(
      evaluate(
        recorder,
        singular({
          subject: {
            type: 'gateway',
            id: 'g1',
            properties: { clearance: AuthZENAttribute.unknown('stale') },
          },
        })
      )
    );
    expect(refusal.pointer).toBe('/evaluation/subject/properties/clearance');
  });

  it("names a plural entry's own pointer", async () => {
    const recorder = new Recorder();
    const bulk: GenBulk = {
      subject: { type: 'gateway', id: 'g1' },
      action: { name: 'tool.call' },
      context: { args: { query: 'q' } },
      evaluations: [
        { resource: { type: 'tool', id: 'jira/move_issue' } },
        {
          resource: { type: 'tool', id: 'jira/update_project' },
          context: { correlation: { k: AuthZENAttribute.unknown('stale') } },
        },
      ],
    };
    const refusal = await expectRefusal(
      evaluateEnvelope(recorder.send, { evaluations: bulk } as AuthZENEnvelope)
    );
    // Entry pointers mirror the server's: the base is /evaluations, its entries
    // live in that object's own `evaluations` array.
    expect(refusal.pointer).toBe('/evaluations/evaluations/1/context/correlation/k');
  });

  it('drops an absent element from a list', async () => {
    const recorder = new Recorder();
    await evaluate(
      recorder,
      singular({
        context: {
          args: { query: 'q' },
          correlation: { tags: [AuthZENAttribute.known('a'), AuthZENAttribute.absent(), 'c'] },
        },
      })
    );
    expect(recorder.sent.evaluation.context.correlation.tags).toEqual(['a', 'c']);
  });

  it('does not cascade absence out of the bag the caller placed', async () => {
    // The bag is the caller's structure; the attributes are the data in it. An
    // SDK that deleted a container the caller wrote would be editing the
    // question rather than resolving the answer.
    const recorder = new Recorder(422, {
      code: 'missing_evaluable_content',
      message: 'nothing to evaluate',
    });
    await expectRefusal(
      evaluate(recorder, singular({ context: { args: { query: AuthZENAttribute.absent() } } }))
    );
    expect(recorder.sent.evaluation.context).toEqual({ args: {} });
  });

  it('drops a conditional member from inside the bag', async () => {
    const recorder = new Recorder();
    await evaluate(
      recorder,
      singular({
        context: { args: { query: 'q' }, correlation: AuthZENAttribute.absent() },
      })
    );
    expect(recorder.sent.evaluation.context).toEqual({ args: { query: 'q' } });
  });

  it('recognises an attribute across a duplicated module copy', () => {
    // A bundler that split this package across two chunks gives two distinct
    // classes, and a bare `instanceof` would then report a resolver's output as
    // ordinary data - serialising the attribute's internal shape onto the wire.
    // The brand is a `Symbol.for` key, so the second copy's attributes still
    // register.
    const fromAnotherCopy = { state: 'absent', value: undefined, reason: '' };
    Object.defineProperty(fromAnotherCopy, Symbol.for('axonflow.authzen.attribute'), {
      value: true,
    });
    expect(AuthZENAttribute.is(fromAnotherCopy)).toBe(true);
  });

  it("does NOT mistake a caller's ordinary data for an attribute", () => {
    // R3 round 1: structural detection - "has state, value and reason" - reads
    // a caller's own bag as a tri-state attribute. That direction is the worse
    // one. Confirmed then: `{"state":"unknown","reason":"n/a"}` arriving from
    // JSON.parse made the SDK REFUSE to send a legitimate request, with a
    // message asserting the caller could not establish a value it had; and
    // `{"state":"absent",…}` silently deleted the member from the wire.
    const lookalike = JSON.parse('{"state":"unknown","value":null,"reason":"n/a"}');
    expect(AuthZENAttribute.is(lookalike)).toBe(false);
    expect(AuthZENAttribute.is({ state: 'absent', value: undefined, reason: '' })).toBe(false);
    expect(AuthZENAttribute.is({ query: 'q' })).toBe(false);
  });

  it('sends a lookalike bag verbatim instead of resolving it', async () => {
    // The end-to-end form of the case above: the caller's data reaches the
    // wire unchanged, and the request is sent.
    const recorder = new Recorder();
    const lookalike = JSON.parse('{"state":"unknown","value":null,"reason":"n/a"}');
    await evaluate(
      recorder,
      singular({ context: { args: { query: 'q' }, correlation: { trace: lookalike } } })
    );
    expect(recorder.calls).toHaveLength(1);
    expect(recorder.sent.evaluation.context.correlation.trace).toEqual(lookalike);
  });

  it('does not silently drop a member the contract does not declare', async () => {
    // "Mapped or refused, never silently ignored" - the surface's own rule,
    // applied client-side. R3 round 1: the resolver whitelist-copied
    // {type, id, properties}, so an invented member was deleted before the
    // validator saw it and the request went out without it and without a
    // refusal. The gateway would have refused it by name; Python already did.
    const recorder = new Recorder();
    const refusal = await expectRefusal(
      evaluate(
        recorder,
        singular({
          subject: { type: 'gateway', id: 'g1', department: 'finance' } as never,
        })
      )
    );
    expect(recorder.calls).toHaveLength(0);
    expect(refusal.code).toBe('malformed_envelope');
    expect(refusal.message).toContain('department');
  });

  it('does not silently drop a __proto__ member from a context bag', async () => {
    // `JSON.parse` produces `__proto__` as an ordinary own property, and a
    // plain `out[key] = …` assignment invokes the inherited setter instead of
    // creating a member - so the member VANISHED with no refusal. It now
    // reaches the wire, where the gateway refuses it by name.
    const recorder = new Recorder(422, {
      code: 'unevaluable_attribute',
      pointer: '/evaluation/context/__proto__',
      message: 'this surface cannot evaluate the context member "__proto__"',
    });
    const context = JSON.parse('{"args":{"query":"q"},"__proto__":{"polluted":true}}');
    const refusal = await expectRefusal(evaluate(recorder, singular({ context })));
    expect(recorder.calls).toHaveLength(1);
    expect(Object.keys(recorder.sent.evaluation.context)).toContain('__proto__');
    expect(refusal.refusedBy).toBe('gateway');
    // The control: nothing was polluted on the way through.
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Round trips
// ---------------------------------------------------------------------------

describe('round trips', () => {
  it('round-trips a request through JSON', () => {
    const envelope: AuthZENEnvelope = { evaluation: singular() };
    const wire = toWire(envelope);
    expect(JSON.parse(JSON.stringify(wire))).toEqual(wire);
  });

  it('refuses an unknown member in a response rather than dropping it', async () => {
    // Without the generated validator a TypeScript cast accepts this: the
    // interface is erased at runtime, and the SDK acts on a partial reading of
    // an authorization decision.
    const recorder = new Recorder(200, {
      decision: true,
      context: ALLOW_CONTEXT,
      escalation: 'x',
    });
    const err = await expectProtocolError(evaluate(recorder, singular()));
    expect(err.message).toContain('escalation');
  });

  it('refuses an unknown member nested in the response context', async () => {
    const recorder = new Recorder(200, {
      decision: true,
      context: { ...ALLOW_CONTEXT, hint: 'x' },
    });
    const err = await expectProtocolError(evaluate(recorder, singular()));
    expect(err.message).toContain('hint');
  });
});

// ---------------------------------------------------------------------------
// The response direction
// ---------------------------------------------------------------------------

describe('what may be read as an allow', () => {
  it('refuses a 200 with no profile context', async () => {
    // The SDK always negotiates, so a context-less 200 means the gateway did
    // not honour it. Without this guard the response decodes cleanly, decision
    // is true, obligations is an empty array indistinguishable from "no
    // obligations", and the caller proceeds on an allow whose mandatory
    // redaction it never saw.
    const recorder = new Recorder(200, { decision: true });
    const err = await expectProtocolError(evaluate(recorder, singular()));
    expect(err.message).toContain('without the profile context');
  });

  it('refuses a profile this build cannot read, with the actionable message', async () => {
    const recorder = new Recorder(200, {
      decision: true,
      context: { ...ALLOW_CONTEXT, profile: 'profile-2099-01-01' },
    });
    const err = await expectProtocolError(evaluate(recorder, singular()));
    expect(err.message).toContain('profile-2099-01-01');
    // R3 round 1: the generated `const` check fired first, so the HAND-WRITTEN
    // refusal was dead code and this test passed on the generated message -
    // which contains the profile string too. The guidance is the point at the
    // v11 cutover, so the test now pins the branch it names.
    expect(err.message).toContain('Upgrade the SDK.');
  });

  it('refuses a state this build does not know', async () => {
    const recorder = new Recorder(200, {
      decision: false,
      context: { ...DENY_CONTEXT, state: 'QUARANTINE' },
    });
    const err = await expectProtocolError(evaluate(recorder, singular()));
    expect(err.message).toContain('QUARANTINE');
  });

  // Both directions. A `true` boolean beside a DENY state is the dangerous one;
  // a `false` boolean beside ALLOW is the mirror, and a check written only
  // against the first would pass it.
  it.each([
    [true, 'DENY'],
    [true, 'CHALLENGE'],
    [true, 'ERROR'],
    [false, 'ALLOW'],
  ])('refuses decision=%s beside state=%s', async (decision, state) => {
    const recorder = new Recorder(200, {
      decision,
      context: { ...ALLOW_CONTEXT, state },
    });
    const err = await expectProtocolError(evaluate(recorder, singular()));
    expect(err.message).toContain('disagree');
  });

  it('refuses obligations attached to a refusal', async () => {
    // Obligations ride only on an executable decision. Attaching them to a
    // denial invites an enforcement point to discharge them and proceed.
    const recorder = new Recorder(200, {
      decision: false,
      context: {
        ...DENY_CONTEXT,
        obligations: [
          {
            type: 'field_redact',
            target: 'args.query',
            mandatory: true,
            source_policy: 'legacy:redact_pii',
            schema_version: 1,
          },
        ],
      },
    });
    const err = await expectProtocolError(evaluate(recorder, singular()));
    expect(err.message).toContain('attached obligations to a DENY');
  });

  it('refuses a body that is not JSON', async () => {
    const recorder = new Recorder(200, '<html>gateway timeout</html>');
    const err = await expectProtocolError(evaluate(recorder, singular()));
    expect(err.message).toContain('could not be decoded');
  });

  it('returns a decision on the happy path', async () => {
    const decision = await evaluate(new Recorder(), singular());
    expect(decision.allowed).toBe(true);
    expect(decision.state).toBe('ALLOW');
    expect(decision.decisionId).toBe('dec-1');
    expect(decision.reason).toBe('permitted');
    expect(decision.category).toBe('allowed');
    expect(decision.obligations).toEqual([]);
    expect(decision.mandatoryObligations).toEqual([]);
    expect(decision.approval).toBeUndefined();
  });

  it('treats a denial as a decision, not an error', async () => {
    const recorder = new Recorder(200, { decision: false, context: DENY_CONTEXT });
    const decision = await evaluate(recorder, singular());
    expect(decision.allowed).toBe(false);
    expect(decision.state).toBe('DENY');
  });

  it('separates mandatory obligations from advisory ones', async () => {
    const recorder = new Recorder(200, {
      decision: true,
      context: {
        ...ALLOW_CONTEXT,
        obligations: [
          {
            type: 'field_redact',
            target: 'args.query',
            mandatory: true,
            source_policy: 'legacy:redact_pii',
            schema_version: 1,
          },
          {
            type: 'notification',
            target: 'ops',
            mandatory: false,
            source_policy: 'p2',
            schema_version: 1,
          },
        ],
      },
    });
    const decision = await evaluate(recorder, singular());
    expect(decision.obligations).toHaveLength(2);
    expect(decision.mandatoryObligations.map(o => o.type)).toEqual(['field_redact']);
  });
});

describe('allowed is not a bare boolean', () => {
  it('requires the operational state', () => {
    // Constructed by hand, because `evaluate` refuses this body before it can
    // be built. This is the guard test: with `return this.decision === true`
    // alone — which is what AuthZEN 1.0's boolean invites — a decision carrying
    // DENY reads as permission.
    const decision = new AuthZENDecision({
      decision: true,
      context: { ...ALLOW_CONTEXT, state: 'DENY' } as any,
    });
    expect(decision.allowed).toBe(false);
  });

  it('is false without a context', () => {
    const decision = new AuthZENDecision({ decision: true });
    expect(decision.allowed).toBe(false);
    expect(decision.state).toBe('ERROR');
  });
});

// ---------------------------------------------------------------------------
// Refusals and their classification
// ---------------------------------------------------------------------------

describe('refusal classification', () => {
  it('turns a structured refusal into a typed error', async () => {
    const recorder = new Recorder(422, {
      code: 'unevaluable_attribute',
      pointer: '/evaluation/subject/properties',
      message: 'this surface cannot evaluate caller-supplied properties',
      supported: ['args', 'correlation'],
      request_id: 'req-9',
    });
    const refusal = await expectRefusal(evaluate(recorder, singular()));
    expect(refusal.code).toBe('unevaluable_attribute');
    expect(refusal.pointer).toBe('/evaluation/subject/properties');
    expect(refusal.supported).toEqual(['args', 'correlation']);
    expect(refusal.requestId).toBe('req-9');
    expect(refusal.refusedBy).toBe('gateway');
    expect(refusal.retryable).toBe(false);
  });

  it('marks only a gateway dependency failure retryable', async () => {
    const recorder = new Recorder(502, {
      code: 'evaluation_unavailable',
      message: 'the evaluator did not answer',
    });
    const refusal = await expectRefusal(evaluate(recorder, singular()));
    expect(refusal.retryable).toBe(true);
  });

  it('never marks a client refusal retryable', () => {
    // Even were a client-side refusal ever given the retryable CODE.
    // Retryability read off the code alone would tell a caller to retry an
    // attribute its own resolver failed to produce — a loop with no exit.
    const refusal = new AuthZENRefusal('evaluation_unavailable', 'unresolved locally', {
      refusedBy: 'client',
    });
    expect(refusal.retryable).toBe(false);
  });

  it('surfaces a 401 as an authentication error, not a refusal', async () => {
    // The gateway answers authentication before the route runs, so a 401 never
    // carries an AuthZEN refusal document. Surfacing it as this client's
    // existing AuthenticationError keeps one error for "your credentials are
    // wrong" across every method.
    const recorder = new Recorder(401, { error: { code: 401, message: 'Invalid credentials' } });
    await expect(evaluate(recorder, singular())).rejects.toBeInstanceOf(AuthenticationError);
  });

  it('does not read a non-refusal error body as a decision', async () => {
    const recorder = new Recorder(500, { error: 'boom' });
    await expect(evaluate(recorder, singular())).rejects.toThrow(/HTTP 500/);
    await expect(evaluate(recorder, singular())).rejects.toBeInstanceOf(AxonFlowError);
    await expect(evaluate(recorder, singular())).rejects.not.toBeInstanceOf(AuthZENRefusal);
  });
});

// ---------------------------------------------------------------------------
// Envelope shape
// ---------------------------------------------------------------------------

describe('the envelope', () => {
  it('negotiates the profile on every request', async () => {
    const recorder = new Recorder();
    await evaluate(recorder, singular());
    expect(recorder.calls[0].headers[AUTHZEN_PROFILE_HEADER]).toBe(AUTHZEN_PROFILE_V1);
  });

  it('posts to the route the gateway registers', async () => {
    const recorder = new Recorder();
    await evaluate(recorder, singular());
    expect(recorder.calls[0].path).toBe(AUTHZEN_PATH);
  });

  it('returns one decision for a bulk envelope, not a list', async () => {
    const recorder = new Recorder(200, { decision: false, context: DENY_CONTEXT });
    const decision = await evaluateEnvelope(recorder.send, {
      evaluations: {
        subject: { type: 'gateway', id: 'g1' },
        action: { name: 'tool.call' },
        context: { args: { query: 'q' } },
        evaluations: [
          { resource: { type: 'tool', id: 'jira/a' } },
          { resource: { type: 'tool', id: 'jira/b' } },
        ],
      },
    });
    expect(decision).toBeInstanceOf(AuthZENDecision);
    expect(decision.allowed).toBe(false);
  });

  it('refuses an envelope naming both members', async () => {
    const recorder = new Recorder();
    const refusal = await expectRefusal(
      evaluateEnvelope(recorder.send, {
        evaluation: singular(),
        evaluations: { evaluations: [singular()] } as AuthZENBulk,
      })
    );
    expect(recorder.calls).toHaveLength(0);
    expect(refusal.message).toContain('exactly one of evaluation or evaluations');
  });

  it('refuses an envelope naming neither member', async () => {
    const recorder = new Recorder();
    const refusal = await expectRefusal(evaluateEnvelope(recorder.send, {}));
    expect(recorder.calls).toHaveLength(0);
    expect(refusal.code).toBe('malformed_envelope');
  });

  it('refuses a bulk with no entries', async () => {
    const recorder = new Recorder();
    const refusal = await expectRefusal(
      evaluateEnvelope(recorder.send, { evaluations: { evaluations: [] } })
    );
    expect(recorder.calls).toHaveLength(0);
    expect(refusal.message).toContain('at least 1 entry');
  });

  it('refuses an explicit null where the singular member needs a subject', async () => {
    // The write-back case: without it the child validator strips the null from
    // a copy that is discarded, and the envelope's own "has no subject" check
    // then asks `=== undefined` of a member that is still null.
    const recorder = new Recorder();
    const refusal = await expectRefusal(
      evaluateEnvelope(recorder.send, {
        evaluation: { ...singular(), subject: null } as unknown as AuthZENRequest,
      })
    );
    expect(recorder.calls).toHaveLength(0);
    expect(refusal.code).toBe('incomplete_evaluation');
  });

  it('refuses an incomplete plural entry before the round trip', async () => {
    // A plural entry may omit what the base supplies — but not what NOBODY
    // supplies. Without checkEnvelopeComplete this reaches the server and comes
    // back as a 422 the caller has to map onto its own request.
    const recorder = new Recorder();
    const refusal = await expectRefusal(
      evaluateEnvelope(recorder.send, {
        evaluations: {
          subject: { type: 'gateway', id: 'g1' },
          context: { args: { query: 'q' } },
          evaluations: [{ resource: { type: 'tool', id: 'jira/a' } }],
        },
      })
    );
    expect(recorder.calls).toHaveLength(0);
    expect(refusal.code).toBe('incomplete_evaluation');
    expect(refusal.pointer).toBe('/evaluations/evaluations/0');
    expect(refusal.message).toContain('action');
  });

  it('accepts a plural entry that inherits the base', async () => {
    // The control for the test above: without it, a completeness check that
    // refused every entry would look equally green.
    const recorder = new Recorder();
    await evaluateEnvelope(recorder.send, {
      evaluations: {
        subject: { type: 'gateway', id: 'g1' },
        action: { name: 'tool.call' },
        context: { args: { query: 'q' } },
        evaluations: [{ resource: { type: 'tool', id: 'jira/a' } }],
      },
    });
    expect(recorder.calls).toHaveLength(1);
  });

  it('refuses a blank subject id before the round trip', async () => {
    const recorder = new Recorder();
    const refusal = await expectRefusal(
      evaluate(recorder, singular({ subject: { type: 'gateway', id: '   ' } }))
    );
    expect(recorder.calls).toHaveLength(0);
    expect(refusal.pointer).toBe('/evaluation/subject/id');
  });

  it('does not second-guess the deployment', async () => {
    // An action name this SDK has never heard of is SENT, not refused. Which
    // actions are evaluable is deployment state the SDK does not have; a client
    // that guessed would refuse requests a newer gateway accepts, and the
    // caller could not tell an out-of-date SDK from a wrong request.
    const recorder = new Recorder();
    await evaluate(recorder, singular({ action: { name: 'warehouse.pick' } }));
    expect(recorder.calls).toHaveLength(1);
    expect(recorder.sent.evaluation.action.name).toBe('warehouse.pick');
  });
});

// ---------------------------------------------------------------------------
// The generated validators, on the shapes only a CHALLENGE decision carries
// ---------------------------------------------------------------------------

describe('the generated validators', () => {
  // These types — the approval requirement, its clauses and their identifiers,
  // and an obligation's string-map params — appear only on responses the fixtures
  // above never produce. They are the deepest part of the contract and the part a
  // caller acts on under the most pressure (a human approval is pending), so they
  // get their own cases rather than being left to whichever fixture happens to
  // reach them.

  const APPROVAL = {
    all_of: [
      {
        quorum: 2,
        eligible: [
          { kind: 'principal', type: 'user', local: 'alice', qualifier: 'corp' },
          { kind: 'group', type: 'team', local: 'risk' },
        ],
      },
    ],
    separation_of_duties: true,
    expires_at: '2026-09-02T00:00:00Z',
  };

  it('accepts a CHALLENGE decision carrying an approval requirement', async () => {
    const recorder = new Recorder(200, {
      decision: false,
      context: {
        ...DENY_CONTEXT,
        state: 'CHALLENGE',
        category: 'approval_required',
        reason: 'approval_required',
        approval: APPROVAL,
      },
    });
    const decision = await evaluate(recorder, singular());
    expect(decision.allowed).toBe(false);
    expect(decision.state).toBe('CHALLENGE');
    expect(decision.approval?.all_of[0].quorum).toBe(2);
    expect(decision.approval?.all_of[0].eligible.map(i => i.local)).toEqual(['alice', 'risk']);
    // An optional member the server omitted must not be invented.
    expect(decision.approval?.all_of[0].eligible[1].qualifier).toBeUndefined();
  });

  it('refuses an approval clause with an empty eligible set', async () => {
    // min_items on a nested array. A quorum drawn from nobody is a challenge no
    // one can satisfy, which a Policy Enforcement Point would sit on forever.
    const recorder = new Recorder(200, {
      decision: false,
      context: {
        ...DENY_CONTEXT,
        state: 'CHALLENGE',
        approval: { ...APPROVAL, all_of: [{ quorum: 1, eligible: [] }] },
      },
    });
    const err = await expectProtocolError(evaluate(recorder, singular()));
    expect(err.message).toContain('needs at least 1 entry');
  });

  it('refuses a fractional integer where the contract declares an int', async () => {
    // `authzenInteger`, not `typeof === "number"`. A fractional schema_version
    // is not a schema_version, and accepting one would let a caller branch on a
    // version that cannot exist.
    const recorder = new Recorder(200, {
      decision: true,
      context: {
        ...ALLOW_CONTEXT,
        obligations: [
          {
            type: 'field_redact',
            target: 'args.query',
            mandatory: true,
            source_policy: 'legacy:redact_pii',
            schema_version: 1.5,
          },
        ],
      },
    });
    const err = await expectProtocolError(evaluate(recorder, singular()));
    expect(err.message).toContain('must be an integer');
  });

  it("carries an obligation's fulfillment params through as strings", async () => {
    const recorder = new Recorder(200, {
      decision: true,
      context: {
        ...ALLOW_CONTEXT,
        obligations: [
          {
            type: 'field_redact',
            target: 'args.query',
            params: {
              fulfillment_endpoint: '/api/v1/mcp/check-input',
              fulfillment_method: 'POST',
              fulfillment_phase: 'request',
            },
            mandatory: true,
            source_policy: 'legacy:redact_pii',
            schema_version: 1,
          },
        ],
      },
    });
    const decision = await evaluate(recorder, singular());
    expect(decision.mandatoryObligations[0].params?.fulfillment_method).toBe('POST');
  });

  it('refuses a non-string value in a declared string map', async () => {
    const recorder = new Recorder(200, {
      decision: true,
      context: {
        ...ALLOW_CONTEXT,
        obligations: [
          {
            type: 'field_redact',
            target: 'args.query',
            params: { fulfillment_method: 42 },
            mandatory: true,
            source_policy: 'p',
            schema_version: 1,
          },
        ],
      },
    });
    const err = await expectProtocolError(evaluate(recorder, singular()));
    expect(err.message).toContain('must be a string');
  });

  it('refuses an optional member that is present but blank', async () => {
    // min_length on an OPTIONAL member is the case a required-only check misses
    // entirely: `target` may be omitted, but a blank one names no field, and the
    // enforcement point would redact nothing while reporting that it had.
    const recorder = new Recorder(200, {
      decision: true,
      context: {
        ...ALLOW_CONTEXT,
        obligations: [
          {
            type: 'field_redact',
            target: '',
            mandatory: true,
            source_policy: 'p',
            schema_version: 1,
          },
        ],
      },
    });
    const err = await expectProtocolError(evaluate(recorder, singular()));
    expect(err.message).toContain('present but too short');
  });
});

// ---------------------------------------------------------------------------
// Regression cases from the R3 review
// ---------------------------------------------------------------------------

describe('the belt against an unresolved attribute', () => {
  // TypeScript had no equivalent of Python's belt at all, and Python's could
  // never fire (it ran after serialisation). Both now run on the structure,
  // before anything is encoded.

  it('fires on an attribute the resolver did not visit', () => {
    // Reaching past resolution is the only way to produce the state the belt
    // exists for: on today's contract the resolver's bag coverage is total.
    const resolved: any = toWire({ evaluation: singular() });
    resolved.evaluation.context.smuggled = AuthZENAttribute.unknown('stale');
    expect(() => assertFullyResolved(resolved)).toThrow(/unresolved AuthZENAttribute/);
  });

  it('names the member it found', () => {
    const resolved: any = toWire({ evaluation: singular() });
    resolved.evaluation.context.args.smuggled = AuthZENAttribute.absent();
    expect(() => assertFullyResolved(resolved)).toThrow(/\/evaluation\/context\/args\/smuggled/);
  });

  it('passes a fully resolved envelope', () => {
    // The control: a belt that threw on everything would look as green.
    expect(() => assertFullyResolved(toWire({ evaluation: singular() }))).not.toThrow();
  });
});

describe('cyclic input', () => {
  it('is a typed refusal, not a RangeError', async () => {
    // A caller that builds a cycle gets the same typed refusal every other
    // malformed bag gets, rather than an error type nothing documents and no
    // enforcement point catches.
    const cycle: Record<string, unknown> = { query: 'q' };
    cycle.self = cycle;
    const recorder = new Recorder();
    const refusal = await expectRefusal(evaluate(recorder, singular({ context: { args: cycle } })));
    expect(recorder.calls).toHaveLength(0);
    expect(refusal.code).toBe('unevaluable_attribute');
    expect(refusal.message).toContain('nests deeper');
  });
});

describe('refusal decoding is forward-compatible', () => {
  // R3 round 1: strict decoding of the REFUSAL envelope is a trap. Strictness on
  // a DECISION is a safety control - an unread member may be the one that
  // constrains an allow. A refusal constrains nothing, so the same strictness
  // buys no safety and costs the caller the typed refusal itself.

  it('keeps the typed refusal when the server adds a member', async () => {
    const recorder = new Recorder(502, {
      code: 'evaluation_unavailable',
      message: 'the evaluator did not answer',
      pointer: '/evaluation',
      retry_after_seconds: 30, // a member a future gateway might add
    });
    const refusal = await expectRefusal(evaluate(recorder, singular()));
    expect(refusal.code).toBe('evaluation_unavailable');
    expect(refusal.pointer).toBe('/evaluation');
    expect(refusal.retryable).toBe(true);
  });

  it('does not invent a refusal from a body that carries no code', async () => {
    // The control. Leniency must not fabricate a refusal the server never made.
    const recorder = new Recorder(500, { detail: 'boom' });
    await expect(evaluate(recorder, singular())).rejects.not.toBeInstanceOf(AuthZENRefusal);
  });
});

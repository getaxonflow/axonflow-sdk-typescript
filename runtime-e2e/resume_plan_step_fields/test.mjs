// runtime-e2e/resume_plan_step_fields/test.mjs
// Real-stack assertion: resumePlan surfaces the step/confirm-mode HITL fields
// the orchestrator emits when it gates the next step (step_result, next_step,
// next_step_name, total_steps) plus workflow_id on every resume path and
// message on terminal paths. Pre-fix, the transformer dropped all of them and
// the ResumePlanResponse doc marked them "never populated".
// Per CLAUDE.md HARD RULE #0 — this test MUST hit a real agent, no mocks.
//
// Drives the real confirm-mode loop end-to-end:
//   generatePlan(executionMode: 'confirm') → executePlan (WCP gates step 0,
//   awaiting_approval) → resumePlan(approved) per step → terminal resume.
//
// Requires an Enterprise stack (confirm/step mode is license-gated).
// Run (after `source /tmp/axonflow-e2e-env.sh` from the enterprise setup
// script; npm run build first):
//
//   AXONFLOW_AGENT_URL=http://localhost:8080 node runtime-e2e/resume_plan_step_fields/test.mjs

import { AxonFlow } from '../../dist/esm/index.js';

const endpoint = process.env.AXONFLOW_AGENT_URL || 'http://localhost:8080';
const clientId = process.env.AXONFLOW_CLIENT_ID;
const clientSecret = process.env.AXONFLOW_CLIENT_SECRET;
const userToken = process.env.AXONFLOW_USER_TOKEN || '';
if (!clientId || !clientSecret) {
  console.error('AXONFLOW_CLIENT_ID + AXONFLOW_CLIENT_SECRET must be set; see ../README.md');
  process.exit(2);
}

const client = new AxonFlow({ clientId, clientSecret, endpoint, timeout: 120000 });

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} [${name}] ${detail}`);
  if (!ok) failures++;
};

try {
  // 1. Generate a multi-step plan in confirm mode (every step gated).
  const plan = await client.generatePlan(
    'Plan a two-step research task: gather sources, then summarize findings',
    'research',
    userToken,
    { executionMode: 'confirm' }
  );
  check('generate-plan-confirm-mode', Boolean(plan.planId), `planId=${plan.planId}`);

  // 2. Execute — confirm mode gates the first step instead of running it.
  const exec = await client.executePlan(plan.planId, userToken);
  check(
    'execute-plan-awaiting-approval',
    exec.status === 'awaiting_approval',
    `status=${exec.status}`
  );

  // 3. Resume loop. Every non-terminal resume must carry ALL step-mode HITL
  //    fields; the terminal resume must carry workflowId + message and none
  //    of the step-gating fields.
  let sawStepGate = false;
  let resume = null;
  for (let i = 0; i < 25; i++) {
    resume = await client.resumePlan(plan.planId, true);
    if (resume.status !== 'awaiting_approval') {
      break;
    }
    sawStepGate = true;
    check(
      `step-gate-${i}-workflow-id`,
      typeof resume.workflowId === 'string' && resume.workflowId.length > 0,
      `workflowId=${resume.workflowId}`
    );
    check(
      `step-gate-${i}-step-result`,
      resume.stepResult !== undefined && resume.stepResult !== null,
      `stepResult=${JSON.stringify(resume.stepResult).slice(0, 80)}`
    );
    check(
      `step-gate-${i}-next-step`,
      Number.isInteger(resume.nextStep),
      `nextStep=${resume.nextStep}`
    );
    check(
      `step-gate-${i}-next-step-name`,
      typeof resume.nextStepName === 'string' && resume.nextStepName.length > 0,
      `nextStepName=${resume.nextStepName}`
    );
    check(
      `step-gate-${i}-total-steps`,
      Number.isInteger(resume.totalSteps) && resume.totalSteps >= 2,
      `totalSteps=${resume.totalSteps}`
    );
  }

  // The generated plan must have gated at least one intermediate step —
  // otherwise the step-mode wire path was never exercised.
  check('at-least-one-step-gate', sawStepGate, `finalStatus=${resume?.status}`);

  // 4. Terminal resume: workflow_id + message on the wire, no step gating.
  check('terminal-status-completed', resume?.status === 'completed', `status=${resume?.status}`);
  check(
    'terminal-workflow-id',
    typeof resume?.workflowId === 'string' && resume.workflowId.length > 0,
    `workflowId=${resume?.workflowId}`
  );
  check(
    'terminal-message',
    typeof resume?.message === 'string' && resume.message.length > 0,
    `message=${resume?.message}`
  );
  check(
    'terminal-no-next-step',
    resume?.nextStep === undefined &&
      resume?.nextStepName === undefined &&
      resume?.totalSteps === undefined,
    `nextStep=${resume?.nextStep} nextStepName=${resume?.nextStepName} totalSteps=${resume?.totalSteps}`
  );
} catch (e) {
  check('resume-plan-confirm-loop', false, e.message);
}

if (failures > 0) {
  console.log(`RESULT: FAIL (${failures})`);
  process.exit(1);
}
console.log('RESULT: PASS');

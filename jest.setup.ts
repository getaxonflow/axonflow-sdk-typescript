// Disable telemetry during tests so the test process never accidentally
// fires real pings to checkpoint.getaxonflow.com — referenced from
// jest.config.js's setupFiles (runs once per test worker, before any test
// file is loaded). Tests that want to exercise the gate clear the env via
// `delete process.env.AXONFLOW_TELEMETRY` (or assignment of '') in their
// own beforeEach. v8.0: this env var is the SOLE telemetry opt-out.
process.env.AXONFLOW_TELEMETRY = 'off';

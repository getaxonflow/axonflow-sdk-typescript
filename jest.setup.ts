// Disable telemetry during tests to prevent sendTelemetryPing from
// interfering with fetch mocks in unrelated test files.
process.env.AXONFLOW_TELEMETRY = 'off';

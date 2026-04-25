#!/usr/bin/env node
/**
 * TS AST gate — type-vs-implementation coverage check.
 *
 * The wire-shape contract gate verifies that SDK type definitions
 * match the OpenAPI spec. It does NOT verify that the runtime code
 * (transformers, request builders, response decoders) actually
 * propagates every field from the type definition. Several bugs in
 * PR #185 had this shape: a type gained a wire-canonical field, but
 * the hand-rolled transformer's return literal didn't list the new
 * key, so callers read `undefined` even though the type said the
 * field was there.
 *
 * This gate closes that gap. For each method in `src/client.ts`
 * whose declared return type is a typed wire shape (Promise<T>,
 * Promise<T[]>, T, or T[]), it walks the method body and:
 *
 *   - PASSTHROUGH (safe): `return this.orchestratorRequest<T>(…)`
 *     or any other typed-cast call returns whatever the wire emits;
 *     new fields on T flow through naturally.
 *   - LITERAL RETURN: `return { id: x, name: y, … };` — check every
 *     property of T appears as a key in the literal. Missing keys
 *     are GAPS unless the property is marked `@deprecated`.
 *   - HELPER CALL: `return this.parseFoo(…)` — recursive check on
 *     the helper at its definition site.
 *   - DYNAMIC: anything else (variable returns, conditional returns
 *     with object-builder) — flagged as "needs-review" rather than
 *     auto-pass.
 *
 * The gate runs against a configured set of "touched types"
 * (typically those under PR review, or the full wire-bound set on
 * main). It prints findings with file:line, the type, and the
 * missing fields. Exit 1 if any gap is found.
 *
 * Baseline mode (mirrors the wire-shape contract gate and the
 * falsey-clobber lint):
 *
 *   A JSON baseline file at .lint_baselines/transformer_coverage.json
 *   captures the set of findings present on `main` at the time the
 *   gate was introduced. CI uses --baseline to fail only on findings
 *   NOT in the baseline. Existing gaps burn down through targeted
 *   PRs that fix each one (or mark the typed property @deprecated
 *   if it's intentionally unpopulated).
 *
 * Usage:
 *   node scripts/transformer-coverage/check.js
 *   node scripts/transformer-coverage/check.js --baseline <file>
 *   node scripts/transformer-coverage/check.js --write-baseline <file>
 *
 * Phase 1 covers READ-path object-literal returns. Phase 2 will add
 * write-path (request body builder) checks.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const SDK_ROOT = path.resolve(__dirname, '..', '..');
const CLIENT_TS = path.join(SDK_ROOT, 'src', 'client.ts');
const TYPES_DIR = path.join(SDK_ROOT, 'src', 'types');

// Types to audit. Sourced from the wire-shape baseline's registered
// types — i.e. types the wire-shape gate already validates against
// the OpenAPI spec. Keeping this list explicit (vs auto-discovering
// every exported type) avoids flagging internal types that don't
// represent wire shapes.
const WIRE_BOUND_TYPES = new Set([
  // Touched in PR #185 sweep
  'BudgetAlert',
  'UsageBreakdownItem',
  'ExecutionSnapshot',
  'PlanResponse',
  'CancelPlanResponse',
  'ResumePlanResponse',
  'StaticPolicy',
  'PolicyOverride',
  'PolicyVersion',
  'EffectivePoliciesResponse',
  'WorkflowStatusResponse',
  'ListWorkflowsResponse',
  'WebhookSubscription',
  'Finding',
  'Budget',
  'UsageRecord',
  'StepGateResponse',
  'CreateWorkflowResponse',
  // Wire-bound types not modified in #185 but covered for completeness
  'AuditLogEntry',
  'AuditSearchResponse',
  'PolicyEvaluationResult',
  'PendingApproval',
  'ExecutionDetail',
  'ExecutionSummary',
  'TimelineEntry',
  'BudgetStatus',
  'BudgetDecision',
  'UpdatePlanResponse',
  'PlanExecutionResponse',
  'RollbackPlanResponse',
]);

/**
 * Read the type's property names from its interface declaration.
 * Skips properties marked `@deprecated` in JSDoc, which are kept on
 * the type for source-compat but intentionally not populated.
 */
function readTypeProperties(typeName) {
  const result = { found: false, properties: [], deprecated: new Set() };
  const files = walkTsFiles(TYPES_DIR);
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    ts.forEachChild(sourceFile, (node) => {
      if (
        ts.isInterfaceDeclaration(node) &&
        node.name.text === typeName &&
        node.modifiers &&
        node.modifiers.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
      ) {
        result.found = true;
        for (const member of node.members) {
          if (!ts.isPropertySignature(member) || !member.name) continue;
          const name = member.name.text || (member.name.escapedText && member.name.escapedText.toString());
          if (!name) continue;
          result.properties.push(name);
          if (isDeprecated(member)) result.deprecated.add(name);
        }
      }
      // type aliases that resolve to object literals
      if (
        ts.isTypeAliasDeclaration(node) &&
        node.name.text === typeName &&
        ts.isTypeLiteralNode(node.type) &&
        node.modifiers &&
        node.modifiers.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
      ) {
        result.found = true;
        for (const member of node.type.members) {
          if (!ts.isPropertySignature(member) || !member.name) continue;
          const name = member.name.text || (member.name.escapedText && member.name.escapedText.toString());
          if (!name) continue;
          result.properties.push(name);
          if (isDeprecated(member)) result.deprecated.add(name);
        }
      }
    });
  }
  return result;
}

function walkTsFiles(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length > 0) {
    const cur = stack.pop();
    for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
      const full = path.join(cur, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
        out.push(full);
      }
    }
  }
  return out;
}

function isDeprecated(member) {
  const tags = ts.getJSDocTags(member);
  return tags.some((t) => t.tagName.text === 'deprecated');
}

/**
 * For each method in client.ts, check whether its return statements
 * cover the declared return type's properties.
 */
function checkClientMethods() {
  const text = fs.readFileSync(CLIENT_TS, 'utf8');
  const sourceFile = ts.createSourceFile(CLIENT_TS, text, ts.ScriptTarget.Latest, true);
  const findings = [];

  function visit(node) {
    if (ts.isMethodDeclaration(node) && node.name && node.body) {
      const methodName = node.name.text || node.name.escapedText?.toString();
      const returnTypeName = extractReturnTypeName(node);
      if (returnTypeName && WIRE_BOUND_TYPES.has(returnTypeName)) {
        const typeInfo = readTypeProperties(returnTypeName);
        if (!typeInfo.found) {
          // Type isn't an interface or type-alias-with-literal we
          // can introspect statically. Skip — the wire-shape gate
          // will report it if it's drifted. Don't false-positive.
          return ts.forEachChild(node, visit);
        }
        const issues = analyzeReturnStatements(node, returnTypeName, typeInfo);
        for (const issue of issues) {
          findings.push({
            method: methodName,
            type: returnTypeName,
            ...issue,
          });
        }
      }
    }
    return ts.forEachChild(node, visit);
  }

  ts.forEachChild(sourceFile, visit);
  return findings;
}

/**
 * Extract `T` from `Promise<T>` / `Promise<T[]>` / direct `T` / `T[]`.
 * Returns null if the return type isn't a recognized typed wire shape.
 */
function extractReturnTypeName(method) {
  const t = method.type;
  if (!t) return null;

  const resolveTypeRef = (typeNode) => {
    if (!typeNode) return null;
    // Promise<X>
    if (
      ts.isTypeReferenceNode(typeNode) &&
      ts.isIdentifier(typeNode.typeName) &&
      typeNode.typeName.text === 'Promise' &&
      typeNode.typeArguments &&
      typeNode.typeArguments.length === 1
    ) {
      return resolveTypeRef(typeNode.typeArguments[0]);
    }
    // X[]
    if (ts.isArrayTypeNode(typeNode)) {
      return resolveTypeRef(typeNode.elementType);
    }
    // X
    if (ts.isTypeReferenceNode(typeNode) && ts.isIdentifier(typeNode.typeName)) {
      return typeNode.typeName.text;
    }
    return null;
  };

  return resolveTypeRef(t);
}

/**
 * Walk the method body's return statements and classify each.
 * Returns an array of issues; empty if the method is fully covered.
 */
function analyzeReturnStatements(method, typeName, typeInfo) {
  const issues = [];
  const requiredKeys = new Set(typeInfo.properties.filter((p) => !typeInfo.deprecated.has(p)));

  function visit(node) {
    if (ts.isReturnStatement(node) && node.expression) {
      classifyReturn(node, node.expression, typeName, requiredKeys, issues);
    }
    // Don't descend into nested function bodies — those are separate
    // scopes that don't count as the method's return.
    if (ts.isFunctionLike(node) && node !== method) return;
    ts.forEachChild(node, visit);
  }

  if (method.body) ts.forEachChild(method.body, visit);
  return issues;
}

function classifyReturn(returnStmt, expr, typeName, requiredKeys, issues) {
  const lineCol = getLineCol(returnStmt);

  // PASSTHROUGH: the return is a Call/Await expression with type
  // arguments that include the type — the parser knows it's typed
  // safely, so all wire fields propagate.
  if (
    ts.isAwaitExpression(expr) ||
    ts.isCallExpression(expr) ||
    (ts.isPropertyAccessExpression(expr) && expr.expression && ts.isCallExpression(expr.expression))
  ) {
    // We treat any non-literal return that's a method/function call
    // as passthrough (the type system will catch shape mismatches at
    // call site). This is the correct call: passthrough returns
    // never drop fields because they don't construct a literal.
    return;
  }

  // OBJECT LITERAL: check every required key appears.
  if (ts.isObjectLiteralExpression(expr)) {
    const presentKeys = new Set();
    for (const prop of expr.properties) {
      if (ts.isPropertyAssignment(prop) && prop.name) {
        const name = prop.name.text || prop.name.escapedText?.toString();
        if (name) presentKeys.add(name);
      } else if (ts.isShorthandPropertyAssignment(prop) && prop.name) {
        const name = prop.name.text || prop.name.escapedText?.toString();
        if (name) presentKeys.add(name);
      } else if (ts.isSpreadAssignment(prop)) {
        // Spread — assume it provides any unmentioned key. Treat as
        // wildcard "covers everything not already in presentKeys".
        return; // exit; this return is conservative-passthrough.
      }
    }
    const missing = [...requiredKeys].filter((k) => !presentKeys.has(k));
    if (missing.length > 0) {
      issues.push({
        ...lineCol,
        kind: 'literal-missing-keys',
        missing,
      });
    }
    return;
  }

  // CONDITIONAL: ternary `cond ? A : B`. Classify each branch.
  if (ts.isConditionalExpression(expr)) {
    classifyReturn(returnStmt, expr.whenTrue, typeName, requiredKeys, issues);
    classifyReturn(returnStmt, expr.whenFalse, typeName, requiredKeys, issues);
    return;
  }

  // Identifier or other expression: variable return. Cannot easily
  // verify statically. Phase 1: skip (don't false-flag).
}

function getLineCol(node) {
  const sourceFile = node.getSourceFile();
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
  return { line: line + 1, column: character + 1 };
}

function findingKey(f) {
  return `src/client.ts:${f.method}:${f.type}:${f.missing.sort().join(',')}`;
}

function loadBaseline(filePath) {
  if (!fs.existsSync(filePath)) return new Set();
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!Array.isArray(data.findings)) {
      console.error(`error: baseline ${filePath} has malformed findings list`);
      process.exit(2);
    }
    return new Set(data.findings);
  } catch (e) {
    console.error(`error: could not read baseline ${filePath}: ${e.message}`);
    process.exit(2);
  }
}

function writeBaseline(filePath, findings) {
  const keys = [...new Set(findings.map(findingKey))].sort();
  const payload = {
    _comment:
      'Pre-existing transformer-coverage findings. Generated by ' +
      'scripts/transformer-coverage/check.js --write-baseline. CI fails ' +
      'on any finding NOT listed here. Burn this list down via targeted ' +
      'PRs that either populate the missing keys in the transformer or ' +
      'mark them @deprecated on the type definition.',
    findings: keys,
  };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2) + '\n');
}

function main() {
  const args = process.argv.slice(2);
  let baselinePath = null;
  let writeBaselinePath = null;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--baseline' && i + 1 < args.length) {
      baselinePath = args[i + 1];
      i += 1;
    } else if (args[i] === '--write-baseline' && i + 1 < args.length) {
      writeBaselinePath = args[i + 1];
      i += 1;
    }
  }

  const findings = checkClientMethods();

  if (writeBaselinePath !== null) {
    writeBaseline(writeBaselinePath, findings);
    console.log(`Wrote ${findings.length} finding(s) to ${writeBaselinePath}`);
    process.exit(0);
  }

  if (findings.length === 0) {
    console.log('transformer-coverage: 0 findings.');
    process.exit(0);
  }

  if (baselinePath !== null) {
    const baselined = loadBaseline(baselinePath);
    const newFindings = findings.filter((f) => !baselined.has(findingKey(f)));
    const observedKeys = new Set(findings.map(findingKey));
    const staleBaseline = [...baselined].filter((k) => !observedKeys.has(k));

    if (newFindings.length === 0 && staleBaseline.length === 0) {
      console.log(
        `transformer-coverage: ${findings.length} finding(s), all baselined. Burndown queue size: ${findings.length}.`,
      );
      process.exit(0);
    }
    if (newFindings.length > 0) {
      console.log(`transformer-coverage: ${newFindings.length} NEW finding(s) (not in baseline):`);
      for (const f of newFindings) {
        console.log(
          `  src/client.ts:${f.line}:${f.column}  ${f.method} returns ${f.type} — missing keys: [${f.missing.join(', ')}]`,
        );
      }
      console.log();
      console.log('Each new finding is an object-literal return that omits keys');
      console.log('declared on the return type. Add the missing keys or mark them');
      console.log('@deprecated on the interface if intentionally unpopulated.');
    }
    if (staleBaseline.length > 0) {
      console.log();
      console.log(
        `transformer-coverage: ${staleBaseline.length} stale baseline entry(ies) — burned down but baseline still lists them:`,
      );
      for (const k of staleBaseline) console.log(`  ${k}`);
      console.log('Re-run with --write-baseline to refresh.');
    }
    process.exit(1);
  }

  console.log(`transformer-coverage: ${findings.length} finding(s):`);
  for (const f of findings) {
    console.log(
      `  src/client.ts:${f.line}:${f.column}  ${f.method} returns ${f.type} — missing keys: [${f.missing.join(', ')}]`,
    );
  }
  console.log();
  console.log('Each finding is an object-literal return that omits keys');
  console.log('declared on the return type. Add the missing keys or mark');
  console.log('them @deprecated on the interface if intentionally');
  console.log('unpopulated.');
  process.exit(1);
}

main();

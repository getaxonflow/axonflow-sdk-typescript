# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |

## Reporting a Vulnerability

We take security seriously at AxonFlow. If you discover a security vulnerability, please follow responsible disclosure:

### Do NOT:
- Open a public GitHub issue
- Discuss the vulnerability publicly
- Exploit the vulnerability

### DO:
1. Email: **security@getaxonflow.com**
2. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

### What to Expect:
- **24 hours**: Initial response acknowledging receipt
- **72 hours**: Assessment and severity classification
- **7 days**: Fix timeline and coordinated disclosure plan
- **30 days**: Public disclosure after fix is released

### Severity Levels:
- **Critical**: Remote code execution, authentication bypass
- **High**: Data leakage, privilege escalation
- **Medium**: Denial of service, information disclosure
- **Low**: Minor issues with limited impact

## Security Best Practices

### For SDK Users:
1. **Never hardcode API keys** - use environment variables
2. **Enable 2FA** on your AxonFlow account
3. **Rotate API keys** regularly (quarterly recommended)
4. **Monitor audit logs** for suspicious activity
5. **Keep SDK updated** to latest version

### Example Secure Usage:
```typescript
// ✅ GOOD: Environment variables
const axonflow = new AxonFlow({
  apiKey: process.env.AXONFLOW_API_KEY
});

// ❌ BAD: Hardcoded keys
const axonflow = new AxonFlow({
  apiKey: 'axon_1234567890abcdef'  // Don't do this!
});
```

## Supply Chain Security

### npm Package Verification:
- All releases signed with npm provenance
- Verify package integrity: `npm audit`
- Check package signatures on npmjs.com

### GitHub Security:
- All commits signed (GPG recommended)
- Branch protection enabled on main
- Required PR reviews before merge
- Automated security scanning (Dependabot)

## Vulnerability Disclosure Timeline

We follow a 90-day disclosure timeline:
1. **Day 0**: Vulnerability reported
2. **Day 7**: Fix developed and tested
3. **Day 14**: Fix released in patch version
4. **Day 30**: Public disclosure (if fix is deployed)
5. **Day 90**: Full technical details published (if not disclosed earlier)

## Security Updates

Security patches are released as:
- **Patch versions** (1.0.x): Backward-compatible security fixes
- **Minor versions** (1.x.0): Security + features (if needed)
- **Major versions** (x.0.0): Breaking changes required for security

Subscribe to releases: https://github.com/getaxonflow/axonflow-sdk-typescript/releases

## Hall of Fame

We recognize security researchers who responsibly disclose vulnerabilities:

(No vulnerabilities reported yet - be the first!)

## Contact

- **Security issues**: security@getaxonflow.com
- **General support**: dev@getaxonflow.com
- **GitHub Security Advisories**: https://github.com/getaxonflow/axonflow-sdk-typescript/security/advisories

Thank you for keeping AxonFlow secure!

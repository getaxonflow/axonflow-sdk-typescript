# npm Automation Setup for GitHub Actions

This guide shows how to set up automated npm publishing via GitHub releases.

## Step 1: Create npm Access Token

1. Go to: https://www.npmjs.com/settings/saurabhjain1592/tokens
2. Click **"Generate New Token"**
3. Choose **"Automation"** token type
4. Click **"Generate Token"**
5. **Copy the token immediately** (you won't see it again)

**Token format:** `npm_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

## Step 2: Add Token to GitHub Secrets

1. Go to: https://github.com/getaxonflow/axonflow-sdk-typescript/settings/secrets/actions
2. Click **"New repository secret"**
3. Name: `NPM_TOKEN`
4. Value: (paste your npm token from Step 1)
5. Click **"Add secret"**

## Step 3: Test Automated Publishing

### Publish a Patch Version (v1.0.1)

```bash
cd /Users/saurabhjain/Development/axonflow-sdk-typescript

# Make a small change (e.g., update README)
git add .
git commit -m "docs: Update README"

# Bump version
npm version patch  # 1.0.0 -> 1.0.1

# Push with tags
git push && git push --tags
```

### Create GitHub Release

1. Go to: https://github.com/getaxonflow/axonflow-sdk-typescript/releases/new
2. Tag: Select `v1.0.1` (just created)
3. Title: `v1.0.1`
4. Description: Brief changelog
5. Click **"Publish release"**

GitHub Actions will automatically:
- Run tests
- Build the package
- Publish to npm with provenance
- Takes ~2 minutes

### Verify

Check: https://www.npmjs.com/package/@axonflow/ts-sdk

Should show v1.0.1 with provenance badge.

## Version Bumping Commands

```bash
# Patch: 1.0.0 -> 1.0.1 (bug fixes)
npm version patch

# Minor: 1.0.0 -> 1.1.0 (new features, backward compatible)
npm version minor

# Major: 1.0.0 -> 2.0.0 (breaking changes)
npm version major
```

## Troubleshooting

**Action fails with "401 Unauthorized"**
- NPM_TOKEN is incorrect or expired
- Regenerate token and update GitHub secret

**Action fails with "Cannot publish over existing version"**
- Version wasn't bumped
- Run `npm version patch` before pushing

**Action fails tests**
- Fix tests locally first
- Push passing tests before releasing

## Security Notes

- **Never commit** npm tokens to git
- **Never share** npm tokens in chat/email
- **Rotate tokens** annually for security
- Tokens are in GitHub Secrets (encrypted at rest)

## Manual Publishing (Fallback)

If GitHub Actions fails, you can always publish manually:

```bash
cd /Users/saurabhjain/Development/axonflow-sdk-typescript
npm login
npm publish --access public
```

## Next Steps

After automation is set up:
1. All future releases via GitHub (no manual npm commands)
2. Every release has provenance (supply chain security)
3. Release workflow: code → commit → version bump → push → create release → auto-publish

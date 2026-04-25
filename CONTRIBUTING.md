# Contributing to AxonFlow SDK

Thank you for your interest in contributing to AxonFlow SDK! We welcome contributions from the community.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR-USERNAME/axonflow-sdk-typescript.git`
3. Create a branch: `git checkout -b feature/your-feature-name`
4. Make your changes
5. Run tests: `npm test`
6. Build: `npm run build`
7. Commit your changes (see commit guidelines below)
8. Push to your fork: `git push origin feature/your-feature-name`
9. Open a Pull Request

## Development Setup

```bash
# Install dependencies
npm install

# Run tests in watch mode
npm run dev

# Run tests
npm test

# Build
npm run build
```

## Commit Guidelines

- Use clear, descriptive commit messages
- Follow conventional commits format:
  - `feat: Add new feature`
  - `fix: Fix bug`
  - `docs: Update documentation`
  - `test: Add tests`
  - `refactor: Refactor code`
  - `chore: Update dependencies`

## Code Style

- Follow TypeScript best practices
- Use ESLint and Prettier (if configured)
- Write tests for new features
- Update documentation for API changes

## Pull Request Process

1. Ensure all tests pass
2. Update README.md if needed
3. Update CHANGELOG.md with notable changes
4. Request review from maintainers
5. Address review feedback
6. Squash commits before merging (if requested)

## Baseline burndown policy

Several CI gates use a baseline file to grandfather pre-existing findings — the gate fails on any *new* finding but tolerates the listed ones. Baselines exist to land the gate without a giant cleanup PR; they are not intended to be permanent.

When your PR touches a baselined area (e.g. a method listed in `.lint_baselines/transformer_coverage.json`, or a type in `tests/fixtures/wire-shape-baseline.json`), do one of:

- **Burn it down.** Fix the baselined finding in this PR, remove the entry from the baseline file, and note "burndown: `<entry>`" in the PR description.
- **Justify it.** If the finding can't be fixed in this PR (different scope, blocked on a platform change, etc.), say so in the PR description in one line.

Baseline files in this repo:

- `.lint_baselines/transformer_coverage.json` — TS AST gate (type-vs-implementation)
- `tests/fixtures/wire-shape-baseline.json` — wire-shape contract gate

CI does not block PRs that touch a baselined area without addressing it, but reviewers will ask the burndown-or-justify question.

## Testing

- Write unit tests for all new code
- Maintain test coverage above 80%
- Test edge cases and error conditions
- Add integration tests for complex features

## Documentation

- Update README.md for user-facing changes
- Add JSDoc comments for all public APIs
- Include code examples in documentation
- Keep examples up-to-date

## Questions?

- Open an issue for bugs or feature requests
- Join our Discord community
- Email: hello@getaxonflow.com

## Code of Conduct

Please follow our [Code of Conduct](CODE_OF_CONDUCT.md) in all interactions.

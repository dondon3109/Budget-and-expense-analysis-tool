# Agent guidance

Don prefers complex systems to be implemented as simply as possible. Keep changes scoped, type-safe, and supported by focused tests. Be cautious with destructive actions, keep useful comments current, and treat questions as read-only requests unless Don explicitly asks for implementation.

## Commits and releases

When asked to commit, inspect the actual change and use a Conventional Commit subject:

- `feat(scope): ...` for a new user-facing capability; this triggers a minor release.
- `fix(scope): ...` for a bug fix; this triggers a patch release.
- `feat(scope)!: ...` or a `BREAKING CHANGE:` footer for an incompatible change; this triggers a major release.
- `docs:`, `test:`, `chore:`, `refactor:`, `style:`, `ci:`, and `build:` for non-releasing work of those types.

Use an imperative, concise summary and an optional scope when it adds useful context. Do not label maintenance work as `feat` or `fix` merely to force a release.

Do not manually edit product version numbers during normal development. Semantic-release determines the next Git tag and GitHub Release from commits after CI passes. Android and native mobile package versions remain separate release artifacts and should change only as part of their explicit signed-app release process.

Do not deploy the production Worker or Pages app manually during normal development. The `Production Release` workflow owns D1 migration, Worker deployment, versioned Pages deployment, smoke verification, and semantic-release publication after CI. Manual production commands are emergency recovery operations and must never run concurrently with that workflow.

Make sure that Changelog is always updated after each release.

## Working style

- Do not spawn subagents for work a single agent can complete in one pass.
- If parallel agents are justified, assign non-overlapping file ownership first.
- Prefer focused tests over broad, repetitive regression suites.
- If a request is phrased as a question, answer it without editing files and offer implementation separately.

## Design Preferences

- Prefer not to use gradient coloring on card, floating card and backgrounds

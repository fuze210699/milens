name: "📋 Pull Request"
description: Submit changes to the milens codebase
title: ""
labels: []
assignees: []

body:
  - type: markdown
    attributes:
      value: |
        ## 📋 Pull Request

        <!-- Fill in all sections below. PRs missing required info will be closed. -->

        ## 🎯 Goal
        <!-- What does this PR do? Be specific. -->

        ## 🔗 Issue
        <!-- Link to issue: Fixes #123 or Closes #456 -->

        ## ✅ Changes Made
        <!-- List concrete changes: files edited, functions modified, tests added -->

        ## ⚠️ Breaking Changes
        <!-- **Yes** or **No** — describe if this PR contains breaking changes -->

        ## 🔍 Verification
        <!-- How did you verify the changes work? Which tests ran? -->

        ---

        ## 📋 PR Checklist
        - [ ] Tests added/updated
        - [ ] Docs updated (if needed)
        - [ ] No hardcoded numbers or magic strings
        - [ ] Milens pre-commit check passed
        - [ ] Lint passes: `npm run lint`
        - [ ] Build succeeds: `npm run build`

        > ⚡ Run `milens detect-changes` before committing to see affected symbols and risk scores.
        > 🛡️ Run `milens security scan` to check for security issues in your changes.

  - type: textarea
    id: goal
    attributes:
      label: "Goal"
      placeholder: "What does this PR accomplish..."
    validations:
      required: true

  - type: textarea
    id: changes
    attributes:
      label: "Changes made"
      placeholder: "- Fixed X in src/file.ts:45\n- Added Y to src/file.ts\n- Updated tests for..."
    validations:
      required: true

  - type: textarea
    id: breaking
    attributes:
      label: "Breaking Changes"
      placeholder: "**No** — no breaking changes.\n\nOr: **Yes** — describe the breaking changes..."
    validations:
      required: true

  - type: textarea
    id: verification
    attributes:
      label: "Verification"
      placeholder: "Ran X tests, checked Y manually, CI passed..."
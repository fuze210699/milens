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

        ## ✅ Changes Made
        <!-- List concrete changes: files edited, functions modified, tests added -->

        ## ⚠️ Constraints & Preferences
        <!-- Any architectural decisions, non-functional requirements, things to avoid -->

        ## 📊 Verification
        <!-- How did you verify the changes work? Which tests ran? -->

        ## 🔗 Related Issue
        <!-- Link to issue: Fixes #123 or Closes #456 -->

        ---
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
    id: verification
    attributes:
      label: "Verification"
      placeholder: "Ran X tests, checked Y manually, CI passed..."
# Git Workflow Best Practices

## Overview

This document outlines recommended Git practices for maintaining a clean `main` branch while allowing flexible development on the `development` branch, and preventing accidental commits to protected branches.

## The Problem

When using a squash-merge strategy from `development` to `main`:
- Squashing loses commit history, making it hard to cherry-pick or move commits back
- Accidental commits to `main` are difficult to move to `development`
- If you forget to switch branches, you end up with conflicts and complicated rebases
- Development and main branches can easily diverge

## Core Principle

**Always work on feature branches, never directly on `development` or `main`.**

This single rule eliminates 90% of merge conflicts and branch management issues.

---

## Recommended Workflow: Feature Branch Strategy

### Step-by-Step Process

#### 1. Create a Feature Branch

```bash
git checkout development
git checkout -b feature/task-name
```

Or in one command:
```bash
git checkout -b feature/task-name development
```

**Branch naming conventions:**
- `feature/user-authentication`
- `fix/login-bug`
- `refactor/payment-logic`
- `docs/api-documentation`
- `test/coverage-improvement`

#### 2. Work with Messy Commits

On your feature branch, commits can be anything. Don't worry about perfection:

```bash
git commit -m "WIP: trying approach A"
git commit -m "WIP: approach A doesn't work"
git commit -m "feat: approach B works better"
git commit -m "fix: edge case in approach B"
git commit -m "test: add unit tests"
```

#### 3. Merge into Development

When your feature is ready, merge it into `development`:

```bash
git checkout development
git merge --no-ff feature/task-name
```

The `--no-ff` flag creates a merge commit, preserving the feature branch history.

#### 4. Clean Up Feature Branch

```bash
git branch -d feature/task-name
```

#### 5. Merge to Main (Squash & Clean)

When `development` is ready for production:

```bash
git checkout main
git merge --squash development
git commit -m "feat: descriptive feature message

- Added new API endpoint
- Integrated with blockchain
- Added comprehensive test coverage
- Updated documentation"
```

The squash creates a single clean commit for `main`.

#### 6. Sync Development with Main

Keep development up-to-date:

```bash
git checkout development
git rebase main
```

Or if you prefer merge commits:
```bash
git checkout development
git merge main
```

---

## Why This Works

| Aspect | Benefit |
|--------|---------|
| **Main Branch** | Stays pristine with squashed, descriptive commits |
| **Development Branch** | Can have messy history internally |
| **Feature Branches** | Isolate work and make it easy to move/discard |
| **Cherry-picking** | Easy to move specific commits between branches |
| **History** | Clean on main, flexible on development |
| **Bisecting** | Can search main history for regressions |

---

## Preventing Accidental Main Commits

### Git Hook: Pre-Commit

Create `.git/hooks/pre-commit` to prevent commits to `main`:

```bash
#!/bin/bash

BRANCH=$(git rev-parse --abbrev-ref HEAD)

if [ "$BRANCH" = "main" ]; then
    echo "❌ You're committing directly to main!"
    echo "   Please switch to development or a feature branch:"
    echo ""
    echo "   git checkout development"
    echo "   git checkout -b feature/your-feature-name"
    echo ""
    exit 1
fi

if [ "$BRANCH" = "development" ]; then
    echo "⚠️  You're committing directly to development."
    echo "   Consider using a feature branch instead:"
    echo ""
    echo "   git checkout -b feature/your-feature-name"
    echo ""
fi
```

### Setup Instructions

1. Create the hook file:
```bash
touch .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

2. Add the script above to the file

3. Test it:
```bash
git checkout main
git commit -m "test"  # Should fail
```

### Alternative: Protect Branches at Remote

If using GitHub, GitLab, or Gitea:

1. Go to repository settings
2. Find "Branch Protection" or "Protected Branches"
3. Protect `main` branch:
   - Require pull request reviews (at least 1)
   - Require status checks to pass
   - Dismiss stale pull request approvals
   - Require branches to be up to date before merging

This prevents force-pushing and requires PRs, adding a safety layer.

---

## Alternative Strategies

### Strategy 2: Rebase-Based Workflow

For those who prefer linear history without merge commits:

```bash
# On feature branch
git checkout feature/my-feature
git rebase development  # Stay up-to-date

# When done, rebase development onto your feature
git checkout development
git rebase feature/my-feature

# Merge to main (squash)
git checkout main
git merge --squash development
```

**Pros:** Linear history, cleaner main
**Cons:** Requires more discipline, harder to debug merge conflicts

---

### Strategy 3: Conventional Commits

Use standardized commit messages on all branches:

```bash
# Feature work
git commit -m "feat: add user authentication"
git commit -m "fix: resolve token expiration bug"
git commit -m "test: add auth tests"
git commit -m "docs: update auth README"

# When squashing to main
git commit -m "feat: add user authentication system

- Implemented JWT token generation
- Added login/logout endpoints
- Integrated with Privy wallet
- Added 20+ test cases
- Updated API documentation"
```

**Benefits:**
- Semantic history (searchable and meaningful)
- Auto-generates changelogs
- Clear intent in commit history

**Format:** `<type>: <subject>`
- `feat:` - New feature
- `fix:` - Bug fix
- `test:` - Test additions/changes
- `docs:` - Documentation
- `refactor:` - Code reorganization
- `perf:` - Performance improvements
- `style:` - Formatting only (no logic change)

---

## Complete Workflow Example

Here's a complete workflow for adding a new feature:

```bash
# 1. Start on development
git checkout development
git pull origin development

# 2. Create feature branch
git checkout -b feature/add-withdrawal-limits

# 3. Make changes (messy commits are OK)
git add lib/token-withdrawal/limits.ts
git commit -m "WIP: basic withdrawal limit logic"

git add components/token-withdrawal/LimitCard.tsx
git commit -m "WIP: UI component for limits"

git add pages/api/token/withdraw.ts
git commit -m "fix: add validation for limits"

git add __tests__/unit/token-withdrawal.test.ts
git commit -m "test: add comprehensive limit tests"

# 4. Make sure you're up to date
git fetch origin
git rebase origin/development

# 5. Merge into development
git checkout development
git merge --no-ff feature/add-withdrawal-limits

# 6. Delete feature branch
git branch -d feature/add-withdrawal-limits

# 7. Push to remote
git push origin development

# 8. When ready for production, merge to main
git checkout main
git pull origin main
git merge --squash development

# 9. Write a clean commit message
git commit -m "feat: add configurable withdrawal limits

- Implemented withdrawal limit configuration per user
- Added validation in token withdrawal API
- Created admin UI for limit management
- Added comprehensive test coverage
- Updated documentation with limit configuration guide"

# 10. Push main
git push origin main

# 11. Sync development with main
git checkout development
git rebase main
git push origin development
```

---

## Handling Accidental Main Commits

If you accidentally committed to `main`, here's how to recover:

### Option 1: Move Commits to Feature Branch (Recommended)

```bash
# You're on main with uncommitted changes
git log --oneline -3  # See recent commits

# Create a new feature branch with the accidental commits
git checkout -b feature/accidental-work

# Go back to main
git checkout main

# Reset main to before the commits
git reset --hard origin/main
# OR if not pushed yet
git reset --hard HEAD~1  # Go back 1 commit

# Now continue on your feature branch
git checkout feature/accidental-work
```

### Option 2: Cherry-Pick Commits (If Already Pushed)

```bash
# Document the commit hashes you need
git log main --oneline

# Create feature branch from development
git checkout -b feature/recover-work development

# Cherry-pick the commits from main
git cherry-pick <commit-hash-1>
git cherry-pick <commit-hash-2>

# Now main and development will sync via merge back
```

---

## Troubleshooting

### "I'm on development, not sure if I should create a new branch"

**Always create a feature branch.** Even for small fixes:

```bash
git checkout -b fix/small-typo development
# make change
git add .
git commit -m "fix: typo in login error message"
git checkout development
git merge --no-ff fix/small-typo
```

### "I have conflicting changes between main and development"

This usually means the branches diverged. Here's how to resolve:

```bash
git checkout development
git fetch origin
git rebase origin/main
# Resolve conflicts as they appear
git rebase --continue
git push origin development
```

### "Main and development have completely different histories"

Avoid this situation by always syncing development after merging to main:

```bash
git checkout development
git rebase main
git push origin development
```

---

## Quick Reference Commands

```bash
# Create and switch to feature branch
git checkout -b feature/name development

# View current branch
git branch

# Switch branches
git checkout branch-name

# Merge with history (development)
git merge --no-ff feature-branch

# Merge with squash (main)
git merge --squash development

# Update feature branch from development
git rebase development

# Sync development after main merge
git checkout development
git rebase main

# Delete merged branch
git branch -d feature-branch

# Delete unmerged branch
git branch -D feature-branch

# View recent commits
git log --oneline -10

# View commits on a branch not on main
git log main..feature-branch

# See what changed on feature branch
git diff main...feature-branch
```

---

## Summary

1. **Always use feature branches** - Never commit directly to `main` or `development`
2. **Messy commits on features** - WIP messages are fine while developing
3. **Clean commits on main** - Squash merge with descriptive messages
4. **Sync often** - Keep feature branches updated with development
5. **Protect main** - Use Git hooks or branch protection rules
6. **Merge approach** - `--no-ff` for development, `--squash` for main

This workflow provides:
- ✅ Clean, readable `main` history
- ✅ Flexible `development` branch for work-in-progress
- ✅ Easy to move commits between branches
- ✅ Protection against accidental commits
- ✅ Clear separation of concerns

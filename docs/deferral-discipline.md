# Deferral Discipline — No Lazy Tech Debt

**Headline rule:** If you see something, say something — then plan to do something.

When you discover a related defect, fragile mapping, blocked hook, missing dependency, weak RLS policy, dead code, broken mobile config, missing migration, missing test coverage, or regression risk, do **one** of the following:

1. **Fix in current branch** — required if it's directly connected to the bug, affects correctness, creates duplicate logic, or is needed for feature reliability.
2. **Produce a paste-ready Follow-Up Issue Plan** — never a vague parking-lot note.

## Banned phrases

- `out of scope`
- `future cleanup PR`
- `temporary duplication`
- `known tech debt`
- `could be addressed later`
- `not addressed in this branch`

## Follow-Up Issue Plan template

- **Title**
- **Why this matters**
- **Files likely involved**
- **Current risk**
- **Recommended fix**
- **Acceptance criteria**
- **Test plan**
- **Rollback plan**
- **Launch-blocking?** (yes/no + reasoning)

## Duplicate logic carve-out

Temporary duplication is acceptable **only when all four are true**:

1. Removing it creates high regression risk
2. The duplicate path is explicitly marked in code (comment + TODO with issue link)
3. A concrete cleanup issue is produced
4. User has approved the deferral

Otherwise: consolidate to one source of truth. Mapping layers are not a fix — they are a smell. Fix at the source.

## Blocked-path protocol

If a tool, hook, permission, linter, test, import rule, or repo access blocks the ideal fix:

1. Identify the exact blocker
2. Explain why it blocks the preferred fix
3. Try ≥2 alternative approaches
4. Choose the safest viable path
5. If no path is safe, produce a ready-to-run unblock plan

## Critical-path override

For auth, chat, media uploads, record creation/editing, payments, invites, and mobile wrapper behavior: **reliability beats narrow scope**. If the feature remains fragile after the fix, say so directly and propose the next fix in the same response.

## Mandatory response footer

Every final response on a coding task ends with:

1. **Fixed now**
2. **Discovered**
3. **Intentionally deferred** (if anything)
4. **Why deferral was necessary**
5. **Paste-ready follow-up prompt** for each deferred item
6. **Validation completed**
7. **Remaining launch blockers**

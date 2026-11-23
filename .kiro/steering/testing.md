---
inclusion: fileMatch
fileMatchPattern: "**/*.test.{js,jsx}"
---

# Testing Steering

## Kinds of tests

| Kind | Tool | File suffix | What for |
|---|---|---|---|
| Unit | Jest, `jest.unstable_mockModule` | `.test.js` | services and middleware with mocked models |
| Property | Jest + `fast-check` | `.property.test.js` | the numbered Correctness Properties in each `design.md` |
| Integration | Jest + `supertest` + `mongodb-memory-server` | `.int.test.js` | HTTP endpoints against a real in-memory DB |
| Client | Vitest + RTL | `.test.jsx` | role-based hiding, the voice agent states |

## Rules

- Each property test starts with a comment that names its property and the requirements it covers:
  ```js
  // Property 3: Permission matrix is enforced for every role × action
  // Validates: Requirements 2.3, 2.4
  ```
- Use `fc.assert(fc.asyncProperty(...), { numRuns: 100 })`. Lower `numRuns` only for DB-backed properties, and never below 25.
- When fast-check finds a counterexample, **paste the shrunk counterexample into a regular unit test** before fixing the bug, so it never regresses.
- Voice tests fake `window.speechSynthesis`; they never need a microphone, speaker or any key.
- Tests must not depend on wall-clock time. Inject `now` into functions that compare dates.

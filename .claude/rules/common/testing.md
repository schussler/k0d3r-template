# Testing Requirements

## Minimum Test Coverage: 80%

Test types, each where the system has that layer:
1. **Unit Tests** - Individual functions, utilities, components
2. **Integration Tests** - API endpoints, database operations
3. **E2E Tests** - Critical user flows (framework chosen per language)

## Test-Driven Development

A change that has an acceptance criterion gets its test before its code:
1. Write test first (RED)
2. Run test - it should FAIL, and for the reason you expect
3. Write minimal implementation (GREEN)
4. Run test - it should PASS
5. Refactor (IMPROVE)
6. Verify coverage (80%+)

A change with no behaviour effect (refactor, dependency, typo, rename) needs no new test: the existing tests
staying green is the evidence.

In a `/k0d3r-task` with a spec, the failing tests are written by the **test-author** agent from the approved
spec alone, before the session writes any code. Outside the command, the session drives the cycle itself.

## Troubleshooting Test Failures

1. Check test isolation
2. Verify mocks are correct
3. Fix implementation, not tests (unless tests are wrong)
4. Use the **tdd-guide** agent if the cycle is stuck

## Agent Support

- **test-author** - writes the failing tests from the approved spec, with a clean context, in `/k0d3r-task`
- **tdd-guide** - drives the red/green/refactor cycle in the session, outside `/k0d3r-task`

## Test Structure (AAA Pattern)

Prefer Arrange-Act-Assert structure for tests:

```typescript
test('calculates similarity correctly', () => {
  // Arrange
  const vector1 = [1, 0, 0]
  const vector2 = [0, 1, 0]

  // Act
  const similarity = calculateCosineSimilarity(vector1, vector2)

  // Assert
  expect(similarity).toBe(0)
})
```

### Test Naming

Use descriptive names that explain the behavior under test:

```typescript
test('returns empty array when no markets match query', () => {})
test('throws error when API key is missing', () => {})
test('falls back to substring search when Redis is unavailable', () => {})
```

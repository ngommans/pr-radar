import { getFileDiffStats, findOverlappingHunks } from '../src/diff.js';

const SAMPLE_DIFF = `diff --git a/src/api/handler.ts b/src/api/handler.ts
index abc123..def456 100644
--- a/src/api/handler.ts
+++ b/src/api/handler.ts
@@ -85,10 +85,15 @@ export async function handleRequest(req, res) {
+  const newVar = true;
+  const another = false;
+  doSomething();
+  doMore();
+  finalStep();
   existingLine();
   anotherLine();
   moreLines();
   evenMore();
   lastLine();
-  removedLine();
-  alsoRemoved();
-  finalRemoved();
diff --git a/src/utils/config.ts b/src/utils/config.ts
index 111111..222222 100644
--- a/src/utils/config.ts
+++ b/src/utils/config.ts
@@ -10,5 +10,8 @@ const config = {
+  newKey: 'value',
+  anotherKey: 42,
+  thirdKey: true,
   existing: 'kept',
   alsoKept: true,
`;

describe('getFileDiffStats', () => {
  test('parses added and removed line counts', () => {
    const stats = getFileDiffStats(SAMPLE_DIFF);
    expect(stats).toHaveLength(2);

    const handler = stats.find(s => s.file === 'src/api/handler.ts');
    expect(handler.added).toBe(5);
    expect(handler.removed).toBe(3);

    const config = stats.find(s => s.file === 'src/utils/config.ts');
    expect(config.added).toBe(3);
    expect(config.removed).toBe(0);
  });

  test('parses hunk ranges', () => {
    const stats = getFileDiffStats(SAMPLE_DIFF);
    const handler = stats.find(s => s.file === 'src/api/handler.ts');
    expect(handler.hunks).toHaveLength(1);
    expect(handler.hunks[0].oldStart).toBe(85);
    expect(handler.hunks[0].oldCount).toBe(10);
  });

  test('returns empty array for empty diff', () => {
    expect(getFileDiffStats('')).toHaveLength(0);
  });
});

describe('findOverlappingHunks', () => {
  test('detects overlapping line ranges', () => {
    const statsA = {
      file: 'src/handler.ts',
      added: 5, removed: 2,
      hunks: [{ oldStart: 85, oldCount: 15, newStart: 85, newCount: 18 }],
    };
    const statsB = {
      file: 'src/handler.ts',
      added: 3, removed: 1,
      hunks: [{ oldStart: 95, oldCount: 10, newStart: 95, newCount: 12 }],
    };
    const overlaps = findOverlappingHunks(statsA, statsB);
    expect(overlaps).toHaveLength(1);
    expect(overlaps[0].start).toBe(95);
    expect(overlaps[0].end).toBe(99); // min(99, 104)
  });

  test('returns empty when hunks do not overlap', () => {
    const statsA = {
      file: 'src/handler.ts',
      added: 2, removed: 0,
      hunks: [{ oldStart: 10, oldCount: 5, newStart: 10, newCount: 7 }],
    };
    const statsB = {
      file: 'src/handler.ts',
      added: 2, removed: 0,
      hunks: [{ oldStart: 50, oldCount: 5, newStart: 52, newCount: 7 }],
    };
    expect(findOverlappingHunks(statsA, statsB)).toHaveLength(0);
  });
});

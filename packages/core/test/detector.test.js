import { detectCollisions } from '../src/detector.js';

describe('detectCollisions', () => {
  test('returns empty collisions when no files overlap', () => {
    const fileMap = {
      'pr-1': ['src/a.ts', 'src/b.ts'],
      'pr-2': ['src/c.ts', 'src/d.ts'],
    };
    const result = detectCollisions(fileMap);
    expect(result.collisions).toHaveLength(0);
    expect(result.clean).toHaveLength(4);
    expect(result.ignored).toHaveLength(0);
  });

  test('detects a simple two-PR collision', () => {
    const fileMap = {
      'pr-1': ['src/shared.ts', 'src/a.ts'],
      'pr-2': ['src/shared.ts', 'src/b.ts'],
    };
    const result = detectCollisions(fileMap);
    expect(result.collisions).toHaveLength(1);
    expect(result.collisions[0].file).toBe('src/shared.ts');
    expect(result.collisions[0].sources).toContain('pr-1');
    expect(result.collisions[0].sources).toContain('pr-2');
    expect(result.clean).toHaveLength(2);
  });

  test('detects three-way collision', () => {
    const fileMap = {
      'branch-a': ['src/handler.ts'],
      'branch-b': ['src/handler.ts'],
      'branch-c': ['src/handler.ts'],
    };
    const result = detectCollisions(fileMap);
    expect(result.collisions[0].sources).toHaveLength(3);
  });

  test('respects ignorePatterns', () => {
    const fileMap = {
      'pr-1': ['package-lock.json', 'src/a.ts'],
      'pr-2': ['package-lock.json', 'src/b.ts'],
    };
    const result = detectCollisions(fileMap, ['package-lock.json']);
    expect(result.collisions).toHaveLength(0);
    expect(result.ignored).toContain('package-lock.json');
  });

  test('respects glob ignorePatterns', () => {
    const fileMap = {
      'pr-1': ['dist/bundle.js', 'src/a.ts'],
      'pr-2': ['dist/bundle.js', 'src/b.ts'],
    };
    const result = detectCollisions(fileMap, ['dist/**']);
    expect(result.collisions).toHaveLength(0);
    expect(result.ignored).toContain('dist/bundle.js');
  });

  test('normalises Windows path separators', () => {
    const fileMap = {
      'pr-1': ['src\\api\\handler.ts'],
      'pr-2': ['src/api/handler.ts'],
    };
    const result = detectCollisions(fileMap);
    expect(result.collisions).toHaveLength(1);
    expect(result.collisions[0].file).toBe('src/api/handler.ts');
  });

  test('handles empty fileMap', () => {
    const result = detectCollisions({});
    expect(result.collisions).toHaveLength(0);
    expect(result.clean).toHaveLength(0);
    expect(result.ignored).toHaveLength(0);
  });

  test('handles single source — no collisions', () => {
    const fileMap = {
      'pr-1': ['src/a.ts', 'src/b.ts', 'src/c.ts'],
    };
    const result = detectCollisions(fileMap);
    expect(result.collisions).toHaveLength(0);
    expect(result.clean).toHaveLength(3);
  });
});

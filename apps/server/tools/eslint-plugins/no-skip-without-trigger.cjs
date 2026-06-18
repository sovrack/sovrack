/**
 * @fileoverview no-skip-without-trigger
 *
 * Catches the `if (skipX) return;` anti-pattern in service files. This
 * exact pattern caused the P1-07 bug class (silent early return in
 * `gitlab-file-pusher.service.ts` hid that the platform was pushing
 * `.gitlab-ci.yml` into client repos).
 *
 * Rule:
 *   - Applies to `*.service.ts` files
 *   - Triggers on an `IfStatement` where:
 *       1. The test is a simple boolean (Identifier, MemberExpression,
 *          or logical NOT on those)
 *       2. The boolean identifier matches a "skip-like" name:
 *          `skip*`, `shouldSkip*`, `dryRun*`, `isDisabled*`,
 *          `ifX*`, `when*` (in a few safe forms)
 *       3. The consequent is a `ReturnStatement` directly (early
 *          return) — i.e. `if (skip) return;` not `if (skip) { ... return; }`
 *          (the latter is the safe pattern: explicit branch with a
 *          documented side-effect before the return)
 *
 * The fix is to either:
 *   (a) replace the early return with an explicit `if/else` branch that
 *       has a documented side-effect (e.g. throw, log+return, etc.),
 *   (b) use the `PlaybookRouter`-style single source of truth pattern
 *       where the skip + downstream action are returned together.
 */
'use strict';

const SKIP_LIKE = /^(skip|shouldSkip|dryRun|isDisabled|when|ifDisabled|ifSkipped)/i;

module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow `if (skipX) return;` early-return patterns in service files. ' +
        'See P1-07 of the refactoring plan for the bug class this prevents.',
      category: 'Best Practices',
      recommended: false,
    },
    schema: [],
    messages: {
      noSkipReturn:
        'Avoid `if ({{name}}) return;` early-return patterns. ' +
        'Prefer an explicit if/else branch with a documented side-effect, ' +
        'or use a single source of truth that returns the skip + action together. ' +
        'See P1-07 of docs/refactoring/ARCHITECTURE-REFACTORING.md for context.',
    },
  },

  create(context) {
    const filename = context.getFilename();
    if (!filename.endsWith('.service.ts')) {
      return {};
    }

    function isSkipLikeName(name) {
      return typeof name === 'string' && SKIP_LIKE.test(name);
    }

    function getTestName(node) {
      // if (skipX) → Identifier
      if (node.type === 'Identifier') {
        return node.name;
      }
      // if (this.skipX) or if (obj.skipX) → MemberExpression
      if (node.type === 'MemberExpression' && !node.computed) {
        return node.property && node.property.name;
      }
      // if (!skipX) or if (!this.skipX) → UnaryExpression
      if (node.type === 'UnaryExpression' && node.operator === '!') {
        return getTestName(node.argument);
      }
      // if (A || B) — check both sides
      if (node.type === 'LogicalExpression') {
        return getTestName(node.left) || getTestName(node.right);
      }
      return null;
    }

    return {
      IfStatement(node) {
        // Only flag the direct-return form: `if (skip) return;`
        // Multi-statement blocks are OK (they document the branch).
        if (node.consequent.type !== 'ReturnStatement') {
          return;
        }
        const testName = getTestName(node.test);
        if (!testName || !isSkipLikeName(testName)) {
          return;
        }
        context.report({
          node: node.test,
          messageId: 'noSkipReturn',
          data: { name: testName },
        });
      },
    };
  },
};

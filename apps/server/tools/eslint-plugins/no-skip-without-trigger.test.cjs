/**
 * @fileoverview Tests for the no-skip-without-trigger rule.
 *
 * Verifies that the rule:
 *   - flags the bad pattern (`if (skipX) return;` in a service file)
 *   - ignores the safe pattern (`if (skipX) { ... return; }` block)
 *   - ignores files that are not services
 *   - ignores tests / non-skip-like names
 */
'use strict';

const { RuleTester } = require('eslint');
const rule = require('./no-skip-without-trigger.cjs');

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
});

const wrap = (code) => `function f() { ${code} }`;

ruleTester.run('no-skip-without-trigger', rule, {
  valid: [
    // Non-service file — rule does not apply
    {
      filename: 'src/foo.ts',
      code: wrap('if (skipSomething) return;'),
    },
    // Service file but the block is explicit (safe pattern)
    {
      filename: 'src/foo.service.ts',
      code: wrap('if (skipSomething) { this.logger.log("skipped"); return; }'),
    },
    // Service file with a non-skip boolean
    {
      filename: 'src/foo.service.ts',
      code: wrap('if (isReady) return;'),
    },
    // Service file with a non-skip name
    {
      filename: 'src/foo.service.ts',
      code: wrap('if (count > 3) return;'),
    },
    // Service file with explicit else branch
    {
      filename: 'src/foo.service.ts',
      code: wrap('if (skipPush) { /* explicit no-op */ } else { this.push(); }'),
    },
    // Unary NOT on a non-skip name
    {
      filename: 'src/foo.service.ts',
      code: wrap('if (!isReady) return;'),
    },
  ],
  invalid: [
    {
      filename: 'src/foo.service.ts',
      code: wrap('if (skipGitlabCi) return;'),
      errors: [
        {
          messageId: 'noSkipReturn',
          data: { name: 'skipGitlabCi' },
        },
      ],
    },
    {
      filename: 'src/foo.service.ts',
      code: wrap('if (this.skipBuild) return;'),
      errors: [
        {
          messageId: 'noSkipReturn',
          data: { name: 'skipBuild' },
        },
      ],
    },
    {
      filename: 'src/foo.service.ts',
      code: wrap('if (shouldSkipDeploy) return;'),
      errors: [
        {
          messageId: 'noSkipReturn',
          data: { name: 'shouldSkipDeploy' },
        },
      ],
    },
    {
      filename: 'src/foo.service.ts',
      code: wrap('if (!dryRun) return;'),
      errors: [
        {
          messageId: 'noSkipReturn',
          data: { name: 'dryRun' },
        },
      ],
    },
    {
      filename: 'src/foo.service.ts',
      code: wrap('if (skipA || shouldSkipB) return;'),
      errors: [
        {
          messageId: 'noSkipReturn',
        },
      ],
    },
  ],
});

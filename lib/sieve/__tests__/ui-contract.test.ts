import { describe, expect, it } from 'vitest';
import type {
  FilterAction,
  FilterActionType,
  FilterComparator,
  FilterCondition,
  FilterConditionField,
  FilterRule,
} from '@/lib/jmap/sieve-types';
import {
  FILTER_ACTION_TYPES,
  FILTER_CONDITION_FIELDS,
  comparatorsForField,
} from '../filter-schema';
import { generateScript } from '../generator';
import { parseScript } from '../parser';

function conditionFor(
  field: FilterConditionField,
  comparator: FilterComparator,
): FilterCondition {
  switch (field) {
    case 'size':
      return { field, comparator, value: '1024' };
    case 'attachment':
      return { field, comparator, value: comparator === 'has_any' ? '' : 'pdf' };
    case 'header':
      return { field, comparator, value: 'contract-value', headerName: 'X-Contract-Test' };
    case 'envelope_to':
      return { field, comparator, value: 'alias@example.org' };
    case 'from':
    case 'to':
    case 'cc':
    case 'subject':
    case 'body':
      return { field, comparator, value: 'contract-value' };
  }
}

function actionFor(type: FilterActionType): FilterAction {
  switch (type) {
    case 'move':
    case 'copy':
      return { type, value: 'Contract Folder' };
    case 'forward':
      return { type, value: 'forward@example.org' };
    case 'reject':
      return { type, value: 'Rejected by contract test' };
    case 'add_label':
      return { type, value: 'Contract' };
    case 'mark_read':
    case 'star':
    case 'discard':
    case 'keep':
    case 'stop':
      return { type };
  }
}

function ruleWith(
  id: string,
  condition: FilterCondition,
  actions: FilterAction[] = [{ type: 'keep' }],
): FilterRule {
  return {
    id,
    name: `UI contract ${id}`,
    enabled: true,
    matchType: 'all',
    conditions: [condition],
    actions,
    stopProcessing: false,
  };
}

const conditionCases = FILTER_CONDITION_FIELDS.flatMap((field) =>
  comparatorsForField(field).map((comparator) => ({ field, comparator })),
);

describe('visual filter builder → Sieve contract', () => {
  it.each(conditionCases)('generates and round-trips $field/$comparator', ({ field, comparator }) => {
    const condition = conditionFor(field, comparator);
    const script = generateScript([ruleWith(`${field}-${comparator}`, condition)]);

    expect(script).not.toContain('"undefined"');
    expect(parseScript(script).rules[0].conditions[0]).toEqual(condition);
  });

  it.each(FILTER_ACTION_TYPES)('generates and round-trips the %s action', (type) => {
    const action = actionFor(type);
    const script = generateScript([
      ruleWith(type, { field: 'subject', comparator: 'contains', value: 'contract' }, [action]),
    ]);

    expect(script).not.toContain('"undefined"');
    expect(parseScript(script).rules[0].actions[0]).toEqual(action);
  });

  it('emits every extension required by the UI matrix', () => {
    const rules = [
      ...conditionCases.map(({ field, comparator }, index) =>
        ruleWith(`condition-${index}`, conditionFor(field, comparator))),
      ...FILTER_ACTION_TYPES.map((type, index) =>
        ruleWith(
          `action-${index}`,
          { field: 'subject', comparator: 'contains', value: 'contract' },
          [actionFor(type)],
        )),
    ];
    const script = generateScript(rules, {
      isEnabled: true,
      subject: 'Contract vacation',
      textBody: 'Contract vacation body',
    });

    for (const extension of [
      'body', 'copy', 'envelope', 'fileinto', 'imap4flags', 'mime', 'reject', 'vacation',
    ]) {
      expect(script).toContain(`"${extension}"`);
    }
  });

  it('keeps metadata comments and rule comments from becoming Sieve source', () => {
    const script = generateScript([
      ruleWith(
        'comment-safety',
        { field: 'subject', comparator: 'contains', value: '*/ discard;' },
      ),
    ].map((rule) => ({ ...rule, name: 'line one\nline two' })));

    expect(script).toContain('"*\\/ discard;"');
    expect(script).toContain('# Rule: line one line two');
    expect(parseScript(script).rules[0].conditions[0].value).toBe('*/ discard;');
  });

  it('rejects runtime values outside the UI contract instead of emitting undefined', () => {
    expect(() => generateScript([
      ruleWith('unknown-field', { field: 'bcc' as never, comparator: 'is', value: 'a@example.org' }),
    ])).toThrow('Invalid Sieve condition: bcc/is');

    expect(() => generateScript([
      ruleWith(
        'unknown-action',
        { field: 'subject', comparator: 'contains', value: 'contract' },
        [{ type: 'unknown' as never }],
      ),
    ])).toThrow('Invalid Sieve action: unknown');

    expect(() => generateScript([
      ruleWith('empty-attachment-type', { field: 'attachment', comparator: 'has_type', value: '*' }),
    ])).toThrow('Invalid Sieve condition: attachment/has_type');
  });
});

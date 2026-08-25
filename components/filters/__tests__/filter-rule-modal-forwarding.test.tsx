import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { FilterRule } from '@/lib/jmap/sieve-types';
import { FilterRuleModal } from '../filter-rule-modal';

const RULE_WITH_TWO_FORWARDS: FilterRule = {
  id: 'rule-1',
  name: 'Forward login links',
  enabled: true,
  matchType: 'all',
  conditions: [
    { field: 'from', comparator: 'contains', value: '@example.org' },
  ],
  actions: [
    { type: 'forward', value: 'first@example.org' },
    { type: 'forward', value: 'second@example.org' },
  ],
  stopProcessing: false,
};

describe('FilterRuleModal forwarding policy', () => {
  it('prevents saving a rule that exceeds the server redirect limit', () => {
    render(
      <FilterRuleModal
        rule={RULE_WITH_TWO_FORWARDS}
        mailboxes={[]}
        maxNumberRedirects={1}
        onSave={() => {}}
        onClose={() => {}}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('forward_limit_exceeded');
    expect(screen.getByRole('button', { name: 'save' })).toBeDisabled();
  });
});

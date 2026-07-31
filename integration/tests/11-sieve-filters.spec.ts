import { expect, test } from '@playwright/test';
import type {
  FilterAction,
  FilterActionType,
  FilterComparator,
  FilterCondition,
  FilterConditionField,
  FilterRule,
} from '../../lib/jmap/sieve-types';
import {
  FILTER_ACTION_TYPES,
  FILTER_CONDITION_FIELDS,
  comparatorsForField,
} from '../../lib/sieve/filter-schema';
import { generateScript } from '../../lib/sieve/generator';
import { ACCOUNTS } from './helpers/config';
import { JmapClient } from './helpers/jmap';
import { sendMail } from './helpers/smtp';

const alice = ACCOUNTS.alice;
const bob = ACCOUNTS.bob;

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
      return { field, comparator, value: 'integration', headerName: 'X-Integration-Test' };
    case 'envelope_to':
      return { field, comparator, value: alice.email };
    case 'from':
    case 'to':
    case 'cc':
    case 'subject':
    case 'body':
      return { field, comparator, value: 'integration' };
  }
}

function actionFor(type: FilterActionType): FilterAction {
  switch (type) {
    case 'move':
    case 'copy':
      return { type, value: 'Sieve Validation' };
    case 'forward':
      return { type, value: bob.email };
    case 'reject':
      return { type, value: 'Rejected by integration test' };
    case 'add_label':
      return { type, value: 'Integration' };
    case 'mark_read':
    case 'star':
    case 'discard':
    case 'keep':
    case 'stop':
      return { type };
  }
}

function rule(
  id: string,
  condition: FilterCondition,
  actions: FilterAction[] = [{ type: 'keep' }],
): FilterRule {
  return {
    id,
    name: `Sieve integration ${id}`,
    enabled: true,
    matchType: 'all',
    conditions: [condition],
    actions,
    stopProcessing: false,
  };
}

test.describe('visual filter builder Sieve contract', () => {
  let jmap: JmapClient;

  test.beforeEach(async () => {
    jmap = await JmapClient.connect(alice.email, alice.password);
    await jmap.resetSieveScripts();
    await jmap.reset();
  });

  test.afterEach(async () => {
    await jmap.resetSieveScripts();
    await jmap.reset();
  });

  test('Stalwart validates every condition, comparator, action, and vacation emitted by the UI', async () => {
    const rules: FilterRule[] = [];
    for (const field of FILTER_CONDITION_FIELDS) {
      for (const comparator of comparatorsForField(field)) {
        rules.push(rule(`condition-${field}-${comparator}`, conditionFor(field, comparator)));
      }
    }
    for (const type of FILTER_ACTION_TYPES) {
      rules.push(rule(
        `action-${type}`,
        { field: 'subject', comparator: 'contains', value: 'integration' },
        [actionFor(type)],
      ));
    }

    const script = generateScript(rules, {
      isEnabled: true,
      subject: 'Integration vacation',
      textBody: 'Integration vacation body',
    });
    const validationError = await jmap.validateSieveScript(script);

    expect(validationError, validationError ?? 'generated script should be valid').toBeNull();
  });

  test('actual delivery recipient matches SMTP RCPT TO even when the visible To header differs', async () => {
    const folderName = 'Envelope recipient';
    const folderId = await jmap.createMailbox(folderName);
    const script = generateScript([
      rule(
        'envelope-delivery',
        { field: 'envelope_to', comparator: 'is', value: alice.email },
        [{ type: 'mark_read' }, { type: 'move', value: folderName }],
      ),
    ]);
    const validationError = await jmap.validateSieveScript(script);
    expect(validationError, validationError ?? 'generated script should be valid').toBeNull();
    await jmap.createSieveScript(`integration-${Date.now()}`, script, true);

    const subject = `IT envelope recipient ${Date.now()}`;
    await sendMail({
      from: bob.email,
      authPass: bob.password,
      to: alice.email,
      subject,
      body: 'The SMTP recipient is Alice, but the visible To header is not.',
      headers: { To: 'undisclosed@example.org' },
    });

    const email = await jmap.waitForEmail(subject, { mailboxId: folderId });
    expect(email.keywords.$seen).toBe(true);
    expect(email.mailboxIds).toEqual({ [folderId]: true });
    expect(email.to).toMatchObject([{ email: 'undisclosed@example.org' }]);
  });
});

import type {
  FilterAction,
  FilterActionType,
  FilterComparator,
  FilterCondition,
  FilterConditionField,
} from '@/lib/jmap/sieve-types';

/**
 * Canonical capabilities of the visual filter builder. The modal, generator,
 * and contract tests consume these lists so every exposed option stays covered.
 */
export const FILTER_CONDITION_FIELDS = [
  'from',
  'to',
  'cc',
  'envelope_to',
  'subject',
  'header',
  'size',
  'body',
  'attachment',
] as const satisfies readonly FilterConditionField[];

export const TEXT_FILTER_COMPARATORS = [
  'contains',
  'not_contains',
  'is',
  'not_is',
  'starts_with',
  'ends_with',
  'matches',
] as const satisfies readonly FilterComparator[];

export const SIZE_FILTER_COMPARATORS = [
  'greater_than',
  'less_than',
] as const satisfies readonly FilterComparator[];

export const ATTACHMENT_FILTER_COMPARATORS = [
  'has_any',
  'has_type',
] as const satisfies readonly FilterComparator[];

export const FILTER_ACTION_TYPES = [
  'move',
  'copy',
  'forward',
  'mark_read',
  'star',
  'add_label',
  'discard',
  'reject',
  'keep',
  'stop',
] as const satisfies readonly FilterActionType[];

export const FILTER_ACTIONS_WITH_VALUE = [
  'move',
  'copy',
  'forward',
  'reject',
  'add_label',
] as const satisfies readonly FilterActionType[];

export const FILTER_ACTIONS_WITH_MAILBOX = [
  'move',
  'copy',
] as const satisfies readonly FilterActionType[];

export function comparatorsForField(field: FilterConditionField): readonly FilterComparator[] {
  switch (field) {
    case 'size':
      return SIZE_FILTER_COMPARATORS;
    case 'attachment':
      return ATTACHMENT_FILTER_COMPARATORS;
    case 'from':
    case 'to':
    case 'cc':
    case 'envelope_to':
    case 'subject':
    case 'header':
    case 'body':
      return TEXT_FILTER_COMPARATORS;
  }
}

export function isFilterConditionField(value: string): value is FilterConditionField {
  return (FILTER_CONDITION_FIELDS as readonly string[]).includes(value);
}

export function isFilterComparator(value: string): value is FilterComparator {
  return [
    ...TEXT_FILTER_COMPARATORS,
    ...SIZE_FILTER_COMPARATORS,
    ...ATTACHMENT_FILTER_COMPARATORS,
  ].includes(value as FilterComparator);
}

export function isFilterActionType(value: string): value is FilterActionType {
  return (FILTER_ACTION_TYPES as readonly string[]).includes(value);
}

export function isComparatorAllowed(
  field: FilterConditionField,
  comparator: FilterComparator,
): boolean {
  return comparatorsForField(field).includes(comparator);
}

export function actionRequiresValue(type: FilterActionType): boolean {
  return (FILTER_ACTIONS_WITH_VALUE as readonly FilterActionType[]).includes(type);
}

export function actionUsesMailbox(type: FilterActionType): boolean {
  return (FILTER_ACTIONS_WITH_MAILBOX as readonly FilterActionType[]).includes(type);
}

export function isValidHeaderName(value: string): boolean {
  // RFC 5322 field-name = 1*ftext: printable US-ASCII except colon.
  return /^[\x21-\x39\x3b-\x7e]+$/.test(value);
}

export function isValidSizeValue(value: string): boolean {
  return /^\d+$/.test(value);
}

function hasNonEmptyValue(value: string | string[]): boolean {
  if (Array.isArray(value)) {
    return value.length > 0 && value.every((item) => item.trim().length > 0);
  }
  return value.trim().length > 0;
}

export function isValidFilterCondition(condition: FilterCondition): boolean {
  if (
    !isFilterConditionField(condition.field as string) ||
    !isFilterComparator(condition.comparator as string)
  ) {
    return false;
  }
  if (
    typeof condition.value !== 'string' &&
    !(Array.isArray(condition.value) && condition.value.every((item) => typeof item === 'string'))
  ) {
    return false;
  }
  if (!isComparatorAllowed(condition.field, condition.comparator)) {
    return false;
  }

  switch (condition.field) {
    case 'attachment':
      if (condition.comparator === 'has_any') {
        return true;
      }
      return (Array.isArray(condition.value) ? condition.value : [condition.value])
        .every((item) => item.replace(/^[.*]+/, '').trim().length > 0);
    case 'size':
      return typeof condition.value === 'string' && isValidSizeValue(condition.value);
    case 'header':
      return Boolean(
        condition.headerName &&
        isValidHeaderName(condition.headerName) &&
        hasNonEmptyValue(condition.value),
      );
    case 'from':
    case 'to':
    case 'cc':
    case 'envelope_to':
    case 'subject':
    case 'body':
      return hasNonEmptyValue(condition.value);
  }
}

export function isValidFilterAction(action: FilterAction): boolean {
  if (!isFilterActionType(action.type as string)) {
    return false;
  }
  if (action.value !== undefined && typeof action.value !== 'string') {
    return false;
  }
  return !actionRequiresValue(action.type) || Boolean(action.value?.trim());
}

import type { FilterRule, FilterCondition, FilterAction, FilterMetadata, VacationSieveConfig } from '@/lib/jmap/sieve-types';
import { debug } from '@/lib/debug';
import { isValidFilterAction, isValidFilterCondition } from './filter-schema';

function escapeString(value: string): string {
  if (value.includes('\0')) {
    throw new Error('Sieve strings cannot contain NUL characters');
  }
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// Normalise the condition value to a non-empty string array. Single-value
// conditions stay one-element; arrays are filtered for empty strings.
function toValueList(value: string | string[]): string[] {
  const arr = Array.isArray(value) ? value : [value];
  const values = arr.map((v) => v.toString()).filter((v) => v.length > 0);
  if (values.length === 0) {
    throw new Error('Sieve condition requires at least one non-empty value');
  }
  return values;
}

// Render one or many strings as a Sieve string-literal-or-list. Sieve treats
// `header :contains "From" ["a", "b"]` as "any of a, b" (built-in OR within
// the condition); the single-string form is emitted unchanged when len === 1
// so existing scripts and tests stay byte-identical.
function formatStringArg(values: string[], transform: (s: string) => string = (s) => s): string {
  if (values.length === 1) {
    return `"${escapeString(transform(values[0]))}"`;
  }
  return `[${values.map((v) => `"${escapeString(transform(v))}"`).join(', ')}]`;
}

function generateTextTest(
  comparator: FilterCondition['comparator'],
  values: string[],
  render: (matchType: ':contains' | ':is' | ':matches', values: string[]) => string,
): string {
  switch (comparator) {
    case 'contains':
      return render(':contains', values);
    case 'not_contains':
      return `not ${render(':contains', values)}`;
    case 'is':
      return render(':is', values);
    case 'not_is':
      return `not ${render(':is', values)}`;
    case 'starts_with':
      return render(':matches', values.map((value) => `${value}*`));
    case 'ends_with':
      return render(':matches', values.map((value) => `*${value}`));
    case 'matches':
      return render(':matches', values);
    case 'greater_than':
    case 'less_than':
    case 'has_any':
    case 'has_type':
      throw new Error(`Comparator ${comparator} is not valid for a text condition`);
  }
}

function generateCondition(condition: FilterCondition): string {
  if (!isValidFilterCondition(condition)) {
    throw new Error(`Invalid Sieve condition: ${condition.field}/${condition.comparator}`);
  }

  const { field, comparator, value } = condition;

  switch (field) {
    case 'size': {
      const op = comparator === 'greater_than' ? ':over' : ':under';
      return `size ${op} ${value}`;
    }
    case 'attachment': {
      // RFC 5703: :mime :anychild matches against headers of any MIME part.
      // has_type checks both standard locations for attachment filenames.
      if (comparator === 'has_any') {
        return `header :mime :anychild :contains "Content-Disposition" "attachment"`;
      }
      const values = toValueList(value);
      const normalised = values.map((v) => v.replace(/^[.*]+/, '').trim()).filter(Boolean);
      return `header :mime :anychild :matches ["Content-Disposition", "Content-Type"] ${formatStringArg(normalised, (ext) => `*.${ext}*`)}`;
    }
    case 'body': {
      const values = toValueList(value);
      return generateTextTest(
        comparator,
        values,
        (matchType, testValues) => `body ${matchType} ${formatStringArg(testValues)}`,
      );
    }
    case 'envelope_to': {
      const values = toValueList(value);
      return generateTextTest(
        comparator,
        values,
        (matchType, testValues) => `envelope ${matchType} "to" ${formatStringArg(testValues)}`,
      );
    }
    case 'from':
    case 'to':
    case 'cc':
    case 'subject':
    case 'header': {
      let headerName: string;
      switch (field) {
        case 'from':
          headerName = 'From';
          break;
        case 'to':
          headerName = 'To';
          break;
        case 'cc':
          headerName = 'Cc';
          break;
        case 'subject':
          headerName = 'Subject';
          break;
        case 'header':
          headerName = condition.headerName!;
          break;
      }
      const values = toValueList(value);
      return generateTextTest(
        comparator,
        values,
        (matchType, testValues) => (
          `header ${matchType} "${escapeString(headerName)}" ${formatStringArg(testValues)}`
        ),
      );
    }
  }
}

function requiredActionValue(action: FilterAction): string {
  if (!action.value) {
    throw new Error(`Sieve action ${action.type} requires a value`);
  }
  return action.value;
}

function generateActions(actions: FilterAction[]): string[] {
  return actions.map(action => {
    if (!isValidFilterAction(action)) {
      throw new Error(`Invalid Sieve action: ${action.type}`);
    }
    switch (action.type) {
      case 'move':
        return `fileinto "${escapeString(requiredActionValue(action))}";`;
      case 'copy':
        return `fileinto :copy "${escapeString(requiredActionValue(action))}";`;
      case 'forward':
        return `redirect "${escapeString(requiredActionValue(action))}";`;
      case 'mark_read':
        return 'addflag "\\\\Seen";';
      case 'star':
        return 'addflag "\\\\Flagged";';
      case 'add_label':
        return `addflag "$label:${escapeString(requiredActionValue(action))}";`;
      case 'discard':
        return 'discard;';
      case 'reject':
        return `reject "${escapeString(requiredActionValue(action))}";`;
      case 'keep':
        return 'keep;';
      case 'stop':
        return 'stop;';
    }
  });
}

function computeRequires(rules: FilterRule[], vacation?: VacationSieveConfig): string[] {
  const extensions = new Set<string>();
  const enabledRules = rules.filter(r => r.enabled);

  if (vacation?.isEnabled) {
    extensions.add('vacation');
  }

  for (const rule of enabledRules) {
    for (const condition of rule.conditions) {
      if (condition.field === 'body') extensions.add('body');
      if (condition.field === 'attachment') extensions.add('mime');
      if (condition.field === 'envelope_to') {
        extensions.add('envelope');
      }
    }
    for (const action of rule.actions) {
      switch (action.type) {
        case 'move':
          extensions.add('fileinto');
          break;
        case 'copy':
          extensions.add('fileinto');
          extensions.add('copy');
          break;
        case 'mark_read':
        case 'star':
        case 'add_label':
          extensions.add('imap4flags');
          break;
        case 'reject':
          extensions.add('reject');
          break;
      }
    }
  }

  return [...extensions];
}

function stripRuleForMetadata(r: FilterRule): Omit<FilterRule, 'origin' | 'originLabel' | 'rawBlock'> {
  return {
    id: r.id,
    name: r.name,
    enabled: r.enabled,
    matchType: r.matchType,
    conditions: r.conditions,
    actions: r.actions,
    stopProcessing: r.stopProcessing,
  };
}

export interface GenerateOptions {
  /**
   * Require extensions used by external (non-Bulwark) rules that we must
   * preserve in the top-level `require` directive. Duplicates with Bulwark's
   * own requires are deduplicated.
   */
  externalRequires?: string[];
}

export function generateScript(
  rules: FilterRule[],
  vacation?: VacationSieveConfig,
  options: GenerateOptions = {},
): string {
  // Partition rules by origin. Treat missing origin as 'bulwark' for back-compat.
  const bulwarkRules: FilterRule[] = [];
  const externalRules: FilterRule[] = [];
  for (const r of rules) {
    if (r.origin && r.origin !== 'bulwark') externalRules.push(r);
    else bulwarkRules.push(r);
  }

  const metadata: FilterMetadata = {
    version: 1,
    rules: bulwarkRules.map(stripRuleForMetadata) as FilterRule[],
  };
  if (vacation?.isEnabled) {
    metadata.vacation = vacation;
  }
  // A literal */ inside JSON would terminate the metadata block comment and
  // turn user input into Sieve source. Escaping the slash is valid JSON and
  // round-trips back to the original string through JSON.parse.
  const metadataJson = JSON.stringify(metadata).replace(/\*\//g, '*\\/');
  const lines: string[] = [];

  lines.push('/* @metadata:begin');
  lines.push(metadataJson);
  lines.push('@metadata:end */');
  lines.push('');

  const bulwarkRequires = computeRequires(bulwarkRules, vacation);
  const externalRequires = options.externalRequires ?? [];
  const allRequires = [...new Set([...bulwarkRequires, ...externalRequires])].sort();

  if (allRequires.length > 0) {
    lines.push(`require [${allRequires.map(r => `"${r}"`).join(', ')}];`);
  }

  if (vacation?.isEnabled) {
    lines.push('');
    lines.push('# Vacation auto-reply');
    const vacationParts: string[] = [];
    if (vacation.subject) {
      vacationParts.push(`:subject "${escapeString(vacation.subject)}"`);
    }
    vacationParts.push(`"${escapeString(vacation.textBody || '')}"`);
    lines.push(`vacation ${vacationParts.join(' ')};`);
  }

  const enabledBulwarkRules = bulwarkRules.filter(r => r.enabled);

  for (const rule of enabledBulwarkRules) {
    if (rule.conditions.length === 0 || rule.actions.length === 0) {
      debug.warn('filters', `Skipping rule "${rule.name}": empty conditions or actions`);
      continue;
    }

    lines.push('');
    lines.push(`# Rule: ${rule.name.replace(/[\r\n]+/g, ' ')}`);

    const conditions = rule.conditions.map(generateCondition);
    let conditionStr: string;

    if (conditions.length === 0) {
      conditionStr = 'true';
    } else if (conditions.length === 1) {
      conditionStr = conditions[0];
    } else {
      const wrapper = rule.matchType === 'all' ? 'allof' : 'anyof';
      conditionStr = `${wrapper}(${conditions.join(', ')})`;
    }

    const actionLines = generateActions(rule.actions);

    if (rule.stopProcessing) {
      const lastAction = rule.actions[rule.actions.length - 1];
      if (!lastAction || !['stop', 'discard', 'reject'].includes(lastAction.type)) {
        actionLines.push('stop;');
      }
    }

    lines.push(`if ${conditionStr} {`);
    for (const actionLine of actionLines) {
      lines.push(`    ${actionLine}`);
    }
    lines.push('}');
  }

  // Append preserved external rules verbatim. Each rawBlock already carries its
  // own leading comments and trailing whitespace from the source script.
  if (externalRules.length > 0) {
    lines.push('');
    lines.push('# --- External rules (managed outside Bulwark) ---');
    for (const ext of externalRules) {
      if (!ext.rawBlock) continue;
      lines.push(ext.rawBlock.replace(/\s+$/, ''));
    }
  }

  lines.push('');
  return lines.join('\n');
}

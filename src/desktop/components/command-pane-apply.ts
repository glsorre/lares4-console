import { applyCompletion } from '../../core/autocomplete.js';

export function applySuggestion(
  command: string,
  suggestions: ReadonlyArray<string>,
  index: number,
): string | null {
  const suggestion = suggestions[index];
  if (suggestion === undefined) return null;
  return applyCompletion(command, suggestion);
}

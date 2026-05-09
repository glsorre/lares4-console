/**
 * Like ink-text-input, but ignores keys that are handled globally for log scrolling
 * (page keys, mouse wheel escape sequences) so they are not pasted into the buffer.
 */
import React, { useState, useEffect, useRef } from 'react';
import { Text, useInput } from 'ink';
import chalk from 'chalk';

export interface CommandTextInputProps {
  readonly placeholder?: string;
  readonly focus?: boolean;
  readonly mask?: string;
  readonly highlightPastedText?: boolean;
  readonly showCursor?: boolean;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onSubmit?: (value: string) => void;
}

function isSgrMouseOrWheelAnsi(input: string): boolean {
  if (input.length < 3) return false;
  if (input.includes('[<64;') || input.includes('[<65;')) return true;
  if (input.includes('[<66;') || input.includes('[<67;')) return true;
  if (input.includes('[<') && input.includes(';') && (input.endsWith('M') || input.endsWith('m'))) return true;
  return false;
}

export function isControlInputToIgnore(input: string, key: { pageUp?: boolean; pageDown?: boolean }): boolean {
  if (key.pageUp || key.pageDown) return true;
  if (input.includes('[5~') || input.includes('[[5~') || input.includes('[5;')) return true;
  if (input.includes('[6~') || input.includes('[[6~') || input.includes('[6;')) return true;
  if (isSgrMouseOrWheelAnsi(input)) return true;
  return false;
}

export function CommandTextInput({
  value: originalValue,
  placeholder = '',
  focus = true,
  mask,
  highlightPastedText = false,
  showCursor = true,
  onChange,
  onSubmit,
}: CommandTextInputProps) {
  const [state, setState] = useState({
    cursorOffset: (originalValue || '').length,
    cursorWidth: 0,
  });
  const { cursorOffset, cursorWidth } = state;
  /** When true, the latest `originalValue` came from this component's onChange (typing), not parent-only updates. */
  const pendingInternalChangeRef = useRef(false);

  useEffect(() => {
    setState((previousState) => {
      if (!focus || !showCursor) {
        pendingInternalChangeRef.current = false;
        return previousState;
      }
      const newValue = originalValue || '';
      if (pendingInternalChangeRef.current) {
        pendingInternalChangeRef.current = false;
        if (previousState.cursorOffset > newValue.length) {
          return {
            cursorOffset: newValue.length,
            cursorWidth: 0,
          };
        }
        return previousState;
      }
      // Parent replaced the whole line (completion, history, submit clear) — keep cursor in sync with buffer.
      return {
        cursorOffset: newValue.length,
        cursorWidth: 0,
      };
    });
  }, [originalValue, focus, showCursor]);

  const cursorActualWidth = highlightPastedText ? cursorWidth : 0;
  const value = mask ? mask.repeat(originalValue.length) : originalValue;
  let renderedValue = value;
  let renderedPlaceholder = placeholder ? chalk.grey(placeholder) : undefined;

  if (showCursor && focus) {
    renderedPlaceholder =
      placeholder.length > 0
        ? chalk.inverse(placeholder[0]) + chalk.grey(placeholder.slice(1))
        : chalk.inverse(' ');
    renderedValue = value.length > 0 ? '' : chalk.inverse(' ');
    let i = 0;
    for (const char of value) {
      renderedValue +=
        i >= cursorOffset - cursorActualWidth && i <= cursorOffset
          ? chalk.inverse(char)
          : char;
      i += 1;
    }
    if (value.length > 0 && cursorOffset === value.length) {
      renderedValue += chalk.inverse(' ');
    }
  }

  useInput(
    (input, key) => {
      if (isControlInputToIgnore(input, key)) {
        return;
      }
      if (key.upArrow ||
          key.downArrow ||
          (key.ctrl && input === 'c') ||
          key.tab ||
          (key.shift && key.tab)) {
        return;
      }
      if (key.return) {
        onSubmit?.(originalValue);
        return;
      }
      let nextCursorOffset = cursorOffset;
      let nextValue = originalValue;
      let nextCursorWidth = 0;
      if (key.leftArrow) {
        if (showCursor) {
          nextCursorOffset -= 1;
        }
      } else if (key.rightArrow) {
        if (showCursor) {
          nextCursorOffset += 1;
        }
      } else if (key.home || (key.ctrl && input === 'a')) {
        nextCursorOffset = 0;
      } else if (key.end || (key.ctrl && input === 'e')) {
        nextCursorOffset = originalValue.length;
      } else if (key.backspace) {
        if (cursorOffset > 0) {
          nextValue =
            originalValue.slice(0, cursorOffset - 1) +
            originalValue.slice(cursorOffset, originalValue.length);
          nextCursorOffset -= 1;
        }
      } else if (key.delete) {
        if (cursorOffset < originalValue.length) {
          nextValue =
            originalValue.slice(0, cursorOffset) +
            originalValue.slice(cursorOffset + 1, originalValue.length);
        }
      } else {
        nextValue =
          originalValue.slice(0, cursorOffset) +
          input +
          originalValue.slice(cursorOffset, originalValue.length);
        nextCursorOffset += input.length;
        if (input.length > 1) {
          nextCursorWidth = input.length;
        }
      }
      if (nextCursorOffset < 0) {
        nextCursorOffset = 0;
      }
      if (nextCursorOffset > nextValue.length) {
        nextCursorOffset = nextValue.length;
      }
      setState({
        cursorOffset: nextCursorOffset,
        cursorWidth: nextCursorWidth,
      });
      if (nextValue !== originalValue) {
        pendingInternalChangeRef.current = true;
        onChange(nextValue);
      }
    },
    { isActive: focus },
  );

  return (
    <Text>
      {placeholder
        ? value.length > 0
          ? renderedValue
          : renderedPlaceholder
        : renderedValue}
    </Text>
  );
}

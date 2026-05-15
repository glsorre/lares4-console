import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import React, { useState } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CommandPane } from '../../src/desktop/components/CommandPane.js';
import { TooltipProvider } from '../../src/components/ui/tooltip.js';
import type { SessionSnapshot } from '../../src/desktop/runtime/session-controller.js';

const stubSnapshot = {
  outputFormat: 'pretty',
  readOnly: false,
} as unknown as SessionSnapshot;

function Harness({ initial = '' }: { initial?: string }) {
  const [cmd, setCmd] = useState(initial);
  return (
    <TooltipProvider>
      <div data-testid="harness" data-value={cmd}>
        <CommandPane
          snapshot={stubSnapshot}
          command={cmd}
          onCommandChange={setCmd}
          onSubmit={() => {}}
          onHistoryUp={() => {}}
          onHistoryDown={() => {}}
        />
      </div>
    </TooltipProvider>
  );
}

function ClearOnSubmitHarness({ initial = 'fo' }: { initial?: string }) {
  const [cmd, setCmd] = useState(initial);
  return (
    <TooltipProvider>
      <div data-testid="harness" data-value={cmd}>
        <CommandPane
          snapshot={stubSnapshot}
          command={cmd}
          onCommandChange={setCmd}
          onSubmit={() => setCmd('')}
          onHistoryUp={() => {}}
          onHistoryDown={() => {}}
        />
      </div>
    </TooltipProvider>
  );
}

afterEach(() => {
  cleanup();
});

describe('CommandPane autocomplete', () => {
  it('fills the input when a suggestion row is clicked', async () => {
    const user = userEvent.setup();
    render(<Harness initial="st" />);

    const input = screen.getByLabelText('Command input') as HTMLInputElement;
    input.focus();

    const option = await screen.findByRole('option', { name: /state/ });
    await user.click(option);

    assert.equal(input.value, 'state ');
    const harness = screen.getByTestId('harness');
    assert.equal(harness.getAttribute('data-value'), 'state ');
  });

  it('completes via Tab as a regression guard', async () => {
    const user = userEvent.setup();
    render(<Harness initial="st" />);

    const input = screen.getByLabelText('Command input') as HTMLInputElement;
    input.focus();
    await user.keyboard('{Tab}');

    assert.equal(input.value, 'state ');
  });

  it('does not reopen suggestions after Enter clears the command', async () => {
    const user = userEvent.setup();
    render(<ClearOnSubmitHarness initial="st" />);

    const input = screen.getByLabelText('Command input') as HTMLInputElement;
    input.focus();
    await screen.findByRole('option', { name: /state/ });

    await user.keyboard('{Enter}');

    assert.equal(input.value, '');
    assert.equal(input.getAttribute('aria-expanded'), 'false');
    assert.equal(screen.queryByRole('option'), null);
  });

  it('does not reopen suggestions after clicking Run', async () => {
    const user = userEvent.setup();
    render(<ClearOnSubmitHarness initial="st" />);

    const input = screen.getByLabelText('Command input') as HTMLInputElement;
    input.focus();
    await screen.findByRole('option', { name: /state/ });

    const runButton = screen.getByRole('button', { name: 'Run' });
    await user.click(runButton);

    assert.equal(input.value, '');
    assert.equal(input.getAttribute('aria-expanded'), 'false');
    assert.equal(screen.queryByRole('option'), null);
  });

  it('reopens suggestions after typing again post-submit', async () => {
    const user = userEvent.setup();
    render(<ClearOnSubmitHarness initial="st" />);

    const input = screen.getByLabelText('Command input') as HTMLInputElement;
    input.focus();
    await screen.findByRole('option', { name: /state/ });
    await user.keyboard('{Enter}');
    assert.equal(screen.queryByRole('option'), null);

    input.focus();
    await user.keyboard('s');

    await screen.findByRole('option', { name: /state/ });
    assert.equal(input.getAttribute('aria-expanded'), 'true');
  });
});

import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import React from 'react';
import { Plug, Terminal } from 'lucide-react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PaneEmpty } from '../../src/desktop/components/PaneEmpty.js';

afterEach(() => {
  cleanup();
});

describe('PaneEmpty', () => {
  it('renders title and description text', () => {
    render(<PaneEmpty icon={Terminal} title="Empty workspace" description="Connect to a panel to begin." />);
    assert.ok(screen.getByText('Empty workspace'));
    assert.ok(screen.getByText('Connect to a panel to begin.'));
  });

  it('omits the CTA button when no cta prop is provided', () => {
    render(<PaneEmpty icon={Terminal} title="No CTA" description="No action." />);
    assert.equal(screen.queryByRole('button'), null);
  });

  it('renders and wires the CTA button onClick', async () => {
    const user = userEvent.setup();
    const onClick = mock.fn();
    render(
      <PaneEmpty
        icon={Terminal}
        title="With CTA"
        description="Click below."
        cta={{ label: 'Open connect', onClick, icon: Plug }}
      />,
    );
    const button = screen.getByRole('button', { name: /open connect/i });
    await user.click(button);
    assert.equal(onClick.mock.callCount(), 1);
  });
});

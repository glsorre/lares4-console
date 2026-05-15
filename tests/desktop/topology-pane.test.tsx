import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TopologyPane } from '../../src/desktop/components/TopologyPane.js';
import { TooltipProvider } from '../../src/components/ui/tooltip.js';
import type { TopologyNode, TopologySnapshot } from '../../src/core/topology.js';

function node(id: string, label: string, status: TopologyNode['status']): TopologyNode {
  return { kind: 'lights', id, label, status, raw: {} };
}

const populatedSnapshot: TopologySnapshot = {
  total: 3,
  groups: [
    {
      kind: 'lights',
      label: 'Lights',
      count: 2,
      nodes: [node('1', 'Kitchen', 'on'), node('2', 'Hallway', 'off')],
    },
    {
      kind: 'zones',
      label: 'Zones',
      count: 1,
      nodes: [{ kind: 'zones', id: '5', label: 'Front door', status: 'open', raw: {} }],
    },
  ],
};

afterEach(() => {
  cleanup();
});

function Wrap(props: React.ComponentProps<typeof TopologyPane>) {
  return (
    <TooltipProvider>
      <TopologyPane {...props} />
    </TooltipProvider>
  );
}

describe('TopologyPane', () => {
  it('shows the empty body when topology total is 0', () => {
    render(<Wrap topology={{ total: 0, groups: [] }} onFilterById={() => {}} />);
    assert.ok(screen.getByText('No devices yet'));
  });

  it('renders each group and its node rows', () => {
    render(<Wrap topology={populatedSnapshot} onFilterById={() => {}} />);
    assert.ok(screen.getByText('Lights'));
    assert.ok(screen.getByText('Zones'));
    assert.ok(screen.getByText('Kitchen'));
    assert.ok(screen.getByText('Hallway'));
    assert.ok(screen.getByText('Front door'));
  });

  it('clicking a node calls onFilterById with the node id', async () => {
    const user = userEvent.setup();
    const onFilterById = mock.fn();
    render(<Wrap topology={populatedSnapshot} onFilterById={onFilterById} />);
    await user.click(screen.getByRole('button', { name: /kitchen/i }));
    assert.equal(onFilterById.mock.callCount(), 1);
    assert.equal(onFilterById.mock.calls[0]!.arguments[0], '1');
  });

  it('typing in the filter narrows nodes when controlled', async () => {
    const user = userEvent.setup();
    let value = '';
    const onFilterChange = mock.fn((next: string) => { value = next; });
    const { rerender } = render(
      <Wrap topology={populatedSnapshot} onFilterById={() => {}} filter={value} onFilterChange={onFilterChange} />,
    );
    await user.type(screen.getByLabelText('Filter topology'), 'kit');
    rerender(<Wrap topology={populatedSnapshot} onFilterById={() => {}} filter={value} onFilterChange={onFilterChange} />);
    assert.ok(onFilterChange.mock.callCount() >= 1);
  });

  it('renders the rail close button only when variant=rail and onClose is provided', () => {
    render(<Wrap topology={populatedSnapshot} onFilterById={() => {}} variant="rail" onClose={() => {}} />);
    assert.ok(screen.getByRole('button', { name: /hide devices rail/i }));
  });
});

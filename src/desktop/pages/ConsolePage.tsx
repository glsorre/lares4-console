import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { Eraser, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CommandPane } from '../components/CommandPane.js';
import { ConnectionSidebar } from '../components/ConnectionSidebar.js';
import { LogDetailPane } from '../components/LogDetailPane.js';
import { LogsListPane } from '../components/LogsListPane.js';
import { useWideLayout } from '../hooks/use-wide-layout.js';
import { formatReplayLabel } from '../runtime/status-chips.js';
import { useSessionController } from '@pro/tabs/context.js';
import type { LayoutOutletContext } from '../AppLayout.js';

export function ConsolePage() {
  const { controller, snapshot } = useSessionController();
  const { sidebarOpen, toggleSidebar } = useOutletContext<LayoutOutletContext>();
  const wide = useWideLayout();
  const [command, setCommand] = useState('');
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);

  const canSubmit = useMemo(() => snapshot.connected && command.trim().length > 0, [snapshot.connected, command]);
  const msgCount = snapshot.logEntries.length;
  useEffect(() => {
    if (snapshot.logEntries.length === 0) return;
    if (selectedId) return;
    const last = snapshot.logEntries[snapshot.logEntries.length - 1];
    if (last?.groupId) setSelectedId(last.groupId);
  }, [snapshot.logEntries, selectedId]);

  const resizeHandleHorizontal = (
    <Separator className="bg-border/80 hover:bg-border focus-visible:ring-ring mx-1.5 w-2 shrink-0 cursor-col-resize rounded-full transition-colors focus-visible:ring-2 focus-visible:outline-none" />
  );

  const resizeHandleVertical = (
    <Separator className="bg-border/80 hover:bg-border focus-visible:ring-ring my-1.5 h-2 shrink-0 cursor-row-resize rounded-full transition-colors focus-visible:ring-2 focus-visible:outline-none" />
  );

  const panelsHorizontal = (
    <Group
      orientation="horizontal"
      id="lares4-console-h"
      className="flex min-h-0 min-w-0 flex-1"
      defaultLayout={{ logs: 40, detail: 60 }}
    >
      <Panel id="logs" minSize="22%" defaultSize="40%" className="min-w-0">
        <div className="flex h-full min-h-0 min-w-0 flex-col pb-0.5">
          <LogsListPane
            entries={snapshot.logEntries}
            selectedId={selectedId}
            onSelect={setSelectedId}
            tagFilters={snapshot.logTagFilters}
            onTagFiltersChange={(next) => controller.setLogTagFilters(next)}
          />
        </div>
      </Panel>
      {resizeHandleHorizontal}
      <Panel id="detail" minSize="22%" defaultSize="60%" className="min-w-0">
        <div className="flex h-full min-h-0 min-w-0 flex-col pb-0.5">
          <LogDetailPane
            entries={snapshot.logEntries}
            selectedId={selectedId}
            outputFormat={snapshot.outputFormat}
            onFormatChange={(fmt) => controller.setOutputFormat(fmt)}
          />
        </div>
      </Panel>
    </Group>
  );

  const panelsVertical = (
    <Group
      orientation="vertical"
      id="lares4-console-v"
      className="flex min-h-0 min-w-0 flex-1"
      defaultLayout={{ logs: 46, detail: 54 }}
    >
      <Panel id="logs" minSize="20%" defaultSize="46%" className="min-w-0">
        <div className="flex h-full min-h-0 min-w-0 flex-col pb-0.5">
          <LogsListPane
            entries={snapshot.logEntries}
            selectedId={selectedId}
            onSelect={setSelectedId}
            tagFilters={snapshot.logTagFilters}
            onTagFiltersChange={(next) => controller.setLogTagFilters(next)}
          />
        </div>
      </Panel>
      {resizeHandleVertical}
      <Panel id="detail" minSize="20%" defaultSize="54%" className="min-w-0">
        <div className="flex h-full min-h-0 min-w-0 flex-col pb-0.5">
          <LogDetailPane
            entries={snapshot.logEntries}
            selectedId={selectedId}
            outputFormat={snapshot.outputFormat}
            onFormatChange={(fmt) => controller.setOutputFormat(fmt)}
          />
        </div>
      </Panel>
    </Group>
  );

  const shellResizeHandle = (
    <Separator className="bg-border/80 hover:bg-border focus-visible:ring-ring mx-1 w-1 shrink-0 cursor-col-resize rounded-full transition-colors focus-visible:ring-2 focus-visible:outline-none" />
  );

  const workspaceContent = (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-3 overflow-hidden px-4 py-4 sm:px-5">
      {/* Toolbar */}
      <div className="border-border/70 bg-pane/40 flex min-h-9 flex-wrap items-center justify-between gap-3 rounded-xl border px-3 py-2 ring-1 ring-border/35">
        <div className="flex min-w-0 flex-wrap items-center gap-3" aria-live="polite">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 shrink-0 p-0 text-muted-foreground"
            onClick={toggleSidebar}
            aria-label={sidebarOpen ? 'Close connections panel' : 'Open connections panel'}
            aria-pressed={sidebarOpen}
          >
            {sidebarOpen
              ? <PanelLeftClose className="size-4" aria-hidden />
              : <PanelLeftOpen className="size-4" aria-hidden />}
          </Button>
          {snapshot.connected && (
            <>
              <span className="text-muted-foreground font-mono text-xs tabular-nums">
                {msgCount} {msgCount === 1 ? 'message' : 'messages'}
              </span>
              {snapshot.replayStatus && snapshot.replayStatus !== 'off' ? (
                <>
                  <span className="text-muted-foreground hidden sm:inline" aria-hidden>·</span>
                  <span className="text-muted-foreground text-xs">
                    Replay <span className="text-foreground font-mono">{formatReplayLabel(snapshot.replayStatus)}</span>
                  </span>
                </>
              ) : null}
            </>
          )}
        </div>
        {snapshot.logEntries.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground h-7 gap-1.5 text-xs"
            onClick={() => controller.clearLogs()}
            aria-label="Clear logs"
            title="Clear log entries"
          >
            <Eraser className="size-3.5" aria-hidden />
            Clear
          </Button>
        )}
      </div>

      {/* Panes */}
      <div className="flex min-h-0 min-w-0 flex-1">
        {wide ? panelsHorizontal : panelsVertical}
      </div>

      {/* Command bar — only when connected */}
      {snapshot.connected && (
        <CommandPane
          snapshot={snapshot}
          command={command}
          onCommandChange={(value) => {
            setCommand(value);
            controller.setCommandLine(value);
          }}
          onSubmit={() => {
            if (!canSubmit) return;
            void controller.submit(command);
            setCommand('');
          }}
          onHistoryUp={() => {
            const next = controller.historyUp(command);
            if (next !== undefined) setCommand(next);
          }}
          onHistoryDown={() => {
            const next = controller.historyDown(command);
            if (next !== undefined) setCommand(next);
          }}
        />
      )}
    </div>
  );

  return (
    <Group
      orientation="horizontal"
      id="lares4-shell"
      className="flex min-h-0 flex-1 overflow-hidden"
      defaultLayout={shellLayout}
      onLayoutChanged={(layout) => {
        try { window.localStorage.setItem('lares4.shellLayout', JSON.stringify(layout)); } catch { /* ignore */ }
      }}
    >
      {sidebarOpen && (
        <>
          <Panel id="sidebar" defaultSize="18%" minSize="14%" maxSize="38%" className="min-w-0">
            <div className="border-border/60 bg-pane/30 flex h-full min-w-0 flex-col overflow-hidden border-r">
              <ConnectionSidebar />
            </div>
          </Panel>
          {shellResizeHandle}
        </>
      )}
      <Panel id="workspace" defaultSize="82%" minSize="40%" className="min-w-0">
        {workspaceContent}
      </Panel>
    </Group>
  );
}

function readShellLayout(): Record<string, number> | undefined {
  try {
    const raw = window.localStorage.getItem('lares4.shellLayout');
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, number>;
    }
  } catch { /* ignore */ }
  return undefined;
}

const shellLayout = readShellLayout();

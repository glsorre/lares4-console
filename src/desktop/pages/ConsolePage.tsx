import { useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { Bookmark as BookmarkIcon, FileSearch } from 'lucide-react';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BookmarksPane } from '@pro/annotations/ui/BookmarksPane.js';
import { CommandPane } from '../components/CommandPane.js';
import { CommercialLicenseDialog } from '../components/CommercialLicenseDialog.js';
import { ConnectionSidebar } from '../components/ConnectionSidebar.js';
import { ConsoleTopBar } from '../components/ConsoleTopBar.js';
import { LogDetailPane } from '../components/LogDetailPane.js';
import { LogsListPane } from '../components/LogsListPane.js';
import { TopologyPane } from '../components/TopologyPane.js';
import { TriggersDialog } from '@pro/triggers/ui/TriggersDialog.js';
import { useWideLayout } from '../hooks/use-wide-layout.js';
import { useSessionController } from '@pro/tabs/context.js';
import type { LayoutOutletContext } from '../AppLayout.js';

type DetailTab = 'detail' | 'bookmarks';

const TOPOLOGY_RAIL_KEY = 'lares4.topologyRailOpen';
const LEGACY_LOG_SOURCE_FILTER_KEY = 'lares4.logSourceFilter';

function isLogSource(value: unknown): value is 'command' | 'lifecycle' | 'wire' {
  return value === 'command' || value === 'lifecycle' || value === 'wire';
}

function consumeLegacySourceTokens(): string[] {
  try {
    const raw = window.localStorage.getItem(LEGACY_LOG_SOURCE_FILTER_KEY);
    if (!raw) return [];
    window.localStorage.removeItem(LEGACY_LOG_SOURCE_FILTER_KEY);
    if (raw === 'all') return [];
    if (isLogSource(raw)) return [`source:${raw}`];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const valid = parsed.filter(isLogSource);
    if (valid.length === 0 || valid.length === 3) return [];
    return valid.map((s) => `source:${s}`);
  } catch {
    return [];
  }
}

export function ConsolePage() {
  const { controller, snapshot } = useSessionController();
  const { sidebarOpen, toggleSidebar } = useOutletContext<LayoutOutletContext>();
  const wide = useWideLayout();
  const [command, setCommand] = useState('');
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [searchInput, setSearchInput] = useState<string>('');
  const [pinnedId, setPinnedId] = useState<string | undefined>(undefined);
  const [detailTab, setDetailTab] = useState<DetailTab>('detail');
  const [triggersOpen, setTriggersOpen] = useState(false);
  const [annotationsLockOpen, setAnnotationsLockOpen] = useState(false);
  const [topologyRailOpen, setTopologyRailOpen] = useState<boolean>(readRailOpen);
  const [railSheetOpen, setRailSheetOpen] = useState(false);
  const [searchPulseKey, setSearchPulseKey] = useState(0);

  const migratedProfilesRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const name = snapshot.activeProfileName ?? '';
    if (migratedProfilesRef.current.has(name)) return;
    migratedProfilesRef.current.add(name);
    const tokens: string[] = [];
    tokens.push(...consumeLegacySourceTokens());
    if (snapshot.logTagFilters !== undefined && snapshot.logTagFilters.length > 0) {
      tokens.push(...snapshot.logTagFilters.map((t) => `tag:${t}`));
      controller.setLogTagFilters(undefined);
    }
    if (tokens.length === 0) return;
    setSearchInput((prev) => {
      const prefix = tokens.join(' ');
      return prev.length === 0 ? prefix : `${prefix} ${prev}`;
    });
    setSearchPulseKey((n) => n + 1);
  }, [snapshot.activeProfileName, snapshot.logTagFilters, controller]);

  const annotationsLicensed = snapshot.licensed.annotations;
  const triggersLicensed = snapshot.licensed.triggers;

  useEffect(() => {
    if (!annotationsLicensed && pinnedId !== undefined) setPinnedId(undefined);
  }, [annotationsLicensed, pinnedId]);

  useEffect(() => {
    try { window.localStorage.setItem(TOPOLOGY_RAIL_KEY, JSON.stringify(topologyRailOpen)); } catch { /* ignore */ }
  }, [topologyRailOpen]);

  const canSubmit = useMemo(() => snapshot.connected && command.trim().length > 0, [snapshot.connected, command]);
  const msgCount = snapshot.logEntries.length;
  const bookmarkedIds = useMemo(
    () => new Set(snapshot.bookmarks.map((b) => b.groupId)),
    [snapshot.bookmarks],
  );

  useEffect(() => {
    if (snapshot.logEntries.length === 0) return;
    if (selectedId) return;
    const last = snapshot.logEntries[snapshot.logEntries.length - 1];
    if (last?.groupId) setSelectedId(last.groupId);
  }, [snapshot.logEntries, selectedId]);

  function filterById(id: string) {
    setSearchInput(`id:${id}`);
    setSearchPulseKey((n) => n + 1);
    if (!wide) setRailSheetOpen(false);
  }

  function selectFromBookmarks(id: string) {
    setSelectedId(id);
    setDetailTab('detail');
  }

  function openBookmarksTab() {
    if (!annotationsLicensed) {
      setAnnotationsLockOpen(true);
      return;
    }
    setDetailTab('bookmarks');
  }

  function openTopologyRail() {
    if (wide) {
      setTopologyRailOpen(true);
    } else {
      setRailSheetOpen(true);
    }
  }

  function closeTopologyRail() {
    if (wide) {
      setTopologyRailOpen(false);
    } else {
      setRailSheetOpen(false);
    }
  }

  function runStateAll() {
    if (!snapshot.connected) return;
    void controller.submit('state all');
  }

  const detailTabs = useMemo(() => {
    const tabs: Array<{ value: DetailTab; label: string; icon: typeof FileSearch; badge?: number; locked?: boolean }> = [
      { value: 'detail', label: 'Detail', icon: FileSearch },
      {
        value: 'bookmarks',
        label: 'Bookmarks',
        icon: BookmarkIcon,
        badge: snapshot.bookmarks.length || undefined,
        locked: !annotationsLicensed,
      },
    ];
    return tabs;
  }, [snapshot.bookmarks.length, annotationsLicensed]);

  const detailContent = (
    <Tabs
      value={detailTab}
      onValueChange={(value) => {
        if (value === 'bookmarks' && !annotationsLicensed) {
          setAnnotationsLockOpen(true);
          return;
        }
        setDetailTab(value as DetailTab);
      }}
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-1.5"
    >
      <TabsList variant="line" className="self-start">
        {detailTabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <TabsTrigger key={tab.value} value={tab.value} className="gap-1.5 text-xs">
              <Icon className="size-3.5" aria-hidden />
              <span>{tab.label}</span>
              {tab.locked && (
                <span className="text-primary text-[0.65rem] font-medium">Unlock</span>
              )}
              {tab.badge !== undefined && (
                <span className="bg-muted text-muted-foreground rounded px-1 font-mono text-[0.6rem] tabular-nums">{tab.badge}</span>
              )}
            </TabsTrigger>
          );
        })}
      </TabsList>
      <TabsContent value="detail" className="flex min-h-0 min-w-0 flex-1 flex-col">
        <LogDetailPane
          entries={snapshot.logEntries}
          selectedId={selectedId}
          outputFormat={snapshot.outputFormat}
          onFormatChange={(fmt) => controller.setOutputFormat(fmt)}
        />
      </TabsContent>
      <TabsContent value="bookmarks" className="flex min-h-0 min-w-0 flex-1 flex-col">
        <BookmarksPane
          bookmarks={snapshot.bookmarks}
          entries={snapshot.logEntries}
          selectedId={selectedId}
          onSelect={selectFromBookmarks}
          onRemove={(groupId: string) => controller.toggleBookmark(groupId)}
          onUpdateNote={(groupId: string, note: string | undefined) => controller.setBookmarkNote(groupId, note)}
          onExport={() => controller.exportBookmarks()}
          isLicensed={annotationsLicensed}
        />
      </TabsContent>
    </Tabs>
  );

  const logsPanelContent = (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <LogsListPane
        entries={snapshot.logEntries}
        selectedId={selectedId}
        onSelect={setSelectedId}
        searchInput={searchInput}
        bookmarkedIds={bookmarkedIds}
        onToggleBookmark={(id) => controller.toggleBookmark(id)}
        pinnedId={pinnedId}
        onPinnedIdChange={setPinnedId}
        annotationsLicensed={annotationsLicensed}
      />
    </div>
  );

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
        {logsPanelContent}
      </Panel>
      {resizeHandleHorizontal}
      <Panel id="detail" minSize="22%" defaultSize="60%" className="min-w-0">
        {detailContent}
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
        {logsPanelContent}
      </Panel>
      {resizeHandleVertical}
      <Panel id="detail" minSize="20%" defaultSize="54%" className="min-w-0">
        {detailContent}
      </Panel>
    </Group>
  );

  const shellResizeHandle = (
    <Separator className="bg-border/80 hover:bg-border focus-visible:ring-ring mx-1 w-1 shrink-0 cursor-col-resize rounded-full transition-colors focus-visible:ring-2 focus-visible:outline-none" />
  );

  const workspaceContent = (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-2 overflow-hidden px-4 py-3 sm:px-5">
      <ConsoleTopBar
        snapshot={snapshot}
        msgCount={msgCount}
        sidebarOpen={sidebarOpen}
        topologyRailOpen={wide ? topologyRailOpen : railSheetOpen}
        bookmarkCount={snapshot.bookmarks.length}
        annotationsLicensed={annotationsLicensed}
        triggersLicensed={triggersLicensed}
        enabledTriggerCount={snapshot.triggers.filter((r) => r.enabled).length}
        searchInput={searchInput}
        onSearchInputChange={setSearchInput}
        searchPulseKey={searchPulseKey}
        onToggleSidebar={toggleSidebar}
        onToggleTopologyRail={openTopologyRail}
        onClearLogs={() => controller.clearLogs()}
        onOpenTriggers={() => setTriggersOpen(true)}
        onOpenBookmarks={openBookmarksTab}
        onSelectTopId={filterById}
      />

      <div className="flex min-h-0 min-w-0 flex-1">
        {wide ? panelsHorizontal : panelsVertical}
      </div>

      <TriggersDialog
        open={triggersOpen}
        onOpenChange={setTriggersOpen}
        triggers={snapshot.triggers}
        onSave={(next: typeof snapshot.triggers) => controller.saveTriggers(next)}
        isLicensed={triggersLicensed}
        disabledReason={
          !triggersLicensed
            ? undefined
            : !snapshot.connected
              ? 'Connect to a panel before editing triggers.'
              : !snapshot.activeProfileName
                ? 'Triggers persist per connection profile. Load a saved profile to keep rules across sessions.'
                : undefined
        }
      />
      <CommercialLicenseDialog
        open={annotationsLockOpen}
        onOpenChange={setAnnotationsLockOpen}
        featureId="annotations"
      />

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

  const sheetRail = !wide && (
    <Sheet open={railSheetOpen} onOpenChange={setRailSheetOpen}>
      <SheetContent side="right" className="w-[88vw] max-w-sm gap-0 p-0">
        <SheetTitle className="sr-only">Devices</SheetTitle>
        <TopologyPane
          topology={snapshot.topology}
          onFilterById={filterById}
          variant="rail"
          onClose={() => setRailSheetOpen(false)}
          onRunStateAll={runStateAll}
          canRunStateAll={snapshot.connected}
        />
      </SheetContent>
    </Sheet>
  );

  return (
    <>
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
        <Panel id="workspace" defaultSize="64%" minSize="40%" className="min-w-0">
          {workspaceContent}
        </Panel>
        {wide && topologyRailOpen && (
          <>
            {shellResizeHandle}
            <Panel id="rail" defaultSize="22%" minSize="16%" maxSize="34%" className="min-w-0">
              <TopologyPane
                topology={snapshot.topology}
                onFilterById={filterById}
                variant="rail"
                onClose={closeTopologyRail}
                onRunStateAll={runStateAll}
                canRunStateAll={snapshot.connected}
              />
            </Panel>
          </>
        )}
      </Group>
      {sheetRail}
    </>
  );
}

function readRailOpen(): boolean {
  try {
    const raw = window.localStorage.getItem(TOPOLOGY_RAIL_KEY);
    if (raw === null) return false;
    const parsed = JSON.parse(raw) as unknown;
    return parsed === true;
  } catch {
    return false;
  }
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

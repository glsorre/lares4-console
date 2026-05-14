import { useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Bell, Bookmark as BookmarkIcon, FileSearch, Lock, PanelRightClose, Search, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { BookmarksPane } from '@pro/annotations/ui/BookmarksPane.js';
import { CommandPane } from '../components/CommandPane.js';
import { CommercialLicenseDialog } from '../components/CommercialLicenseDialog.js';
import { ConnectionSidebar } from '../components/ConnectionSidebar.js';
import { ConsoleTopBar } from '../components/ConsoleTopBar.js';
import { FeatureGateEmptyState } from '../components/FeatureGateEmptyState.js';
import { LogDetailPane } from '../components/LogDetailPane.js';
import { LogsListPane } from '../components/LogsListPane.js';
import { RecentActivityPane, collectRecentDeviceIds } from '../components/RecentActivityPane.js';
import { TopologyPane } from '../components/TopologyPane.js';
import { TriggersPane } from '@pro/triggers/ui/TriggersPane.js';
import { MacrosPane } from '@pro/macros/ui/MacrosPane.js';
import { useWideLayout } from '../hooks/use-wide-layout.js';
import { useSessionController } from '@pro/tabs/context.js';
import type { LayoutOutletContext } from '../AppLayout.js';
import type { FeatureId } from '../runtime/commercial-license-prefs.js';

type DetailTab = 'detail' | 'bookmarks' | 'triggers' | 'macros';

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
  const reduceMotion = useReducedMotion();
  const [command, setCommand] = useState('');
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [searchInput, setSearchInput] = useState<string>('');
  const [pinnedId, setPinnedId] = useState<string | undefined>(undefined);
  const [detailTab, setDetailTab] = useState<DetailTab>('detail');
  const [lockFeature, setLockFeature] = useState<FeatureId | null>(null);
  const [topologyRailOpen, setTopologyRailOpen] = useState<boolean>(readRailOpen);
  const [railSheetOpen, setRailSheetOpen] = useState(false);
  const [searchPulseKey, setSearchPulseKey] = useState(0);
  const [topologyFilter, setTopologyFilter] = useState('');

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

  useEffect(() => {
    if (snapshot.connected) return;
    setDetailTab('detail');
    setTopologyRailOpen(false);
    setRailSheetOpen(false);
  }, [snapshot.connected]);

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

  const macrosLicensed = snapshot.licensed.macros;
  const enabledTriggerCount = snapshot.triggers.filter((r) => r.enabled).length;

  const detailTabs = useMemo(() => {
    const tabs: Array<{
      value: DetailTab;
      label: string;
      icon: typeof FileSearch;
      badge?: number;
      lockFeature?: FeatureId;
    }> = [
      { value: 'detail', label: 'Detail', icon: FileSearch },
      {
        value: 'bookmarks',
        label: 'Bookmarks',
        icon: BookmarkIcon,
        badge: snapshot.bookmarks.length || undefined,
        lockFeature: annotationsLicensed ? undefined : 'annotations',
      },
      {
        value: 'triggers',
        label: 'Triggers',
        icon: Bell,
        badge: enabledTriggerCount || undefined,
        lockFeature: triggersLicensed ? undefined : 'triggers',
      },
      {
        value: 'macros',
        label: 'Macros',
        icon: Zap,
        badge: snapshot.macros.length || undefined,
        lockFeature: macrosLicensed ? undefined : 'macros',
      },
    ];
    return tabs;
  }, [
    snapshot.bookmarks.length,
    snapshot.macros.length,
    enabledTriggerCount,
    annotationsLicensed,
    triggersLicensed,
    macrosLicensed,
  ]);

  function handleTabChange(value: string) {
    setDetailTab(value as DetailTab);
  }

  const detailContent = (
    <Tabs
      value={detailTab}
      onValueChange={handleTabChange}
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-1.5"
    >
      <TabsList variant="line" className="self-start">
        {detailTabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              disabled={!snapshot.connected}
              className="gap-1.5 text-xs"
            >
              <Icon className="size-3.5" aria-hidden />
              <span>{tab.label}</span>
              {tab.lockFeature ? (
                <Lock className="text-muted-foreground size-3" aria-hidden />
              ) : tab.badge !== undefined ? (
                <span className="bg-muted text-muted-foreground rounded px-1 font-mono text-[0.6rem] tabular-nums">{tab.badge}</span>
              ) : null}
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
        {annotationsLicensed ? (
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
        ) : (
          <FeatureGateEmptyState
            featureId="annotations"
            title="Bookmarks are a Pro feature"
            description="Annotate, pin, and export sessions across reconnects."
            onUnlock={() => setLockFeature('annotations')}
          />
        )}
      </TabsContent>
      <TabsContent value="triggers" className="flex min-h-0 min-w-0 flex-1 flex-col">
        {triggersLicensed ? (
          <TriggersPane
            triggers={snapshot.triggers}
            onSave={(next) => controller.saveTriggers(next)}
            isLicensed={triggersLicensed}
            disabledReason={
              !snapshot.connected
                ? 'Connect to a panel before editing triggers.'
                : !snapshot.activeProfileName
                  ? 'Triggers persist per connection profile. Load a saved profile to keep rules across sessions.'
                  : undefined
            }
          />
        ) : (
          <FeatureGateEmptyState
            featureId="triggers"
            title="Triggers are a Pro feature"
            description="Run rules when log lines match. Highlight, mute, alert."
            onUnlock={() => setLockFeature('triggers')}
          />
        )}
      </TabsContent>
      <TabsContent value="macros" className="flex min-h-0 min-w-0 flex-1 flex-col">
        {macrosLicensed ? (
          <MacrosPane isLicensed={macrosLicensed} />
        ) : (
          <FeatureGateEmptyState
            featureId="macros"
            title="Macros are a Pro feature"
            description="Bundle commands into one-shot shortcuts."
            onUnlock={() => setLockFeature('macros')}
          />
        )}
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
        searchInput={searchInput}
        onSearchInputChange={setSearchInput}
        searchPulseKey={searchPulseKey}
        onToggleSidebar={toggleSidebar}
        onToggleTopologyRail={openTopologyRail}
        onClearLogs={() => controller.clearLogs()}
        onSelectTopId={filterById}
      />

      <div className="flex min-h-0 min-w-0 flex-1">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={wide ? 'panels-h' : 'panels-v'}
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="flex min-h-0 min-w-0 flex-1"
          >
            {wide ? panelsHorizontal : panelsVertical}
          </motion.div>
        </AnimatePresence>
      </div>

      {lockFeature && (
        <CommercialLicenseDialog
          open={lockFeature !== null}
          onOpenChange={(open) => { if (!open) setLockFeature(null); }}
          featureId={lockFeature}
        />
      )}

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

  const recentDeviceIds = useMemo(
    () => collectRecentDeviceIds(snapshot.logEntries, snapshot.topology),
    [snapshot.logEntries, snapshot.topology],
  );

  const activitySidebar = (
    <div className="bg-pane/30 border-border/60 flex h-full min-h-0 min-w-0 flex-col overflow-hidden border-l">
      <div className="border-border/60 flex shrink-0 items-center gap-2 border-b px-3 py-1.5">
        <div className="relative flex min-w-0 flex-1 items-center">
          <Search className="text-muted-foreground pointer-events-none absolute left-2 size-3.5" aria-hidden />
          <Input
            type="search"
            placeholder="Filter id, label, state"
            value={topologyFilter}
            onChange={(event) => setTopologyFilter(event.target.value)}
            spellCheck={false}
            className="h-7 pl-7 font-mono text-xs"
            aria-label="Filter topology"
          />
        </div>
        {wide && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground h-7 w-7 shrink-0 p-0"
                onClick={closeTopologyRail}
                aria-label="Hide devices rail"
              >
                <PanelRightClose className="size-4" aria-hidden />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Hide rail</TooltipContent>
          </Tooltip>
        )}
      </div>
      <RecentActivityPane
        entries={snapshot.logEntries}
        topology={snapshot.topology}
        onFilterById={filterById}
      />
      <TopologyPane
        topology={snapshot.topology}
        onFilterById={filterById}
        variant="compact"
        onRunStateAll={runStateAll}
        canRunStateAll={snapshot.connected}
        recentDeviceIds={recentDeviceIds}
        filter={topologyFilter}
        onFilterChange={setTopologyFilter}
      />
    </div>
  );

  const sheetRail = !wide && (
    <Sheet open={railSheetOpen} onOpenChange={setRailSheetOpen}>
      <SheetContent side="right" className="w-[88vw] max-w-sm gap-0 p-0">
        <SheetTitle className="sr-only">Devices</SheetTitle>
        {activitySidebar}
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
              {activitySidebar}
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

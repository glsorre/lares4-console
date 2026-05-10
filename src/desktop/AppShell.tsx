import { useEffect, useMemo, useState } from 'react';
import { SessionController } from './runtime/session-controller.js';
import { CommandPane } from './components/CommandPane.js';
import { LogsListPane } from './components/LogsListPane.js';
import { LogDetailPane } from './components/LogDetailPane.js';
import type { ConnectionProfile } from './runtime/profiles-repository-desktop.js';

const controller = new SessionController();

export function AppShell() {
  const [snapshot, setSnapshot] = useState(controller.snapshot());
  const [command, setCommand] = useState('');
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [ip, setIp] = useState('');
  const [pin, setPin] = useState('');
  const [sender, setSender] = useState('lares4 console');
  const [wss, setWss] = useState(true);
  const [profiles, setProfiles] = useState<ConnectionProfile[]>([]);
  const [defaultProfile, setDefaultProfile] = useState<string | undefined>(undefined);
  const [profileName, setProfileName] = useState('');

  useEffect(() => controller.subscribe(() => setSnapshot(controller.snapshot())), []);

  useEffect(() => {
    void (async () => {
      const data = await controller.listProfiles();
      setProfiles(data.profiles);
      setDefaultProfile(data.defaultProfile);
    })();
  }, []);

  const canSubmit = useMemo(() => snapshot.connected && command.trim().length > 0, [snapshot.connected, command]);

  useEffect(() => {
    if (snapshot.logEntries.length === 0) return;
    if (selectedId) return;
    const last = snapshot.logEntries[snapshot.logEntries.length - 1];
    if (last?.groupId) setSelectedId(last.groupId);
  }, [snapshot.logEntries, selectedId]);

  return (
    <main className="app-root">
      <header className="topbar">
        <h1>lares4 Console</h1>
        <div className="connection-form">
          <select
            value={defaultProfile ?? ''}
            onChange={(event) => {
              const next = profiles.find((profile) => profile.name === event.target.value);
              if (!next) return;
              setDefaultProfile(next.name);
              setProfileName(next.name);
              setIp(next.ip);
              setPin(next.pin);
              setSender(next.sender);
              setWss(next.wss);
            }}
          >
            <option value="">manual</option>
            {profiles.map((profile) => (
              <option key={profile.name} value={profile.name}>{profile.name}</option>
            ))}
          </select>
          <input value={profileName} onChange={(e) => setProfileName(e.target.value)} placeholder="profile name" />
          <input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="ip" />
          <input value={pin} onChange={(e) => setPin(e.target.value)} placeholder="pin" />
          <input value={sender} onChange={(e) => setSender(e.target.value)} placeholder="sender" />
          <label>
            <input type="checkbox" checked={wss} onChange={(e) => setWss(e.target.checked)} />
            wss
          </label>
          <button type="button" onClick={() => void controller.connect({ ip, pin, sender, wss, profileName: profileName || undefined })}>Connect</button>
          <button
            type="button"
            onClick={() => {
              if (!profileName.trim()) return;
              void (async () => {
                await controller.saveProfile({ name: profileName.trim(), ip, pin, sender, wss, makeDefault: true });
                const data = await controller.listProfiles();
                setProfiles(data.profiles);
                setDefaultProfile(data.defaultProfile);
              })();
            }}
          >
            Save profile
          </button>
          <button
            type="button"
            onClick={() => {
              if (!profileName.trim()) return;
              void (async () => {
                await controller.removeProfile(profileName.trim());
                const data = await controller.listProfiles();
                setProfiles(data.profiles);
                setDefaultProfile(data.defaultProfile);
              })();
            }}
          >
            Delete profile
          </button>
          <button type="button" onClick={() => controller.disconnect()}>Disconnect</button>
        </div>
      </header>
      <section className="pane-grid">
        <LogsListPane
          entries={snapshot.logEntries}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        <LogDetailPane
          entries={snapshot.logEntries}
          selectedId={selectedId}
          outputFormat={snapshot.outputFormat}
        />
      </section>
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
    </main>
  );
}

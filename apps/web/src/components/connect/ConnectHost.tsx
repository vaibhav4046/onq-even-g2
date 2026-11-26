import { OutboxStrip } from './OutboxStrip';
import { PairCard } from './PairCard';
import { SourceCards, type ApiSetupSlot } from './SourceCards';
import { ThisComputerPanel } from './ThisComputerPanel';
import type { SourceId } from './hostModel';
import { useHostData } from './useHostData';

export interface ConnectHostProps {
  sessionToken: string | null;
  apiSetup: Partial<Record<SourceId, ApiSetupSlot>>;
  fallbackAiLabel: string;
  fallbackConnected: { connected: number; total: number };
  onTestAll: () => Promise<string>;
  onModelChanged: (message: string) => void;
}

/** The host-first top of Connect: this computer, pairing, per-source routes, outbox. Lazy-loaded from ConnectorsHub. */
export function ConnectHost({ sessionToken, apiSetup, fallbackAiLabel, fallbackConnected, onTestAll, onModelChanged }: ConnectHostProps) {
  const host = useHostData(sessionToken);
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <ThisComputerPanel
          sessionToken={sessionToken}
          profile={host.profile}
          fallbackAiLabel={fallbackAiLabel}
          fallbackConnected={fallbackConnected}
          onTestAll={onTestAll}
          onModelChanged={onModelChanged}
          onScanned={host.loadProfile}
        />
        <PairCard sessionToken={sessionToken} devices={host.devices} onDevicesChanged={host.loadDevices} />
      </div>
      <SourceCards
        sources={host.sources}
        profile={host.profile}
        apiSetup={apiSetup}
        sessionToken={sessionToken}
        onChanged={() => {
          void host.loadSources();
          void host.loadOutbox();
        }}
      />
      <OutboxStrip outbox={host.outbox} sessionToken={sessionToken} onChanged={() => void host.loadOutbox()} />
    </div>
  );
}

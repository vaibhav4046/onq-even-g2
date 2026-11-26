import { useState } from 'react';
import { callApi, inputClass, smallBtnClass } from './api';

interface NotionDatabase {
  id: string;
  title: string;
  url: string;
}

/** Lists the databases the saved Notion token can see, so nobody copies a 32-character ID by hand. */
export function NotionScan({
  sessionToken,
  onSelected,
}: {
  sessionToken: string | null;
  onSelected: (message: string) => void;
}) {
  const [databases, setDatabases] = useState<NotionDatabase[] | null>(null);
  const [picked, setPicked] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const scan = async () => {
    setBusy(true);
    setNote('');
    const out = await callApi<{ databases: NotionDatabase[] }>('/api/connectors/notion/databases', sessionToken, 'POST');
    setBusy(false);
    if (!out.ok) {
      setDatabases(null);
      setNote(
        out.status === 400
          ? 'Paste your Notion token below and save it first, then scan again.'
          : `Database scan: ${out.error}`,
      );
      return;
    }
    const list = out.data.databases ?? [];
    setDatabases(list);
    setPicked(list[0]?.id ?? '');
    if (list.length === 0) setNote('No databases found. In Notion, share a database with your integration, then scan again.');
  };

  const use = async () => {
    const db = databases?.find((d) => d.id === picked);
    if (!db) return;
    setBusy(true);
    const out = await callApi('/api/connectors/notion/select-database', sessionToken, 'POST', { databaseId: db.id });
    setBusy(false);
    if (out.ok) onSelected(`Notion database "${db.title || 'Untitled'}" is now in use.`);
    else setNote(`Could not use that database: ${out.error}`);
  };

  return (
    <div className="space-y-2 min-w-0">
      <div className="flex flex-wrap items-center gap-2 min-w-0">
        <button type="button" disabled={busy} onClick={() => void scan()} className={smallBtnClass}>
          {busy && !databases ? 'Scanning...' : 'Scan my Notion databases'}
        </button>
        {databases && databases.length > 0 && (
          <>
            <select
              aria-label="Notion database"
              value={picked}
              onChange={(e) => setPicked(e.target.value)}
              className={`${inputClass} flex-1 basis-40`}
            >
              {databases.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title || 'Untitled database'}
                </option>
              ))}
            </select>
            <button type="button" disabled={busy || !picked} onClick={() => void use()} className={smallBtnClass}>
              Use this database
            </button>
          </>
        )}
      </div>
      {note && <p className="text-[11px] text-[var(--lightgray)]">{note}</p>}
    </div>
  );
}

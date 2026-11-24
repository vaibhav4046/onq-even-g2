import { registerSecretForRedaction } from '../logger.js';

export interface DiscoveredNotionSchema {
  titleProp: string;
  dateProp?: string;
  completionProp?: string;
  completionKind?: 'checkbox' | 'status';
  doneStatusName?: string;
}

export interface NotionTaskItem {
  pageId: string;
  title: string;
  dueIso?: string;
  completed: boolean;
  lastEdited: string;
}

interface NotionPropertySchema {
  id: string;
  type: string;
  status?: {
    options?: Array<{ name: string }>;
    groups?: Array<{ name: string; option_ids?: string[] }>;
  };
}

/**
 * Automatically discovers title, due-date, and completion (checkbox OR status)
 * properties on ANY existing Notion database with zero user template setup.
 */
export function discoverNotionDatabaseSchema(
  properties: Record<string, NotionPropertySchema>,
): DiscoveredNotionSchema {
  let titleProp = 'Name';
  let dateProp: string | undefined;
  let completionProp: string | undefined;
  let completionKind: 'checkbox' | 'status' | undefined;
  let doneStatusName: string | undefined;

  for (const [name, prop] of Object.entries(properties)) {
    if (prop.type === 'title') {
      titleProp = name;
    } else if (prop.type === 'date' && !dateProp) {
      dateProp = name;
    } else if (prop.type === 'checkbox' && !completionProp) {
      completionProp = name;
      completionKind = 'checkbox';
    } else if (prop.type === 'status' && !completionProp) {
      completionProp = name;
      completionKind = 'status';
      const opts = prop.status?.options ?? [];
      const doneOpt = opts.find((o) => /^(done|complete|completed|closed)$/i.test(o.name.trim()));
      doneStatusName = doneOpt?.name ?? opts[opts.length - 1]?.name ?? 'Done';
    }
  }

  return { titleProp, dateProp, completionProp, completionKind, doneStatusName };
}

export class NotionWorkspaceClient {
  private cachedSchema: DiscoveredNotionSchema | null = null;

  constructor(
    private readonly token: string,
    private readonly databaseId: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    registerSecretForRedaction(token);
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      'Notion-Version': process.env.NOTION_API_VERSION ?? '2022-06-28',
      'Content-Type': 'application/json',
    };
  }

  async getPageLastEdited(pageId: string): Promise<string | undefined> {
    const res = await this.fetchImpl(`https://api.notion.com/v1/pages/${encodeURIComponent(pageId)}`, {
      headers: this.headers(),
    });
    if (!res.ok) return undefined;
    const data = (await res.json()) as { last_edited_time?: string };
    return data.last_edited_time;
  }

  async archivePage(pageId: string): Promise<void> {
    const res = await this.fetchImpl(`https://api.notion.com/v1/pages/${encodeURIComponent(pageId)}`, {
      method: 'PATCH',
      headers: this.headers(),
      body: JSON.stringify({ archived: true }),
    });
    if (!res.ok) throw new Error(`Notion archive failed: HTTP ${res.status}`);
  }

  async unmarkTaskComplete(pageId: string): Promise<void> {
    const schema = await this.inspectSchema();
    if (!schema.completionProp) return;
    const props: Record<string, unknown> =
      schema.completionKind === 'status'
        ? { [schema.completionProp]: { status: { name: 'To Do' } } }
        : { [schema.completionProp]: { checkbox: false } };
    const res = await this.fetchImpl(`https://api.notion.com/v1/pages/${encodeURIComponent(pageId)}`, {
      method: 'PATCH',
      headers: this.headers(),
      body: JSON.stringify({ properties: props }),
    });
    if (!res.ok) throw new Error(`Notion unmark failed: HTTP ${res.status}`);
  }

  async inspectSchema(): Promise<DiscoveredNotionSchema> {
    if (this.cachedSchema) return this.cachedSchema;
    const res = await this.fetchImpl(
      `https://api.notion.com/v1/databases/${encodeURIComponent(this.databaseId)}`,
      { headers: this.headers() },
    );
    if (!res.ok) throw new Error(`Notion inspect failed: HTTP ${res.status}`);
    const data = (await res.json()) as { properties: Record<string, NotionPropertySchema> };
    this.cachedSchema = discoverNotionDatabaseSchema(data.properties ?? {});
    return this.cachedSchema;
  }

  async queryOpenTasks(): Promise<NotionTaskItem[]> {
    const schema = await this.inspectSchema();
    const res = await this.fetchImpl(
      `https://api.notion.com/v1/databases/${encodeURIComponent(this.databaseId)}/query`,
      {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ page_size: 10 }),
      },
    );
    if (!res.ok) throw new Error(`Notion query failed: HTTP ${res.status}`);
    const json = (await res.json()) as {
      results?: Array<{
        id: string;
        last_edited_time: string;
        properties: Record<string, {
          title?: Array<{ plain_text?: string }>;
          date?: { start?: string };
          checkbox?: boolean;
          status?: { name?: string };
        }>;
      }>;
    };

    return (json.results ?? []).map((page) => {
      const titleArr = page.properties[schema.titleProp]?.title ?? [];
      const title = titleArr.map((t) => t.plain_text ?? '').join('').trim() || 'Untitled';
      const dueIso = schema.dateProp ? page.properties[schema.dateProp]?.date?.start : undefined;
      let completed = false;
      if (schema.completionProp && schema.completionKind === 'checkbox') {
        completed = Boolean(page.properties[schema.completionProp]?.checkbox);
      } else if (schema.completionProp && schema.completionKind === 'status') {
        const sName = page.properties[schema.completionProp]?.status?.name ?? '';
        completed = sName.toLowerCase() === (schema.doneStatusName ?? 'done').toLowerCase();
      }
      return { pageId: page.id, title, dueIso, completed, lastEdited: page.last_edited_time };
    });
  }

  async createTask(title: string, dueIso?: string): Promise<NotionTaskItem> {
    const schema = await this.inspectSchema();
    const props: Record<string, unknown> = {
      [schema.titleProp]: {
        title: [{ text: { content: title } }],
      },
    };
    if (schema.dateProp && dueIso) {
      props[schema.dateProp] = { date: { start: dueIso } };
    }
    const res = await this.fetchImpl('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        parent: { database_id: this.databaseId },
        properties: props,
      }),
    });
    if (!res.ok) throw new Error(`Notion create failed: HTTP ${res.status}`);
    const page = (await res.json()) as { id: string; last_edited_time: string };
    return { pageId: page.id, title, dueIso, completed: false, lastEdited: page.last_edited_time };
  }

  async markTaskComplete(pageId: string): Promise<void> {
    const schema = await this.inspectSchema();
    if (!schema.completionProp) return;
    const props: Record<string, unknown> =
      schema.completionKind === 'status'
        ? { [schema.completionProp]: { status: { name: schema.doneStatusName ?? 'Done' } } }
        : { [schema.completionProp]: { checkbox: true } };

    const res = await this.fetchImpl(`https://api.notion.com/v1/pages/${encodeURIComponent(pageId)}`, {
      method: 'PATCH',
      headers: this.headers(),
      body: JSON.stringify({ properties: props }),
    });
    if (!res.ok) throw new Error(`Notion update failed: HTTP ${res.status}`);
  }
}

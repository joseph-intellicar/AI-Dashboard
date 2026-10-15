import { sql, type Kysely } from 'kysely';

/** Version history snapshots (REQUIREMENTS §6.9). Rows older than 30 days are purged by the API. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE dashboard_versions (
      id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      dashboard_id uuid NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
      kind         text NOT NULL CHECK (kind IN
                     ('created', 'edit_session', 'added', 'edited', 'duplicated', 'removed', 'reset', 'restored')),
      summary      text NOT NULL,
      changes      jsonb NOT NULL DEFAULT '[]',
      widgets      jsonb NOT NULL,
      created_at   timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX dashboard_versions_dashboard_idx ON dashboard_versions(dashboard_id, created_at DESC);
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS dashboard_versions;`.execute(db);
}

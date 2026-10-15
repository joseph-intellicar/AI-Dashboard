import { sql, type Kysely } from 'kysely';

/** Adds the `ai_added` version kind: widgets added from Insight AI (REQUIREMENTS §17.7). */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE dashboard_versions DROP CONSTRAINT dashboard_versions_kind_check;
    ALTER TABLE dashboard_versions ADD CONSTRAINT dashboard_versions_kind_check CHECK (kind IN
      ('created', 'edit_session', 'added', 'edited', 'duplicated', 'removed', 'reset', 'restored', 'ai_added'));
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    UPDATE dashboard_versions SET kind = 'added' WHERE kind = 'ai_added';
    ALTER TABLE dashboard_versions DROP CONSTRAINT dashboard_versions_kind_check;
    ALTER TABLE dashboard_versions ADD CONSTRAINT dashboard_versions_kind_check CHECK (kind IN
      ('created', 'edit_session', 'added', 'edited', 'duplicated', 'removed', 'reset', 'restored'));
  `.execute(db);
}

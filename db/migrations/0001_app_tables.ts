import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE users (
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email         text NOT NULL UNIQUE CHECK (email = lower(email)),
      name          text NOT NULL,
      password_hash text NOT NULL,
      created_at    timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE sessions (
      id         text PRIMARY KEY,               -- SHA-256 of the cookie token
      user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL
    );
    CREATE INDEX sessions_user_idx ON sessions(user_id);

    CREATE TABLE dashboards (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id     uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      date_filter jsonb NOT NULL DEFAULT '{"preset":"last_30_days"}',
      created_at  timestamptz NOT NULL DEFAULT now(),
      updated_at  timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE dashboard_widgets (
      id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      dashboard_id uuid NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
      config       jsonb NOT NULL,
      layout_x     int  NOT NULL CHECK (layout_x >= 0),
      layout_y     int  NOT NULL CHECK (layout_y >= 0),
      layout_w     int  NOT NULL CHECK (layout_w BETWEEN 1 AND 12),
      layout_h     int  NOT NULL CHECK (layout_h >= 1),
      created_at   timestamptz NOT NULL DEFAULT now(),
      updated_at   timestamptz NOT NULL DEFAULT now(),
      CHECK (layout_x + layout_w <= 12)
    );
    CREATE INDEX dashboard_widgets_dashboard_idx ON dashboard_widgets(dashboard_id);
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS dashboard_widgets, dashboards, sessions, users;`.execute(db);
}

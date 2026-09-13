CREATE TABLE IF NOT EXISTS users (
 id uuid PRIMARY KEY, email text UNIQUE NOT NULL, name text NOT NULL,
 password text NOT NULL, balance bigint NOT NULL DEFAULT 0 CHECK(balance>=0)
);
CREATE TABLE IF NOT EXISTS sessions (token_hash text PRIMARY KEY, user_id uuid REFERENCES users(id) ON DELETE CASCADE, expires timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS world (id integer PRIMARY KEY CHECK(id=1), data jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS payments (session_id text PRIMARY KEY, user_id uuid REFERENCES users(id), amount integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS activity (id bigserial PRIMARY KEY, user_id uuid REFERENCES users(id), action text NOT NULL, plot_id integer NOT NULL, amount bigint NOT NULL, created_at timestamptz NOT NULL DEFAULT now());

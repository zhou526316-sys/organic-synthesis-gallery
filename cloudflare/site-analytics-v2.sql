CREATE TABLE IF NOT EXISTS site_global_stats_v2 (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  pv INTEGER NOT NULL DEFAULT 0 CHECK (pv >= 0),
  uv INTEGER NOT NULL DEFAULT 0 CHECK (uv >= 0),
  first_viewed_at INTEGER,
  last_viewed_at INTEGER,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS site_daily_stats_v2 (
  beijing_date TEXT PRIMARY KEY,
  pv INTEGER NOT NULL DEFAULT 0 CHECK (pv >= 0),
  uv INTEGER NOT NULL DEFAULT 0 CHECK (uv >= 0),
  first_viewed_at INTEGER,
  last_viewed_at INTEGER,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS site_dimension_daily_stats_v2 (
  dimension_type TEXT NOT NULL CHECK (dimension_type IN ('referrer','device')),
  beijing_date TEXT NOT NULL,
  dimension_value TEXT NOT NULL,
  pv INTEGER NOT NULL DEFAULT 0 CHECK (pv >= 0),
  uv INTEGER NOT NULL DEFAULT 0 CHECK (uv >= 0),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (dimension_type, beijing_date, dimension_value)
);
CREATE INDEX IF NOT EXISTS idx_site_dimension_daily_stats_v2_date
  ON site_dimension_daily_stats_v2(dimension_type, beijing_date);

CREATE TABLE IF NOT EXISTS site_analytics_visitors_v2 (
  scope_type TEXT NOT NULL CHECK (scope_type IN ('global','day','referrer','device','referrer_day','device_day')),
  scope_key TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  first_event_id INTEGER NOT NULL,
  first_viewed_at INTEGER NOT NULL,
  last_viewed_at INTEGER NOT NULL,
  last_seen_date TEXT NOT NULL,
  pageviews INTEGER NOT NULL DEFAULT 1 CHECK (pageviews >= 1),
  paper_open INTEGER NOT NULL DEFAULT 0 CHECK (paper_open IN (0,1)),
  PRIMARY KEY (scope_type, scope_key, ip_hash)
);
CREATE INDEX IF NOT EXISTS idx_site_analytics_visitors_v2_recent
  ON site_analytics_visitors_v2(scope_type, last_seen_date, scope_key);

CREATE TABLE IF NOT EXISTS site_analytics_materialized_events_v2 (
  event_id INTEGER PRIMARY KEY,
  materialized_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS site_analytics_v2_backfill (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  last_event_id INTEGER NOT NULL DEFAULT 0,
  complete INTEGER NOT NULL DEFAULT 0 CHECK (complete IN (0,1)),
  scanned_events INTEGER NOT NULL DEFAULT 0,
  materialized_events INTEGER NOT NULL DEFAULT 0,
  duplicate_events INTEGER NOT NULL DEFAULT 0,
  failed_events INTEGER NOT NULL DEFAULT 0,
  started_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_error TEXT NOT NULL DEFAULT ''
);

-- Phase Hybrid: ensure FTS-backed thesis recommendation schema exists.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS thesis_topics (
  topic_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  area TEXT NOT NULL,
  thesis_type TEXT,
  search_vec TSVECTOR,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE thesis_topics
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS area TEXT,
  ADD COLUMN IF NOT EXISTS thesis_type TEXT,
  ADD COLUMN IF NOT EXISTS search_vec TSVECTOR,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS user_intents (
  intent_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  major TEXT NOT NULL,
  thesis_preference TEXT NOT NULL,
  include_keywords TEXT,
  exclude_keywords TEXT,
  career_aim TEXT,
  interests TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_intents
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS major TEXT,
  ADD COLUMN IF NOT EXISTS thesis_preference TEXT,
  ADD COLUMN IF NOT EXISTS include_keywords TEXT,
  ADD COLUMN IF NOT EXISTS exclude_keywords TEXT,
  ADD COLUMN IF NOT EXISTS career_aim TEXT,
  ADD COLUMN IF NOT EXISTS interests TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS topic_recommendations (
  rec_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  intent_id UUID NOT NULL REFERENCES user_intents(intent_id) ON DELETE CASCADE,
  topic_id UUID NOT NULL REFERENCES thesis_topics(topic_id) ON DELETE RESTRICT,
  final_score NUMERIC(8,6) NOT NULL,
  breakdown JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE topic_recommendations
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS intent_id UUID REFERENCES user_intents(intent_id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS topic_id UUID REFERENCES thesis_topics(topic_id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS final_score NUMERIC(8,6),
  ADD COLUMN IF NOT EXISTS breakdown JSONB,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE OR REPLACE FUNCTION thesis_topics_refresh_search_vec()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.search_vec :=
    setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.area, '')), 'C');
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_thesis_topics_search_vec ON thesis_topics;
CREATE TRIGGER trg_thesis_topics_search_vec
BEFORE INSERT OR UPDATE ON thesis_topics
FOR EACH ROW
EXECUTE FUNCTION thesis_topics_refresh_search_vec();

CREATE INDEX IF NOT EXISTS idx_thesis_topics_search_vec_gin
  ON thesis_topics
  USING GIN (search_vec);

UPDATE thesis_topics
SET search_vec =
  setweight(to_tsvector('english', COALESCE(title, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(description, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(area, '')), 'C'),
    updated_at = COALESCE(updated_at, NOW())
WHERE search_vec IS NULL;

DROP FUNCTION IF EXISTS recommend_best_thesis_topic(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
);

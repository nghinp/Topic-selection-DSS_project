-- Phase Hybrid: ensure FTS-backed thesis recommendation schema exists.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS thesis_topics (
  topic_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  short_description TEXT,
  area TEXT NOT NULL,
  thesis_type TEXT,
  difficulty TEXT,
  interests TEXT[] DEFAULT ARRAY[]::TEXT[],
  detail_content JSONB NOT NULL DEFAULT '{}'::JSONB,
  search_text TEXT,
  search_vec TSVECTOR,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE thesis_topics
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS short_description TEXT,
  ADD COLUMN IF NOT EXISTS area TEXT,
  ADD COLUMN IF NOT EXISTS thesis_type TEXT,
  ADD COLUMN IF NOT EXISTS difficulty TEXT,
  ADD COLUMN IF NOT EXISTS interests TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS detail_content JSONB NOT NULL DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS search_text TEXT,
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
  interests TEXT[] DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'user_intents'
      AND column_name = 'interests'
      AND data_type <> 'ARRAY'
  ) THEN
    ALTER TABLE user_intents
      ALTER COLUMN interests TYPE TEXT[]
      USING CASE
        WHEN interests IS NULL OR BTRIM(interests) = '' THEN ARRAY[]::TEXT[]
        ELSE ARRAY[interests]
      END;
  END IF;
END $$;

ALTER TABLE user_intents
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS major TEXT,
  ADD COLUMN IF NOT EXISTS thesis_preference TEXT,
  ADD COLUMN IF NOT EXISTS include_keywords TEXT,
  ADD COLUMN IF NOT EXISTS exclude_keywords TEXT,
  ADD COLUMN IF NOT EXISTS career_aim TEXT,
  ADD COLUMN IF NOT EXISTS interests TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE user_intents
SET interests = COALESCE(interests, ARRAY[]::TEXT[])
WHERE interests IS NULL;

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
  NEW.detail_content := COALESCE(NEW.detail_content, '{}'::JSONB);
  NEW.interests := COALESCE(NEW.interests, ARRAY[]::TEXT[]);
  NEW.search_text := CONCAT_WS(
    ' ',
    COALESCE(array_to_string(ARRAY(
      SELECT jsonb_array_elements_text(COALESCE(NEW.detail_content->'problemOverview', '[]'::JSONB))
    ), ' '), ''),
    COALESCE(array_to_string(ARRAY(
      SELECT jsonb_array_elements_text(COALESCE(NEW.detail_content->'researchObjectives', '[]'::JSONB))
    ), ' '), ''),
    COALESCE(array_to_string(ARRAY(
      SELECT jsonb_array_elements_text(COALESCE(NEW.detail_content->'methodology', '[]'::JSONB))
    ), ' '), ''),
    COALESCE(array_to_string(ARRAY(
      SELECT jsonb_array_elements_text(COALESCE(NEW.detail_content->'technologies', '[]'::JSONB))
    ), ' '), '')
  );
  NEW.search_vec :=
    setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.short_description, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.area, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW.search_text, '')), 'C');
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
SET detail_content = COALESCE(detail_content, '{}'::JSONB),
    search_text = CONCAT_WS(
      ' ',
      COALESCE(array_to_string(ARRAY(
        SELECT jsonb_array_elements_text(COALESCE(detail_content->'problemOverview', '[]'::JSONB))
      ), ' '), ''),
      COALESCE(array_to_string(ARRAY(
        SELECT jsonb_array_elements_text(COALESCE(detail_content->'researchObjectives', '[]'::JSONB))
      ), ' '), ''),
      COALESCE(array_to_string(ARRAY(
        SELECT jsonb_array_elements_text(COALESCE(detail_content->'methodology', '[]'::JSONB))
      ), ' '), ''),
      COALESCE(array_to_string(ARRAY(
        SELECT jsonb_array_elements_text(COALESCE(detail_content->'technologies', '[]'::JSONB))
      ), ' '), '')
    ),
    search_vec =
      setweight(to_tsvector('english', COALESCE(title, '')), 'A') ||
      setweight(to_tsvector('english', COALESCE(short_description, '')), 'A') ||
      setweight(to_tsvector('english', COALESCE(description, '')), 'B') ||
      setweight(to_tsvector('english', COALESCE(area, '')), 'C') ||
      setweight(
        to_tsvector(
          'english',
          COALESCE(
            CONCAT_WS(
              ' ',
              COALESCE(array_to_string(ARRAY(
                SELECT jsonb_array_elements_text(COALESCE(detail_content->'problemOverview', '[]'::JSONB))
              ), ' '), ''),
              COALESCE(array_to_string(ARRAY(
                SELECT jsonb_array_elements_text(COALESCE(detail_content->'researchObjectives', '[]'::JSONB))
              ), ' '), ''),
              COALESCE(array_to_string(ARRAY(
                SELECT jsonb_array_elements_text(COALESCE(detail_content->'methodology', '[]'::JSONB))
              ), ' '), ''),
              COALESCE(array_to_string(ARRAY(
                SELECT jsonb_array_elements_text(COALESCE(detail_content->'technologies', '[]'::JSONB))
              ), ' '), '')
            ),
            ''
          )
        ),
        'C'
      ),
    interests = COALESCE(interests, ARRAY[]::TEXT[]),
    updated_at = COALESCE(updated_at, NOW())
WHERE search_vec IS NULL OR interests IS NULL OR detail_content IS NULL OR search_text IS NULL;

DROP FUNCTION IF EXISTS recommend_best_thesis_topic(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
);

-- Normalize legacy interests to the fixed taxonomy used by frontend/backend validation.
-- Ambiguous labels that do not map cleanly to the fixed taxonomy are dropped.
WITH normalized_thesis_topic_interests AS (
  SELECT
    topic_id,
    ARRAY(
      SELECT DISTINCT normalized_interest
      FROM (
        SELECT CASE raw_interest
          WHEN 'Artificial Intelligence' THEN 'Artificial Intelligence'
          WHEN 'Business & Economics' THEN 'Business & Economics'
          WHEN 'Cybersecurity' THEN 'Cybersecurity'
          WHEN 'Data Science & Analytics' THEN 'Data Science & Analytics'
          WHEN 'Education & Learning' THEN 'Education & Learning'
          WHEN 'Finance & Accounting' THEN 'Finance & Accounting'
          WHEN 'Game Development & Graphics' THEN 'Game Development & Graphics'
          WHEN 'IoT & Robotics' THEN 'IoT & Robotics'
          WHEN 'Marketing & Media' THEN 'Marketing & Media'
          WHEN 'Mathematics & Statistics' THEN 'Mathematics & Statistics'
          WHEN 'Medicine & Health' THEN 'Medicine & Health'
          WHEN 'Psychology' THEN 'Psychology'
          WHEN 'Sustainability & Environment' THEN 'Sustainability & Environment'
          WHEN 'Game Development' THEN 'Game Development & Graphics'
          WHEN 'Computer Vision' THEN 'Artificial Intelligence'
          WHEN 'Computer Vision & Multimedia' THEN 'Artificial Intelligence'
          WHEN 'Management & Leadership' THEN 'Business & Economics'
          WHEN 'Marketing, Communication & Media' THEN 'Marketing & Media'
          WHEN 'Communication' THEN 'Marketing & Media'
          WHEN 'Languages & Communication' THEN 'Marketing & Media'
          WHEN 'Design' THEN 'Game Development & Graphics'
          WHEN 'Networks' THEN 'Cybersecurity'
          WHEN 'Agriculture' THEN 'Sustainability & Environment'
          WHEN 'Transportation' THEN 'Sustainability & Environment'
          WHEN 'Tourism & Hospitality' THEN 'Business & Economics'
          ELSE NULL
        END AS normalized_interest
        FROM unnest(COALESCE(thesis_topics.interests, ARRAY[]::TEXT[])) AS raw_interest
      ) mapped
      WHERE normalized_interest IS NOT NULL
      ORDER BY normalized_interest
    ) AS normalized_interests
  FROM thesis_topics
)
UPDATE thesis_topics tt
SET interests = nti.normalized_interests,
    updated_at = NOW()
FROM normalized_thesis_topic_interests nti
WHERE tt.topic_id = nti.topic_id
  AND tt.interests IS DISTINCT FROM nti.normalized_interests;

WITH normalized_user_intent_interests AS (
  SELECT
    intent_id,
    ARRAY(
      SELECT DISTINCT normalized_interest
      FROM (
        SELECT CASE raw_interest
          WHEN 'Artificial Intelligence' THEN 'Artificial Intelligence'
          WHEN 'Business & Economics' THEN 'Business & Economics'
          WHEN 'Cybersecurity' THEN 'Cybersecurity'
          WHEN 'Data Science & Analytics' THEN 'Data Science & Analytics'
          WHEN 'Education & Learning' THEN 'Education & Learning'
          WHEN 'Finance & Accounting' THEN 'Finance & Accounting'
          WHEN 'Game Development & Graphics' THEN 'Game Development & Graphics'
          WHEN 'IoT & Robotics' THEN 'IoT & Robotics'
          WHEN 'Marketing & Media' THEN 'Marketing & Media'
          WHEN 'Mathematics & Statistics' THEN 'Mathematics & Statistics'
          WHEN 'Medicine & Health' THEN 'Medicine & Health'
          WHEN 'Psychology' THEN 'Psychology'
          WHEN 'Sustainability & Environment' THEN 'Sustainability & Environment'
          WHEN 'Game Development' THEN 'Game Development & Graphics'
          WHEN 'Computer Vision' THEN 'Artificial Intelligence'
          WHEN 'Computer Vision & Multimedia' THEN 'Artificial Intelligence'
          WHEN 'Management & Leadership' THEN 'Business & Economics'
          WHEN 'Marketing, Communication & Media' THEN 'Marketing & Media'
          WHEN 'Communication' THEN 'Marketing & Media'
          WHEN 'Languages & Communication' THEN 'Marketing & Media'
          WHEN 'Design' THEN 'Game Development & Graphics'
          WHEN 'Networks' THEN 'Cybersecurity'
          WHEN 'Agriculture' THEN 'Sustainability & Environment'
          WHEN 'Transportation' THEN 'Sustainability & Environment'
          WHEN 'Tourism & Hospitality' THEN 'Business & Economics'
          ELSE NULL
        END AS normalized_interest
        FROM unnest(COALESCE(user_intents.interests, ARRAY[]::TEXT[])) AS raw_interest
      ) mapped
      WHERE normalized_interest IS NOT NULL
      ORDER BY normalized_interest
    ) AS normalized_interests
  FROM user_intents
)
UPDATE user_intents ui
SET interests = nui.normalized_interests
FROM normalized_user_intent_interests nui
WHERE ui.intent_id = nui.intent_id
  AND ui.interests IS DISTINCT FROM nui.normalized_interests;

ALTER TABLE thesis_topics
  DROP CONSTRAINT IF EXISTS thesis_topics_interests_allowed;

ALTER TABLE thesis_topics
  ADD CONSTRAINT thesis_topics_interests_allowed
  CHECK (
    COALESCE(interests, ARRAY[]::TEXT[]) <@ ARRAY[
      'Artificial Intelligence',
      'Business & Economics',
      'Cybersecurity',
      'Data Science & Analytics',
      'Education & Learning',
      'Finance & Accounting',
      'Game Development & Graphics',
      'IoT & Robotics',
      'Marketing & Media',
      'Mathematics & Statistics',
      'Medicine & Health',
      'Psychology',
      'Sustainability & Environment'
    ]::TEXT[]
  );

ALTER TABLE user_intents
  DROP CONSTRAINT IF EXISTS user_intents_interests_allowed;

ALTER TABLE user_intents
  ADD CONSTRAINT user_intents_interests_allowed
  CHECK (
    COALESCE(interests, ARRAY[]::TEXT[]) <@ ARRAY[
      'Artificial Intelligence',
      'Business & Economics',
      'Cybersecurity',
      'Data Science & Analytics',
      'Education & Learning',
      'Finance & Accounting',
      'Game Development & Graphics',
      'IoT & Robotics',
      'Marketing & Media',
      'Mathematics & Statistics',
      'Medicine & Health',
      'Psychology',
      'Sustainability & Environment'
    ]::TEXT[]
  );

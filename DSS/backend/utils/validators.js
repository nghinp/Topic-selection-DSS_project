import {
  ALLOWED_DIFFICULTIES,
  ALLOWED_INTERESTS,
  ALLOWED_MAJORS,
  ALLOWED_PREFERENCES,
  ALLOWED_TOPIC_AREAS,
  ALLOWED_TOPIC_THESIS_TYPES
} from '../config/validationConstants.js';
import { HYBRID_RECOMMENDATION_CONFIG } from '../config/hybridRecommendationConfig.js';
import { isUuid } from './crypto.js';

const ALLOWED_MAJORS_SET = new Set(ALLOWED_MAJORS);
const ALLOWED_PREFERENCES_SET = new Set(ALLOWED_PREFERENCES);
const ALLOWED_TOPIC_THESIS_TYPES_SET = new Set(ALLOWED_TOPIC_THESIS_TYPES);
const ALLOWED_TOPIC_AREAS_SET = new Set(ALLOWED_TOPIC_AREAS);
const ALLOWED_INTERESTS_SET = new Set(ALLOWED_INTERESTS);
const ALLOWED_DIFFICULTIES_SET = new Set(ALLOWED_DIFFICULTIES);

export function normalizeText(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

export function normalizeWhitespace(value) {
  return normalizeText(value).replace(/\s+/g, ' ');
}

export function normalizePreference(value) {
  const raw = normalizeText(value);
  if (!raw) return '';
  if (raw.toLowerCase() === 'research') return 'Research';
  if (raw.toLowerCase() === 'practical') return 'Practical';
  return raw;
}

export function normalizeDifficulty(value) {
  const normalized = normalizeText(value);
  if (!normalized) return { value: null };
  if (!ALLOWED_DIFFICULTIES_SET.has(normalized)) {
    return { error: { status: 400, message: 'difficulty must be Beginner, Intermediate, or Advanced' } };
  }
  return { value: normalized };
}

export function normalizeDetailContent(value) {
  const empty = {
    problemOverview: [],
    researchObjectives: [],
    methodology: [],
    technologies: []
  };
  if (value === undefined || value === null) {
    return { value: empty };
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    return { error: { status: 400, message: 'detailContent must be an object' } };
  }

  const normalizeSection = (sectionValue, sectionName) => {
    if (sectionValue === undefined || sectionValue === null) return [];
    if (!Array.isArray(sectionValue)) {
      throw new Error(`${sectionName} must be an array of strings`);
    }
    return sectionValue.map((item) => {
      if (typeof item !== 'string') {
        throw new Error(`${sectionName} must be an array of strings`);
      }
      return normalizeWhitespace(item);
    }).filter(Boolean);
  };

  try {
    return {
      value: {
        problemOverview: normalizeSection(value.problemOverview, 'problemOverview'),
        researchObjectives: normalizeSection(value.researchObjectives, 'researchObjectives'),
        methodology: normalizeSection(value.methodology, 'methodology'),
        technologies: normalizeSection(value.technologies, 'technologies')
      }
    };
  } catch (err) {
    return { error: { status: 400, message: err.message || 'detailContent is invalid' } };
  }
}

export function normalizeInterestArray(value, options = {}) {
  const { maxItems = null, label = 'interests' } = options;
  if (value === undefined || value === null) {
    return { value: [] };
  }
  if (!Array.isArray(value)) {
    return { error: { status: 400, message: 'selectedInterests/interests must be an array of strings' } };
  }

  const deduped = [];
  const seen = new Set();
  for (const item of value) {
    if (item === null || typeof item !== 'string') {
      continue;
    }
    const normalized = item.trim();
    if (!normalized) continue;
    if (!ALLOWED_INTERESTS_SET.has(normalized)) {
      continue;
    }
    if (!seen.has(normalized)) {
      seen.add(normalized);
      deduped.push(normalized);
    }
  }

  if (maxItems !== null && deduped.length > maxItems) {
    return { error: { status: 400, message: `${label} can have at most ${maxItems} items` } };
  }

  return { value: deduped };
}

export function tokenizeKeywords(value) {
  const normalized = normalizeWhitespace(value ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ');

  const tokens = normalized
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !HYBRID_RECOMMENDATION_CONFIG.stopwords.includes(token));

  return new Set(tokens);
}

export function extractUserTokens({ major, includeKeywords, careerAim }) {
  const combined = [includeKeywords, careerAim, major].filter(Boolean).join(' ');
  return [...tokenizeKeywords(combined)];
}

export function buildUserQuery({ major, includeKeywords, careerAim }) {
  return normalizeWhitespace([includeKeywords, careerAim, major].filter(Boolean).join(' '));
}

export function buildHybridExplanation({
  topicTitle,
  area,
  thesisType,
  topicInterests,
  selectedInterests,
  thesisPreference,
  coverage,
  interestMatchScore,
  topicRankNorm,
  inferredType
}) {
  const coverageText = coverage === null ? 'keyword coverage was skipped because no extracted tokens remained after normalization' : `coverage reached ${(coverage * 100).toFixed(0)}%`;
  const interestMatchPercent = interestMatchScore !== null ? (interestMatchScore * 100).toFixed(0) : '0';
  const interestText =
    selectedInterests.length
      ? interestMatchScore === null
        ? 'Structured interest matching was not applied.'
        : topicInterests.length
          ? `Structured interests matched ${interestMatchPercent}% of your selected tags.`
          : 'No structured topic interests were stored, so interest matching contributed 0%.'
      : 'No structured interest filter was applied.';
  const preferenceText =
    thesisType
      ? `The thesis type matched the requested ${thesisPreference.toLowerCase()} preference.`
      : inferredType && inferredType !== 'Unknown'
        ? `The topic has no stored thesis type, but cue validation leaned ${inferredType.toLowerCase()}.`
        : 'The topic passed the thesis-type filter.';

  const rankPercent = (topicRankNorm * 100).toFixed(0);
  return `${topicTitle} was selected because it survived the ${area} major filter, ${coverageText}, ranked highest on full-text relevance (${rankPercent}% normalized), and ${interestText} ${preferenceText}`;
}

export function normalizeUserId(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return isUuid(trimmed) ? trimmed : null;
}

export function parseRecommendationInput({
  body,
  reqUserId,
  normalizeLongText = (val) => normalizeWhitespace(val)
}) {
  const major = normalizeText(body.major).toUpperCase();
  const thesisPreference = normalizePreference(body.thesisPreference);
  const includeKeywords = normalizeLongText(body.includeKeywords);
  const excludeKeywords = normalizeLongText(body.excludeKeywords);
  const careerAim = normalizeLongText(body.careerAim);
  
  if (!ALLOWED_MAJORS_SET.has(major)) {
    return { error: { status: 400, message: 'major must be one of IT, CS, DS' } };
  }
  if (!ALLOWED_PREFERENCES_SET.has(thesisPreference)) {
    return { error: { status: 400, message: 'thesisPreference must be Research or Practical' } };
  }
  
  const selectedInterests = normalizeInterestArray(body.selectedInterests, { maxItems: 3, label: 'selected interests' });
  if (selectedInterests.error) {
    return { error: selectedInterests.error };
  }

  const requestedUserId = normalizeUserId(body.userId);

  if (reqUserId && requestedUserId && reqUserId !== requestedUserId) {
    return { error: { status: 403, message: 'Cannot create recommendation for another user' } };
  }

  return {
    major,
    thesisPreference,
    includeKeywords,
    excludeKeywords,
    careerAim,
    selectedInterests: selectedInterests.value,
    effectiveUserId: reqUserId || requestedUserId || null
  };
}

export {
  ALLOWED_MAJORS_SET,
  ALLOWED_PREFERENCES_SET,
  ALLOWED_TOPIC_THESIS_TYPES_SET,
  ALLOWED_TOPIC_AREAS_SET,
  ALLOWED_INTERESTS_SET,
  ALLOWED_DIFFICULTIES_SET
};

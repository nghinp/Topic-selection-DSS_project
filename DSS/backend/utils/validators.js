import {
  ALLOWED_DIFFICULTIES,
  ALLOWED_INTERESTS,
  ALLOWED_MAJORS,
  ALLOWED_PREFERENCES,
  ALLOWED_TOPIC_AREAS,
  ALLOWED_TOPIC_THESIS_TYPES
} from '../config/validationConstants.js';
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

export function normalizeUserId(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return isUuid(trimmed) ? trimmed : null;
}

export {
  ALLOWED_MAJORS_SET,
  ALLOWED_PREFERENCES_SET,
  ALLOWED_TOPIC_THESIS_TYPES_SET,
  ALLOWED_TOPIC_AREAS_SET,
  ALLOWED_INTERESTS_SET,
  ALLOWED_DIFFICULTIES_SET
};

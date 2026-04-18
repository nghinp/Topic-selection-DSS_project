import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { pool } from '../config/database.js';
import { requireAuth } from '../middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Load Configs
const loadJson = (filename) => JSON.parse(fs.readFileSync(path.join(__dirname, '../config', filename), 'utf8'));

const step2Specializations = loadJson('step2-specializations.json');
const step3ApplicationDirections = loadJson('step3-application-directions.json');
const step4SkillReadiness = loadJson('step4-skill-readiness.json');
const templateConfig = loadJson('template.json');

const STOP_WORDS = new Set([
    'system', 'systems', 'support', 'management', 'tools', 'tool', 'analysis', 'analytics',
    'development', 'application', 'applications', 'services', 'service', 'platform', 'platforms',
    'operations', 'app', 'apps', 'web', 'based', 'design', 'implementation', 'data', 'using',
    'online', 'software', 'technology', 'technologies', 'engineering', 'solutions', 'solution',
    'framework', 'frameworks', 'smart', 'interface', 'digital'
]);

const FEATURE_TAG_LIMIT = 3;

const normalizeKeyword = (value = '') => value
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const escapeRegExp = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const tokenize = (value = '') => normalizeKeyword(value).split(/\s+/).filter(Boolean);

const containsExcludedPhrase = (text, excludedPhrases = []) => {
    const normalizedText = normalizeKeyword(text);
    if (!normalizedText) return false;

    return excludedPhrases.some((phrase) => {
        const normalizedPhrase = normalizeKeyword(phrase);
        if (!normalizedPhrase) return false;
        const pattern = new RegExp(`(^|\\s)${escapeRegExp(normalizedPhrase).replace(/\s+/g, '\\s+')}($|\\s)`, 'i');
        return pattern.test(normalizedText);
    });
};

const extractWords = (list) => {
    const words = new Set();
    list.forEach((phrase) => {
        tokenize(phrase).forEach((word) => {
            if (word.length > 2 && !STOP_WORDS.has(word)) {
                words.add(word);
            }
        });
    });
    return [...words];
};

const scorePhraseMatch = (source, target) => {
    const sourceNorm = normalizeKeyword(source);
    const targetNorm = normalizeKeyword(target);
    if (!sourceNorm || !targetNorm) return 0;
    if (sourceNorm === targetNorm) return 3;
    if (targetNorm.includes(sourceNorm) || sourceNorm.includes(targetNorm)) return 2;

    const sourceTokens = tokenize(sourceNorm);
    const targetTokens = tokenize(targetNorm);
    const intersection = sourceTokens.filter((token) => targetTokens.includes(token));
    const coverage = intersection.length / Math.max(sourceTokens.length, 1);

    return intersection.length > 0 && coverage >= 0.6 ? 1 : 0;
};

const toTitleCase = (str) => {
    const stopWords = ['a', 'an', 'the', 'in', 'on', 'at', 'with', 'for', 'of', 'and', 'to'];
    return str.split(' ').map((word, index) => {
        if (word.length === 0) return word;
        if (/[A-Z]/.test(word.substring(1))) return word;
        if (index > 0 && stopWords.includes(word.toLowerCase())) return word.toLowerCase();
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }).join(' ');
};

const FEATURE_TAG_DEFINITIONS = [
    {
        id: 'real_time',
        label: 'Real-Time',
        description: 'Favor low-latency, live, or streaming-oriented topic variants.',
        keywords: ['real-time monitoring', 'real-time sensing', 'real-time inference', 'low-latency processing']
    },
    {
        id: 'mobile',
        label: 'Mobile',
        description: 'Favor mobile-accessible or mobile-centric system variants.',
        keywords: ['Mobile Application', 'mobile-friendly access', 'mobile learning support']
    },
    {
        id: 'privacy_preserving',
        label: 'Privacy-Preserving',
        description: 'Favor privacy-aware, secure, or data-protection-oriented topic variants.',
        keywords: ['privacy preservation', 'privacy-preserving verification', 'academic data privacy', 'secure record sharing']
    },
    {
        id: 'edge_based',
        label: 'Edge-Based',
        description: 'Favor edge inference, edge deployment, or on-device processing variants.',
        keywords: ['edge inference', 'edge inference acceleration', 'low-latency processing']
    },
    {
        id: 'energy_efficient',
        label: 'Energy-Efficient',
        description: 'Favor power-aware or resource-efficient implementations.',
        keywords: ['energy-efficient monitoring', 'power optimization', 'resource-efficient processing']
    },
    {
        id: 'low_cost',
        label: 'Low-Cost',
        description: 'Favor affordable, lightweight, or resource-conscious system variants.',
        keywords: ['low-cost deployment', 'resource-efficient processing', 'energy-efficient monitoring']
    },
    {
        id: 'cloud_enabled',
        label: 'Cloud-Enabled',
        description: 'Favor distributed, cloud-backed, or service-oriented system variants.',
        keywords: ['cloud deployment', 'cloud-enabled integration', 'distributed services']
    },
    {
        id: 'user_friendly',
        label: 'User-Friendly',
        description: 'Favor accessible, intuitive, or experience-oriented system variants.',
        keywords: ['user-friendly design', 'interactive visualization', 'progress tracking']
    }
].map((tag) => ({
    ...tag,
    normalizedKeywords: tag.keywords.map((keyword) => normalizeKeyword(keyword))
}));

const FEATURE_TAGS_BY_ID = new Map(FEATURE_TAG_DEFINITIONS.map((tag) => [tag.id, tag]));

const WEB_PLATFORM_SPECIALIZATIONS = new Set([
    'web_application_development',
    'mobile_application_development',
    'enterprise_systems_erp',
    'microservices_architecture',
    'devops_cloud_systems',
    'chatbot_qa_systems',
    'search_information_retrieval_systems'
]);

const matchesFeatureTagKeyword = (value, featureTag) => {
    const normalizedValue = normalizeKeyword(value);
    return featureTag.normalizedKeywords.some((keyword) =>
        normalizedValue.includes(keyword) ||
        keyword.includes(normalizedValue) ||
        scorePhraseMatch(normalizedValue, keyword) > 0
    );
};

const candidateMatchesFeatureTag = (candidate, featureTag) => {
    const values = [candidate.text, ...Object.values(candidate.components || {})].filter(Boolean);
    return values.some((value) => matchesFeatureTagKeyword(value, featureTag));
};

const getDirectionalTemplatePreferences = ({ specializationId, thesisType, directionGroupId, directionOptionId }) => {
    if (!WEB_PLATFORM_SPECIALIZATIONS.has(specializationId)) {
        return null;
    }

    if (directionGroupId === 'security_privacy_compliance') {
        if (thesisType === 'Research') {
            return ['D2', 'D4', 'B6', 'A3'];
        }
        return ['D2', 'D4', 'D1', 'A3', 'A4'];
    }

    if (directionOptionId === 'identity_management') {
        if (thesisType === 'Research') {
            return ['D2', 'D4', 'B6', 'A3'];
        }
        return ['D2', 'D4', 'D1', 'A3', 'A4'];
    }

    return null;
};

const getBestLabelMatch = (text, labels) => labels.reduce((best, label) => {
    const score = scorePhraseMatch(text, label);
    return score > best.score ? { label, score } : best;
}, { label: null, score: 0 });

const hasCompetingHighSignalConflict = ({ text, selectedMatch, strongestOther }) => {
    if (!strongestOther || strongestOther.score < 2) return false;
    if (strongestOther.score > selectedMatch.score) return true;

    const normalizedText = normalizeKeyword(text);
    const selectedLabelNorm = normalizeKeyword(selectedMatch.label || '');
    const otherLabelNorm = normalizeKeyword(strongestOther.label || '');

    return (
        selectedMatch.score >= 2 &&
        strongestOther.score === selectedMatch.score &&
        selectedLabelNorm &&
        otherLabelNorm &&
        selectedLabelNorm !== otherLabelNorm &&
        normalizedText.includes(selectedLabelNorm) &&
        normalizedText.includes(otherLabelNorm)
    );
};

const findSpecializationConflict = ({ text, selectedGroup, selectedOption }) => {
    if (!selectedGroup || !selectedOption) return null;

    const selectedLabels = [selectedOption.label, selectedOption.id.replace(/_/g, ' ')];
    const selectedMatch = getBestLabelMatch(text, selectedLabels);

    const otherMatches = selectedGroup.options
        .filter((option) => option.id !== selectedOption.id)
        .map((option) => {
            const bestMatch = getBestLabelMatch(text, [option.label, option.id.replace(/_/g, ' ')]);
            return {
                option,
                score: bestMatch.score,
                label: bestMatch.label
            };
        })
        .sort((a, b) => b.score - a.score);

    const strongestOther = otherMatches[0];
    if (hasCompetingHighSignalConflict({ text, selectedMatch, strongestOther })) {
        return `conflicts with specialization "${selectedOption.label}" because it matches "${strongestOther.option.label}"`;
    }

    return null;
};

const findCrossGroupSpecializationConflict = ({ text, selectedGroup, selectedOption, allGroups }) => {
    if (!selectedGroup || !selectedOption) return null;

    const selectedLabels = [
        selectedOption.label,
        selectedOption.id.replace(/_/g, ' '),
        selectedGroup.label,
        ...(selectedGroup.keywords || [])
    ];
    const selectedMatch = getBestLabelMatch(text, selectedLabels);

    const otherMatches = allGroups
        .filter((group) => group.groupId !== selectedGroup.groupId)
        .map((group) => {
            const labels = [
                group.label,
                ...(group.keywords || []).filter((keyword) => tokenize(keyword).length >= 2),
                ...group.options.map((option) => option.label),
                ...group.options.map((option) => option.id.replace(/_/g, ' '))
            ];
            const bestMatch = getBestLabelMatch(text, labels);
            return {
                group,
                score: bestMatch.score,
                label: bestMatch.label
            };
        })
        .sort((a, b) => b.score - a.score);

    const strongestOther = otherMatches[0];
    if (hasCompetingHighSignalConflict({ text, selectedMatch, strongestOther })) {
        return `conflicts with specialization "${selectedOption.label}" because it matches specialization group "${strongestOther.group.label}"`;
    }

    return null;
};

const findDirectionConflict = ({ text, selectedGroup, selectedOption, allGroups }) => {
    if (!selectedGroup || !selectedOption) return null;

    const selectedLabels = [
        selectedOption.label,
        selectedOption.id.replace(/_/g, ' '),
        selectedGroup.label,
        ...(selectedGroup.keywords || [])
    ];
    const selectedMatch = getBestLabelMatch(text, selectedLabels);

    const otherMatches = allGroups
        .filter((group) => group.groupId !== selectedGroup.groupId)
        .map((group) => {
            const labels = [
                group.label,
                ...(group.keywords || []).filter((keyword) => tokenize(keyword).length >= 2),
                ...group.options.map((option) => option.label),
                ...group.options.map((option) => option.id.replace(/_/g, ' '))
            ];
            const bestMatch = getBestLabelMatch(text, labels);
            return {
                group,
                score: bestMatch.score,
                label: bestMatch.label
            };
        })
        .sort((a, b) => b.score - a.score);

    const strongestOther = otherMatches[0];
    if (hasCompetingHighSignalConflict({ text, selectedMatch, strongestOther })) {
        return `conflicts with application direction "${selectedOption.label}" because it matches "${strongestOther.group.label}"`;
    }

    return null;
};

const countKeywordMatches = (text, keywords) => {
    const normalizedText = normalizeKeyword(text);
    return keywords.filter((keyword) => normalizedText.includes(keyword)).length;
};

const getSpecializationSlotPool = (templateConfig, specializationId, slot) => {
    const specializationPools = templateConfig.specializationComponentPools || {};
    const slotPool = specializationPools?.[specializationId]?.[slot];
    if (Array.isArray(slotPool) && slotPool.length > 0) {
        return slotPool;
    }
    return templateConfig.componentPools[slot] || ["System", "Method"];
};

// Map specialization groupId to template area id
const groupIdToAreaMap = {
    "ai_intelligent_systems": "ai_intelligent_systems",
    "data_science_analytics": "data_science_analytics",
    "computer_vision_multimedia": "computer_vision_multimedia",
    "web_software_platform_systems": "web_software_platform",
    "cybersecurity_trust_systems": "cybersecurity_trust",
    "iot_embedded_edge_systems": "iot_embedded_edge",
    "hardware_architecture_fpga": "hardware_architecture_fpga",
    "graphics_games_vrar_hci": "graphics_games_hci",
    "blockchain_distributed_trust": "blockchain_distributed_trust",
    "nlp_language_conversational_systems": "nlp_language_conversational"
};

const SPECIALIZATION_TEMPLATE_PREFERENCES = {
    chatbots: {
        Research: ["G5", "G1", "G4"],
        Practical: ["G1", "G5"]
    },
    cryptography: {
        Research: ["B5", "B6", "D3"],
        Practical: ["D1", "D2", "D4"]
    },
    iot_systems: {
        Research: ["E3", "E4", "B8"],
        Practical: ["A8", "A9", "E1"]
    },
    fpga_design: {
        Research: ["E3", "E4", "E2"],
        Practical: ["E1"]
    },
    game_development: {
        Research: ["F2", "B4", "B5"],
        Practical: ["F1", "F5", "F3", "F4"]
    },
    blockchain_applications: {
        Research: ["B5", "D2", "D3"],
        Practical: ["D1", "D2", "A4"]
    },
    machine_learning: {
        Research: ["B1", "B3", "B4", "B7", "B8"]
    },
    data_analytics: {
        Research: ["C3", "C4", "C5"],
        Practical: ["C1", "C2"]
    },
    web_application_development: {
        Practical: ["A2", "A3", "A4", "A10"]
    }
};

router.get('/config', (req, res) => {
    res.json({
        step2: step2Specializations,
        step3: step3ApplicationDirections,
        step4: step4SkillReadiness,
        template: templateConfig,
        featureTags: FEATURE_TAG_DEFINITIONS.map(({ id, label, description }) => ({ id, label, description }))
    });
});

router.post('/generate', (req, res) => {
    const input = req.body;
    const logs = [];
    const log = (msg) => logs.push(msg);

    log("STEP 7: Hard validation started");
    const { major, technical_specialization, application_direction, skills, thesis_type, feature_tags, exclude_keywords } = input;

    if (!major || !['IT', 'CS', 'DS'].includes(major)) return res.status(400).json({ error: "Invalid major" });
    if (!technical_specialization) return res.status(400).json({ error: "Invalid specialization" });
    if (!application_direction) return res.status(400).json({ error: "Invalid direction" });
    if (!thesis_type || !['Research', 'Practical'].includes(thesis_type)) return res.status(400).json({ error: "Invalid thesis type" });

    const featureTagIds = [...new Set((feature_tags || []).map((tag) => String(tag).trim()).filter(Boolean))];
    let excludeKw = (exclude_keywords || []).map((keyword) => normalizeKeyword(keyword)).filter(Boolean);

    if (featureTagIds.length > FEATURE_TAG_LIMIT) {
        return res.status(400).json({ error: `You can select up to ${FEATURE_TAG_LIMIT} feature tags.` });
    }

    const invalidFeatureTags = featureTagIds.filter((tagId) => !FEATURE_TAGS_BY_ID.has(tagId));
    if (invalidFeatureTags.length > 0) {
        return res.status(400).json({ error: `Invalid feature tags: ${invalidFeatureTags.join(', ')}` });
    }

    const selectedFeatureTags = featureTagIds.map((tagId) => FEATURE_TAGS_BY_ID.get(tagId));

    // Find specialization group and option
    let selectedGroupId = null;
    let selectedSpecGroup = null;
    let selectedSpecOption = null;
    for (const group of step2Specializations.groups) {
        const foundOption = group.options.find((opt) => opt.id === technical_specialization);
        if (foundOption) {
            selectedGroupId = group.groupId;
            selectedSpecGroup = group;
            selectedSpecOption = foundOption;
            break;
        }
    }
    if (!selectedGroupId) return res.status(400).json({ error: "Specialization not found" });

    log("STEP 8: Build generation profile");
    const mappedArea = groupIdToAreaMap[selectedGroupId] || selectedGroupId;
    const profile = {
        major,
        technical_specialization,
        group_id: selectedGroupId,
        db_area: mappedArea,
        direction: application_direction,
        skills: skills || [],
        thesis_type,
        feature_tags: featureTagIds,
        exclude: excludeKw
    };

    log(`Profile: ${JSON.stringify(profile)}`);

    log("STEP 8.5: Determine direction context");
    let directionGroupId = null;
    let selectedDirectionGroup = null;
    let selectedDirectionOption = null;
    let directionLabel = profile.direction;
    for (const g of step3ApplicationDirections.groups) {
        const found = g.options.find((o) => o.id === profile.direction);
        if (found) {
            directionGroupId = g.groupId;
            selectedDirectionGroup = g;
            selectedDirectionOption = found;
            directionLabel = found.label;
            break;
        }
    }

    if (!selectedDirectionGroup || !selectedDirectionOption) {
        return res.status(400).json({ error: "Application direction not found" });
    }

    if (selectedDirectionGroup.allowed_step2_groups && !selectedDirectionGroup.allowed_step2_groups.includes(selectedGroupId)) {
        return res.status(400).json({ error: `Direction "${selectedDirectionOption.label}" is incompatible with specialization "${selectedSpecOption.label}"` });
    }

    log("STEP 9: Select template family");
    let matchedRules = templateConfig.templateSelectionRules.filter(r =>
        r.if.thesisType === profile.thesis_type && r.if.area === profile.db_area
    );
    let effectivePreferredTemplateIds = matchedRules.length > 0 ? [...matchedRules[0].preferredTemplates] : [];

    const templateById = new Map(
        Object.values(templateConfig.templateFamilies || {})
            .flatMap((family) => family.templates || [])
            .map((template) => [template.id, template])
    );

    let selectedTemplates = [];
    if (matchedRules.length > 0) {
        let preferredTemplateIds = matchedRules[0].preferredTemplates;
        // Find actual templates
        for (const familyKey in templateConfig.templateFamilies) {
            const family = templateConfig.templateFamilies[familyKey];
            selectedTemplates.push(...family.templates.filter(t => preferredTemplateIds.includes(t.id)));
        }
    }

    if (selectedTemplates.length === 0) {
        log("No matching templates found, using fallback");
        // Fallback: take a generic family
        selectedTemplates = templateConfig.templateFamilies["practical_system_development"].templates.slice(0, 5);
    }

    const specializationPreferredTemplateIds = SPECIALIZATION_TEMPLATE_PREFERENCES[technical_specialization]?.[profile.thesis_type];
    if (specializationPreferredTemplateIds?.length) {
        const specializationTemplates = specializationPreferredTemplateIds
            .map((templateId) => templateById.get(templateId))
            .filter(Boolean);
        if (specializationTemplates.length > 0) {
            selectedTemplates = specializationTemplates;
            effectivePreferredTemplateIds = [...specializationPreferredTemplateIds];
        }
    }

    const directionalPreferredTemplateIds = getDirectionalTemplatePreferences({
        specializationId: technical_specialization,
        thesisType: profile.thesis_type,
        directionGroupId,
        directionOptionId: selectedDirectionOption.id
    });
    if (directionalPreferredTemplateIds?.length) {
        const directionalTemplates = directionalPreferredTemplateIds
            .map((templateId) => templateById.get(templateId))
            .filter(Boolean);
        if (directionalTemplates.length > 0) {
            selectedTemplates = directionalTemplates;
            effectivePreferredTemplateIds = [...directionalPreferredTemplateIds];
            log(`Directional template preference override applied: ${directionalPreferredTemplateIds.join(', ')}`);
        }
    }

    const featureFocusedTemplates = selectedFeatureTags.length > 0
        ? selectedTemplates.filter((template) => template.slots.includes('feature'))
        : [];

    log(`Selected ${selectedTemplates.length} templates: ${selectedTemplates.map(t => t.id).join(', ')}`);
    if (selectedFeatureTags.length > 0) {
        log(`Selected feature tags: ${selectedFeatureTags.map((tag) => tag.label).join(', ')}`);
        if (featureFocusedTemplates.length > 0) {
            log(`Feature-aware templates available: ${featureFocusedTemplates.map((template) => template.id).join(', ')}`);
        }
    }

    // Collect Specialization Keywords
    let specializationKeywordsList = [
        selectedSpecOption.label,
        technical_specialization.replace(/_/g, ' ')
    ];
    if (selectedSpecGroup && selectedSpecGroup.keywords) {
        specializationKeywordsList = specializationKeywordsList.concat(
            selectedSpecGroup.keywords.filter((keyword) => scorePhraseMatch(selectedSpecOption.label, keyword) > 0)
        );
    }

    // Collect Direction Keywords (Specifically for the chosen option first)
    let directionKeywordsList = [
        directionLabel,
        application_direction.replace(/_/g, ' '),
        selectedDirectionGroup.label
    ];
    if (selectedDirectionGroup && selectedDirectionGroup.keywords) {
        directionKeywordsList = directionKeywordsList.concat(selectedDirectionGroup.keywords);
    }

    let directionKeywords = extractWords(directionKeywordsList);
    let specializationKeywords = extractWords(specializationKeywordsList);

    // Group-level keywords (lower priority fallback)
    let areaKeywords = [];
    if (selectedDirectionGroup && selectedDirectionGroup.keywords) {
        areaKeywords = extractWords(selectedDirectionGroup.keywords);
    }

    log(`Keywords - Direction: ${directionKeywords.join(', ')}`);
    log(`Keywords - Specialization: ${specializationKeywords.join(', ')}`);
    log(`Keywords - Area: ${areaKeywords.join(', ')}`);

    const normalizedDirectionLabel = selectedDirectionOption.label.replace(/&/g, 'and');
    const renderedDirectionLabel = toTitleCase(normalizedDirectionLabel);
    const applyDirectionContextToChoice = (rawValue, slot, templateSlots = []) => {
        if (!rawValue) return rawValue;
        const normalizedValue = normalizeKeyword(rawValue);
        const hasDirectionSignal = directionKeywords.some((keyword) => normalizedValue.includes(keyword));
        if (hasDirectionSignal) return rawValue;

        if (slot === 'domain') {
            return renderedDirectionLabel;
        }

        if (slot === 'target') {
            return `${toTitleCase(rawValue)} in ${renderedDirectionLabel}`;
        }

        if (slot === 'task' || slot === 'problem') {
            return `${toTitleCase(rawValue)} in ${renderedDirectionLabel}`;
        }

        if (slot === 'system' && templateSlots.length === 1) {
            return `${toTitleCase(rawValue)} for ${renderedDirectionLabel}`;
        }

        return rawValue;
    };

    const stripTemplatePrefixDuplication = (choiceValue, slot, templatePattern) => {
        if (!choiceValue || slot !== 'system' || !templatePattern) return choiceValue;

        const duplicatedPrefixes = [
            'AI-Powered',
            'IoT-Based',
            'AIoT-Based',
            'Intelligent',
            'Secure',
            'Privacy-Preserving'
        ];

        let cleaned = choiceValue;
        duplicatedPrefixes.forEach((prefix) => {
            if (templatePattern.startsWith(`${prefix} {${slot}}`) && cleaned.startsWith(`${prefix} `)) {
                cleaned = cleaned.slice(prefix.length + 1);
            }
        });

        return cleaned;
    };

    const featureTagWords = extractWords(selectedFeatureTags.flatMap((tag) => tag.keywords));

    log("STEP 11: Context-aware component filling");
    const candidates = [];
    const numCandidatesToGenerate = 30;

    for (let i = 0; i < numCandidatesToGenerate; i++) {
        // Randomly pick a template
        const templatePool = featureFocusedTemplates.length > 0 && Math.random() < 0.45
            ? featureFocusedTemplates
            : selectedTemplates;
        const template = templatePool[Math.floor(Math.random() * templatePool.length)];
        let candidateText = template.pattern;
        const chosenComponents = {};
        const activeContext = [...featureTagWords];

        template.slots.forEach((slot) => {
            const basePool = getSpecializationSlotPool(templateConfig, technical_specialization, slot);
            const currentPool = [...basePool];
            const alreadyUsedInTitle = Object.values(chosenComponents).map((value) => normalizeKeyword(value));
            const deduplicate = (pool) => pool.filter((item) => !alreadyUsedInTitle.includes(normalizeKeyword(item)));

            const cleanCoupledPool = deduplicate(currentPool.filter((item) => {
                const itemStr = normalizeKeyword(item);
                return activeContext.some((kw) => itemStr.includes(kw));
            }));
            const cleanDirectionPool = deduplicate(currentPool.filter((item) => {
                const itemStr = normalizeKeyword(item);
                return directionKeywords.some((dk) => itemStr.includes(dk));
            }));
            const cleanSpecPool = deduplicate(currentPool.filter((item) => {
                const itemStr = normalizeKeyword(item);
                return specializationKeywords.some((sk) => itemStr.includes(sk));
            }));
            const cleanFeatureTagPool = deduplicate(currentPool.filter((item) =>
                selectedFeatureTags.some((tag) => matchesFeatureTagKeyword(item, tag))
            ));

            let choice = "";
            const rand = Math.random();

            if (cleanFeatureTagPool.length > 0 && (slot === 'feature' || rand < 0.7)) {
                choice = cleanFeatureTagPool[Math.floor(Math.random() * cleanFeatureTagPool.length)];
            } else if (cleanCoupledPool.length > 0 && rand < 0.95) {
                choice = cleanCoupledPool[Math.floor(Math.random() * cleanCoupledPool.length)];
            } else if (cleanDirectionPool.length > 0) {
                choice = cleanDirectionPool[Math.floor(Math.random() * cleanDirectionPool.length)];
            } else if (cleanSpecPool.length > 0) {
                choice = cleanSpecPool[Math.floor(Math.random() * cleanSpecPool.length)];
            } else {
                const finalPool = deduplicate(currentPool).length > 0 ? deduplicate(currentPool) : currentPool;
                choice = finalPool[Math.floor(Math.random() * finalPool.length)];
            }

            choice = applyDirectionContextToChoice(choice, slot, template.slots);
            choice = stripTemplatePrefixDuplication(choice, slot, template.pattern);
            choice = toTitleCase(choice);

            candidateText = candidateText.replace(new RegExp(`\\{${slot}\\}`, 'g'), choice);
            chosenComponents[slot] = choice;

            // Update context
            tokenize(choice).forEach((word) => {
                if (word.length > 3 && !STOP_WORDS.has(word) && !activeContext.includes(word)) {
                    activeContext.push(word);
                }
            });
        });

        // Final sentence capitalization fallback
        candidateText = candidateText.charAt(0).toUpperCase() + candidateText.slice(1);

        // Fix adjacent duplicate words caused by keyword injection (e.g. "Game Game" -> "Game")
        candidateText = candidateText.replace(/\b([A-Za-z]+)\s+\1\b/gi, '$1');

        // Fix 'a/an' grammatical errors (e.g., "a Action" -> "an Action") 
        // Handles technical vowel sounds (AI, IoT, Edge) while avoiding 'an' for 'User' sounds.
        candidateText = candidateText.replace(/\b([Aa])\s+([AEIOaeio])/g, (match, article, nextChar) => {
            const nextWord = candidateText.slice(candidateText.indexOf(match) + match.length - 1).split(/\s+/)[0].toLowerCase();
            const exceptions = ['user', 'universal', 'unit', 'one', 'once'];
            const needsAn = 'aeio'.includes(nextChar.toLowerCase()) || (nextChar.toLowerCase() === 'u' && !exceptions.some(ex => nextWord.startsWith(ex)));
            return needsAn ? `${article}n ${nextChar}` : `${article} ${nextChar}`;
        });

        candidates.push({
            id: `cand_${i}`,
            text: candidateText,
            templateId: template.id,
            components: chosenComponents
        });
    }

    log("STEP 11.5: Deduplication");
    const uniqueCandidates = [];
    candidates.forEach(cand => {
        const isDuplicate = uniqueCandidates.some(uCand => {
            // Very simple jaccard similarity
            const words1 = cand.text.toLowerCase().split(/\s+/);
            const words2 = uCand.text.toLowerCase().split(/\s+/);
            const intersection = words1.filter(w => words2.includes(w));
            const union = new Set([...words1, ...words2]);
            return (intersection.length / union.size) > 0.8;
        });
        if (!isDuplicate) {
            uniqueCandidates.push(cand);
        }
    });
    log(`After deduplication: ${uniqueCandidates.length} candidates`);

    log("STEP 12: Hard constraint filtering");
    const validCandidates = [];
    const rejectedCandidates = [];

    uniqueCandidates.forEach(cand => {
        let rejectReason = null;
        const textLower = cand.text.toLowerCase();

        if (containsExcludedPhrase(cand.text, profile.exclude)) {
            rejectReason = `Contains excluded keyword`;
        }

        if (!rejectReason && directionKeywords.length > 0 && countKeywordMatches(cand.text, directionKeywords) === 0) {
            rejectReason = "Missing application direction context";
        }

        if (!rejectReason) {
            const specializationConflict = findSpecializationConflict({
                text: cand.text,
                selectedGroup: selectedSpecGroup,
                selectedOption: selectedSpecOption
            });
            if (specializationConflict) {
                rejectReason = specializationConflict;
            }
        }

        if (!rejectReason) {
            const crossGroupSpecializationConflict = findCrossGroupSpecializationConflict({
                text: cand.text,
                selectedGroup: selectedSpecGroup,
                selectedOption: selectedSpecOption,
                allGroups: step2Specializations.groups
            });
            if (crossGroupSpecializationConflict) {
                rejectReason = crossGroupSpecializationConflict;
            }
        }

        if (!rejectReason) {
            const directionConflict = findDirectionConflict({
                text: cand.text,
                selectedGroup: selectedDirectionGroup,
                selectedOption: selectedDirectionOption,
                allGroups: step3ApplicationDirections.groups
            });
            if (directionConflict) {
                rejectReason = directionConflict;
            }
        }

        if (!rejectReason) {
            for (const componentValue of Object.values(cand.components || {})) {
                const componentDirectionConflict = findDirectionConflict({
                    text: componentValue,
                    selectedGroup: selectedDirectionGroup,
                    selectedOption: selectedDirectionOption,
                    allGroups: step3ApplicationDirections.groups
                });
                if (componentDirectionConflict) {
                    rejectReason = `Component "${componentValue}" ${componentDirectionConflict}`;
                    break;
                }

                const componentSpecializationConflict = findCrossGroupSpecializationConflict({
                    text: componentValue,
                    selectedGroup: selectedSpecGroup,
                    selectedOption: selectedSpecOption,
                    allGroups: step2Specializations.groups
                });
                if (componentSpecializationConflict) {
                    rejectReason = `Component "${componentValue}" ${componentSpecializationConflict}`;
                    break;
                }
            }
        }

        if (!rejectReason && (cand.text.length < 10 || cand.text.length > 150)) {
            rejectReason = "Length out of bounds";
        }

        if (rejectReason) {
            rejectedCandidates.push({ ...cand, reason: rejectReason });
        } else {
            validCandidates.push(cand);
        }
    });

    log(`Valid: ${validCandidates.length}, Rejected: ${rejectedCandidates.length}`);

    log("STEP 13: Soft relevance scoring");
    if (validCandidates.length === 0) {
        return res.json({ error: "No valid candidates generated", logs });
    }

    // Add scoring to valid candidates
    validCandidates.forEach(cand => {
        // Feasibility Fit
        const totalCoreSkills = 2;
        const totalOptionalSkills = 2;
        // User matched skills
        const matchedCoreSkills = Math.min(profile.skills.length, totalCoreSkills);
        const matchedOptionalSkills = Math.min(Math.max(0, profile.skills.length - totalCoreSkills), totalOptionalSkills);

        const coreMatch = totalCoreSkills > 0 ? matchedCoreSkills / totalCoreSkills : 1;
        const optionalMatch = totalOptionalSkills > 0 ? matchedOptionalSkills / totalOptionalSkills : 1;
        const feasibilityFit = 0.7 * coreMatch + 0.3 * optionalMatch;

        // Direction Match
        const candTextLower = cand.text.toLowerCase();
        let directionOverlap = directionKeywords.filter(kw => candTextLower.includes(kw));

        let directionMatch = 0;
        if (directionKeywords.length > 0) {
            if (directionOverlap.length > 0) {
                directionMatch = directionOverlap.length / directionKeywords.length;
                directionMatch = 0.5 + (0.5 * directionMatch); // Boost
            } else {
                directionMatch = 0; // PENALIZE hard if no domain words matched
            }
        } else {
            directionMatch = 0.5;
        }

        // Specialization Affinity (Prioritize core templates of the specialization)
        let specializationAffinity = 0.5;
        if (effectivePreferredTemplateIds.length > 0) {
            const prefDb = effectivePreferredTemplateIds;
            const index = prefDb.indexOf(cand.templateId);
            if (index !== -1) {
                // Higher score for templates listed earlier (core to the major)
                specializationAffinity = 1.0 - ((index) / prefDb.length);
            }
        }

        let featureTagMatch = 0.5;
        if (selectedFeatureTags.length > 0) {
            const matchedFeatureTags = selectedFeatureTags.filter((tag) => candidateMatchesFeatureTag(cand, tag));
            featureTagMatch = matchedFeatureTags.length / selectedFeatureTags.length;
        }

        const totalScore = 0.3 * feasibilityFit + 0.3 * directionMatch + 0.2 * specializationAffinity + 0.2 * featureTagMatch;

        cand.scores = {
            feasibility_fit: parseFloat(feasibilityFit.toFixed(2)),
            direction_match: parseFloat(directionMatch.toFixed(2)),
            feature_tag_match: parseFloat(featureTagMatch.toFixed(2)),
            specialization_affinity: parseFloat(specializationAffinity.toFixed(2)),
            total_score: parseFloat(totalScore.toFixed(2))
        };
    });

    log("STEP 14: Rank & select best");
    validCandidates.sort((a, b) => b.scores.total_score - a.scores.total_score);
    const bestTopic = validCandidates[0];

    log("STEP 15: Generate explanation");

    // Helper to format components nicely
    const formatComponents = (comps) => {
        let values = Object.values(comps).filter(v => v);
        if (values.length === 0) return 'advanced components';
        if (values.length === 1) return values[0];
        if (values.length === 2) return values.join(' and ');
        return values.slice(0, -1).join(', ') + ', and ' + values[values.length - 1];
    };

    const formatSkill = (id) => id.replace(/_(web|mobile|tech|game|net|nlp|ai|ds)$/i, '').split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

    let explanation = `An optimal ${profile.thesis_type.toLowerCase()} topic aligning perfectly with ${directionLabel}.`;
    if (profile.skills && profile.skills.length > 0) {
        explanation += ` Components like ${formatComponents(bestTopic.components)} were chosen to directly leverage your expertise in ${profile.skills.map(formatSkill).join(', ')}.`;
    }
    if (selectedFeatureTags.length > 0) {
        explanation += ` Optional feature tags such as ${selectedFeatureTags.map((tag) => tag.label).join(', ')} were used to refine the final title without forcing every tag into the wording.`;
    }

    const result = {
        best_topic: bestTopic.text,
        explanation: explanation,
        score_breakdown: bestTopic.scores,
        selected_template: bestTopic.templateId,
        selected_components: bestTopic.components,
        selected_feature_tags: selectedFeatureTags.map((tag) => tag.label),
        rejected_candidates_summary: rejectedCandidates.map(r => ({ text: r.text, reason: r.reason })),
        all_scored_candidates: validCandidates.map(c => ({ text: c.text, score: c.scores.total_score })),
        logs
    };

    res.json(result);
});

router.post('/save', requireAuth, async (req, res) => {
    try {
        const { title, review_data } = req.body;
        const id = randomUUID();
        await pool.query(
            `INSERT INTO generated_topics (id, user_id, title, review_data) VALUES ($1, $2, $3, $4)`,
            [id, req.userId, title, review_data]
        );
        res.json({ success: true, id });
    } catch (err) {
        console.error("Save generation error:", err);
        res.status(500).json({ error: "Failed to save generated topic" });
    }
});

router.get('/saved', requireAuth, async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT * FROM generated_topics WHERE user_id = $1 ORDER BY created_at DESC`,
            [req.userId]
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: "Failed to load generated topics" });
    }
});

router.delete('/saved/:id', requireAuth, async (req, res) => {
    try {
        await pool.query(`DELETE FROM generated_topics WHERE id = $1 AND user_id = $2`, [req.params.id, req.userId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Delete failed" });
    }
});

export default router;

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

const SLOT_PRIORITY = ['model', 'task', 'system', 'domain', 'technology', 'technique', 'method', 'feature', 'problem', 'target'];
const SLOT_HEURISTICS = {
    model: /\b(model|framework|network|cnn|rnn|lstm|gan|transformer|bert|clip|vit|yolo|u-?net|deepfm|xgboost|lightgbm|svm|gpt|llm|nerf)\b/i,
    task: /\b(classification|segmentation|retrieval|detection|recognition|prediction|forecasting|analysis|mining|answering|recommendation|generation|tracking|ranking|search|verification|authentication|authorization|identification|triage)\b/i,
    system: /\b(system|assistant|chatbot|agent|platform|application|service|portal|dashboard)\b/i,
    domain: /\b(healthcare|medical|mental health|wellbeing|education|learning|finance|banking|retail|entertainment|game|gaming|media|commerce|logistics|agriculture|government|social|campus|city|home|industry|tourism|legal|student|patient|loan|credit|mortgage|underwriting|identity|access control|login|authentication)\b/i,
    technology: /\b(machine learning|deep learning|large language models?|llm|computer vision|iot|aiot|blockchain|knowledge graph|vector retrieval|rag|fpga|multimodal|multi modal|neural fields|semantic communication|microservices|devops|unity|web ?3d|vr|ar)\b/i,
    method: /\b(machine learning|deep learning|time series|graph learning|multi modal|multimodal|reinforcement learning|semantic retrieval)\b/i,
    technique: /\b(federated learning|contrastive learning|semantic retrieval|graph neural networks?|attention mechanisms?|reinforcement learning|retrieval augmented generation|rag|patch based|multi factor authentication|passwordless|liveness detection|role based access control|rbac)\b/i,
    feature: /\b(personalized|real time|multilingual|multi language|anomaly detection|progress tracking|privacy|explainability|reporting|visualization|procedural generation|rendering|multiplayer|secure login|biometric|empathetic|context aware)\b/i,
    problem: /\b(performance|behavior|risk|trend|demand)\b/i,
    target: /\b(prices|performance|risk|demand|trend)\b/i
};

const normalizeKeyword = (value = '') => value
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const tokenize = (value = '') => normalizeKeyword(value).split(/\s+/).filter(Boolean);

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

const classifyKeywordSlots = (keyword, componentPools) => {
    const matchedSlots = [];

    for (const [slot, items] of Object.entries(componentPools)) {
        const bestScore = items.reduce((maxScore, item) => Math.max(maxScore, scorePhraseMatch(keyword, item)), 0);
        if (bestScore > 0) {
            matchedSlots.push({ slot, score: bestScore });
        }
    }

    Object.entries(SLOT_HEURISTICS).forEach(([slot, pattern]) => {
        if (pattern.test(keyword) && !matchedSlots.some((match) => match.slot === slot)) {
            matchedSlots.push({ slot, score: 1 });
        }
    });

    matchedSlots.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return SLOT_PRIORITY.indexOf(a.slot) - SLOT_PRIORITY.indexOf(b.slot);
    });

    return matchedSlots.map((match) => match.slot);
};

const getBestLabelMatch = (text, labels) => labels.reduce((best, label) => {
    const score = scorePhraseMatch(text, label);
    return score > best.score ? { label, score } : best;
}, { label: null, score: 0 });

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
    if (strongestOther && strongestOther.score >= 2 && strongestOther.score > selectedMatch.score) {
        return `conflicts with specialization "${selectedOption.label}" because it matches "${strongestOther.option.label}"`;
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
    if (strongestOther && strongestOther.score >= 2 && strongestOther.score > selectedMatch.score) {
        return `conflicts with application direction "${selectedOption.label}" because it matches "${strongestOther.group.label}"`;
    }

    return null;
};

const assignKeywordsToTemplateSlots = (template, keywordEntries) => {
    if (!keywordEntries.length) return {};

    const uniqueTemplateSlots = [...new Set(template.slots)];
    const sortedKeywords = [...keywordEntries]
        .map((entry) => ({
            ...entry,
            availableSlots: entry.slots.filter((slot) => uniqueTemplateSlots.includes(slot))
        }))
        .sort((a, b) => a.availableSlots.length - b.availableSlots.length);

    if (sortedKeywords.some((entry) => entry.availableSlots.length === 0)) {
        return null;
    }

    const assignment = {};
    const usedSlots = new Set();

    const backtrack = (index) => {
        if (index === sortedKeywords.length) return true;
        const current = sortedKeywords[index];

        for (const slot of current.availableSlots) {
            if (usedSlots.has(slot)) continue;
            usedSlots.add(slot);
            assignment[slot] = current.raw;
            if (backtrack(index + 1)) return true;
            usedSlots.delete(slot);
            delete assignment[slot];
        }

        return false;
    };

    return backtrack(0) ? assignment : null;
};

const candidateContainsKeyword = (candidate, keywordEntry) => {
    const candidateText = normalizeKeyword(candidate.text);
    if (candidateText.includes(keywordEntry.normalized)) return true;

    return Object.values(candidate.components || {}).some((value) => normalizeKeyword(value).includes(keywordEntry.normalized));
};

const countKeywordMatches = (text, keywords) => {
    const normalizedText = normalizeKeyword(text);
    return keywords.filter((keyword) => normalizedText.includes(keyword)).length;
};

const computeKeywordSlotAlignment = (slotAssignments, keywordEntries) => {
    if (!slotAssignments || keywordEntries.length === 0) return 0.5;

    const slotEntries = Object.entries(slotAssignments);
    let total = 0;
    let matchedKeywords = 0;

    keywordEntries.forEach((entry) => {
        const assigned = slotEntries.find(([, value]) => value === entry.raw);
        if (!assigned) return;

        const [slot] = assigned;
        const preferredIndex = entry.slots.indexOf(slot);
        if (preferredIndex === -1) return;

        matchedKeywords += 1;
        total += 1 - (preferredIndex / Math.max(entry.slots.length, 1));
    });

    if (matchedKeywords === 0) return 0.5;
    return total / matchedKeywords;
};

const getSpecializationSlotPool = (templateConfig, specializationId, slot) => {
    const specializationPools = templateConfig.specializationComponentPools || {};
    const slotPool = specializationPools?.[specializationId]?.[slot];
    if (Array.isArray(slotPool) && slotPool.length > 0) {
        return slotPool;
    }
    return templateConfig.componentPools[slot] || ["System", "Method"];
};

const getKeywordClassificationPools = (templateConfig, specializationId) => {
    const pools = {};
    const allSlots = new Set([
        ...Object.keys(templateConfig.componentPools || {}),
        ...Object.keys(templateConfig.specializationComponentPools?.[specializationId] || {})
    ]);

    allSlots.forEach((slot) => {
        pools[slot] = [
            ...(templateConfig.componentPools?.[slot] || []),
            ...(templateConfig.specializationComponentPools?.[specializationId]?.[slot] || [])
        ];
    });

    return pools;
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

router.get('/config', (req, res) => {
    res.json({
        step2: step2Specializations,
        step3: step3ApplicationDirections,
        step4: step4SkillReadiness,
        template: templateConfig
    });
});

router.post('/generate', (req, res) => {
    const input = req.body;
    const logs = [];
    const log = (msg) => logs.push(msg);

    log("STEP 7: Hard validation started");
    const { major, technical_specialization, application_direction, skills, thesis_type, include_keywords, exclude_keywords } = input;

    if (!major || !['IT', 'CS', 'DS'].includes(major)) return res.status(400).json({ error: "Invalid major" });
    if (!technical_specialization) return res.status(400).json({ error: "Invalid specialization" });
    if (!application_direction) return res.status(400).json({ error: "Invalid direction" });
    if (!thesis_type || !['Research', 'Practical'].includes(thesis_type)) return res.status(400).json({ error: "Invalid thesis type" });

    let includeKw = (include_keywords || []).map(k => k.toLowerCase().trim());
    let excludeKw = (exclude_keywords || []).map(k => k.toLowerCase().trim());
    const overlap = includeKw.filter(k => excludeKw.includes(k));
    if (overlap.length > 0) return res.status(400).json({ error: "Keyword in both include and exclude: " + overlap.join(', ') });

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
        include: includeKw,
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

    log(`Selected ${selectedTemplates.length} templates: ${selectedTemplates.map(t => t.id).join(', ')}`);

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
    const keywordClassificationPools = getKeywordClassificationPools(templateConfig, technical_specialization);
    const applyDirectionContextToForcedChoice = (rawValue, slot) => {
        if (!rawValue) return rawValue;
        const normalizedValue = normalizeKeyword(rawValue);
        const hasDirectionSignal = directionKeywords.some((keyword) => normalizedValue.includes(keyword));
        if (hasDirectionSignal) return rawValue;

        if (slot === 'domain' || slot === 'target') {
            return `${normalizedDirectionLabel} in ${rawValue}`;
        }

        if (slot === 'task' || slot === 'problem') {
            return `${normalizedDirectionLabel} for ${rawValue}`;
        }

        return rawValue;
    };

    log("STEP 10.5: Classify include keywords");
    const includeKeywordEntries = profile.include.map((rawKeyword) => {
        const normalized = normalizeKeyword(rawKeyword);
        const slots = classifyKeywordSlots(normalized, keywordClassificationPools);
        const specializationConflict = findSpecializationConflict({
            text: normalized,
            selectedGroup: selectedSpecGroup,
            selectedOption: selectedSpecOption
        });
        const directionConflict = findDirectionConflict({
            text: normalized,
            selectedGroup: selectedDirectionGroup,
            selectedOption: selectedDirectionOption,
            allGroups: step3ApplicationDirections.groups
        });

        return {
            raw: rawKeyword,
            normalized,
            slots,
            conflicts: [specializationConflict, directionConflict].filter(Boolean)
        };
    });

    if (includeKeywordEntries.length > 0) {
        log(`Include keyword classification: ${JSON.stringify(includeKeywordEntries.map((entry) => ({ keyword: entry.raw, slots: entry.slots, conflicts: entry.conflicts })))}`);
    }

    const conflictingIncludeKeywords = includeKeywordEntries.filter((entry) => entry.conflicts.length > 0);
    if (conflictingIncludeKeywords.length > 0) {
        return res.status(400).json({
            error: conflictingIncludeKeywords
                .map((entry) => `Include keyword "${entry.raw}" ${entry.conflicts.join(' and ')}`)
                .join('; '),
            logs
        });
    }

    const unsupportedIncludeKeywords = includeKeywordEntries.filter((entry) => entry.slots.length === 0);
    if (unsupportedIncludeKeywords.length > 0) {
        return res.status(400).json({
            error: `Unsupported include keywords: ${unsupportedIncludeKeywords.map((entry) => `"${entry.raw}"`).join(', ')}. Please use keywords that match a topic model, task, domain, or technique.`,
            logs
        });
    }

    if (includeKeywordEntries.length > 0) {
        selectedTemplates = selectedTemplates.filter((template) => assignKeywordsToTemplateSlots(template, includeKeywordEntries));
        log(`Templates after include keyword compatibility filter: ${selectedTemplates.map((template) => template.id).join(', ')}`);

        if (selectedTemplates.length === 0) {
            return res.status(400).json({
                error: "No available template can satisfy all included keywords for the selected specialization and application direction.",
                logs
            });
        }
    }

    log("STEP 11: Context-aware component filling");
    const candidates = [];
    const numCandidatesToGenerate = 30;

    for (let i = 0; i < numCandidatesToGenerate; i++) {
        // Randomly pick a template
        const template = selectedTemplates[Math.floor(Math.random() * selectedTemplates.length)];
        const forcedSlotAssignments = assignKeywordsToTemplateSlots(template, includeKeywordEntries);
        let candidateText = template.pattern;
        const chosenComponents = {};
        const activeContext = [];

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

            let choice = "";
            const rand = Math.random();

            if (forcedSlotAssignments && forcedSlotAssignments[slot]) {
                choice = applyDirectionContextToForcedChoice(forcedSlotAssignments[slot], slot);
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

            choice = toTitleCase(choice);

            candidateText = candidateText.replace(new RegExp(`\\{${slot}\\}`, 'g'), choice);
            chosenComponents[slot] = choice;

            // Update context
            tokenize(choice).forEach((word) => {
                if (word.length > 3 && !activeContext.includes(word)) {
                    activeContext.push(word);
                }
            });
        });

        // Final sentence capitalization fallback
        candidateText = candidateText.charAt(0).toUpperCase() + candidateText.slice(1);

        // Fix adjacent duplicate words caused by keyword injection (e.g. "Game Game" -> "Game")
        candidateText = candidateText.replace(/\b([A-Za-z]+)\s+\1\b/gi, '$1');

        // Fix 'a/an' grammatical errors (e.g., "a Action" -> "an Action") 
        candidateText = candidateText.replace(/\b([Aa])\s+([AEIOaeio]|Un|Um|Ur|Up)/g, '$1n $2');

        if (directionKeywords.length > 0 && countKeywordMatches(candidateText, directionKeywords) === 0) {
            candidateText = `${candidateText} in ${renderedDirectionLabel}`;
        }

        candidates.push({
            id: `cand_${i}`,
            text: candidateText,
            templateId: template.id,
            components: chosenComponents,
            keywordSlotAlignment: computeKeywordSlotAlignment(forcedSlotAssignments, includeKeywordEntries)
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

        if (profile.exclude.some(ex => {
            const regex = new RegExp(`\\b${ex.replace(/[^a-z0-9]/g, '')}\\b`, 'i');
            return regex.test(textLower);
        })) {
            rejectReason = `Contains excluded keyword`;
        } else if (includeKeywordEntries.length > 0) {
            const missingKeywords = includeKeywordEntries.filter((entry) => !candidateContainsKeyword(cand, entry));
            if (missingKeywords.length > 0) {
                rejectReason = `Missing required include keyword(s): ${missingKeywords.map((entry) => entry.raw).join(', ')}`;
            }
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
        if (matchedRules.length > 0) {
            const prefDb = matchedRules[0].preferredTemplates;
            const index = prefDb.indexOf(cand.templateId);
            if (index !== -1) {
                // Higher score for templates listed earlier (core to the major)
                specializationAffinity = 1.0 - ((index) / prefDb.length);
            }
        }

        // Keyword Match (Heavy boost for having included keywords)
        let keywordMatch = 0.5;
        if (includeKeywordEntries.length > 0) {
            const kwOverlap = includeKeywordEntries.filter((entry) => candidateContainsKeyword(cand, entry));
            keywordMatch = kwOverlap.length / includeKeywordEntries.length;
        }

        const keywordSlotFit = includeKeywordEntries.length > 0 ? cand.keywordSlotAlignment ?? 0.5 : 0.5;
        const totalScore = 0.25 * feasibilityFit + 0.25 * directionMatch + 0.20 * keywordMatch + 0.15 * keywordSlotFit + 0.15 * specializationAffinity;

        cand.scores = {
            feasibility_fit: parseFloat(feasibilityFit.toFixed(2)),
            direction_match: parseFloat(directionMatch.toFixed(2)),
            keyword_match: parseFloat(keywordMatch.toFixed(2)),
            keyword_slot_fit: parseFloat(keywordSlotFit.toFixed(2)),
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

    const result = {
        best_topic: bestTopic.text,
        explanation: explanation,
        score_breakdown: bestTopic.scores,
        selected_template: bestTopic.templateId,
        selected_components: bestTopic.components,
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

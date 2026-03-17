export const HYBRID_RECOMMENDATION_CONFIG = {
  coverageThreshold: 0.3,
  majorAreaAllowlist: {
    DS: [
      'AI & Machine Learning',
      'Data Science & Mining',
      'Computer Vision & Multimedia'
    ],
    CS: [
      'AI & Machine Learning',
      'Data Science & Mining',
      'Cybersecurity & Networks',
      'Web & Software Systems',
      'Computer Vision & Multimedia',
      'Graphics, Games & HCI'
    ],
    IT: [
      'Web & Software Systems',
      'Cybersecurity & Networks',
      'IoT & Embedded Systems',
      'Data Science & Mining',
      'Graphics, Games & HCI'
    ]
  },
  researchCues: ['evaluate', 'analyze', 'propose', 'framework', 'model', 'optimization'],
  practicalCues: ['build', 'implement', 'develop', 'deploy', 'system', 'application'],
  stopwords: [
    'a',
    'an',
    'and',
    'are',
    'as',
    'at',
    'be',
    'by',
    'for',
    'from',
    'how',
    'in',
    'into',
    'is',
    'of',
    'on',
    'or',
    'that',
    'the',
    'their',
    'this',
    'to',
    'was',
    'what',
    'when',
    'where',
    'which',
    'with',
    'would',
    'your'
  ]
};

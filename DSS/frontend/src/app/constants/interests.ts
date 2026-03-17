export const INTEREST_OPTIONS = [
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
] as const;

export type InterestOption = typeof INTEREST_OPTIONS[number];

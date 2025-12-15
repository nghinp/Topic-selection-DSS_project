export type Question = {
  id: string;
  text: string;
  section: 'A' | 'B' | 'C' | 'D';
  area?: string;           // for Section C mapping (e.g., 'AI', 'WEB')
  keyed?: 'plus' | 'minus'; // keep for consistency; default plus
};

const questions: Question[] = [
  // Section A — Thesis Type (6)
  { id: 'q01', text: 'I enjoy reading academic papers or exploring theoretical concepts.', section: 'A' },
  { id: 'q02', text: 'I prefer experimenting with different algorithms and analyzing results.', section: 'A' },
  { id: 'q03', text: 'I enjoy building complete systems, apps, or functional prototypes.', section: 'A' },
  { id: 'q04', text: 'I am motivated by solving real-world problems through implementation.', section: 'A' },
  { id: 'q05', text: 'I feel comfortable working with datasets, experiments, and analytical reports.', section: 'A' },
  { id: 'q06', text: 'I enjoy designing UI, APIs, architectures, or deployable software.', section: 'A' },

  // Section B — Working Style (8)
  { id: 'q07', text: 'I prefer working independently with minimal supervision.', section: 'B' },
  { id: 'q08', text: 'I enjoy collaborating closely with teammates.', section: 'B' },
  { id: 'q09', text: 'I enjoy structured work with clear steps and requirements.', section: 'B' },
  { id: 'q10', text: 'I prefer flexible projects where I can explore ideas freely.', section: 'B' },
  { id: 'q11', text: 'I work well under time pressure and deadlines.', section: 'B' },
  { id: 'q12', text: 'I enjoy long, deep-focus tasks without interruptions.', section: 'B' },
  { id: 'q13', text: 'I prefer problem-solving through coding and experimentation.', section: 'B' },
  { id: 'q14', text: 'I prefer analyzing, planning, or architecting before coding anything.', section: 'B' },

  // Section C — Interests (10)
  { id: 'q15', text: 'I enjoy training models, experimenting with algorithms, or solving predictive problems.', section: 'C', area: 'AI' },
  { id: 'q16', text: 'I enjoy exploring datasets, creating visualizations, or optimizing data pipelines.', section: 'C', area: 'DATA' },
  { id: 'q17', text: 'I find security vulnerabilities, penetration testing, or cryptography interesting.', section: 'C', area: 'SEC' },
  { id: 'q18', text: 'I enjoy building interfaces, backend APIs, or fullstack web applications.', section: 'C', area: 'WEB' },
  { id: 'q19', text: 'I like building apps for Android/iOS or using cross-platform frameworks.', section: 'C', area: 'MOBILE' },
  { id: 'q20', text: 'I enjoy deploying, automating, and scaling systems on cloud platforms.', section: 'C', area: 'CLOUD' },
  { id: 'q21', text: 'I like configuring networks, troubleshooting servers, or optimizing connectivity.', section: 'C', area: 'NET' },
  { id: 'q22', text: 'I like working with hardware, sensors, and real-time systems.', section: 'C', area: 'IOT' },
  { id: 'q23', text: 'I’m curious about smart contracts, dApps, or distributed ledger systems.', section: 'C', area: 'WEB3' },
  { id: 'q24', text: 'I enjoy designing user interfaces, conducting usability testing, or improving user experience.', section: 'C', area: 'UX' },
  { id: 'q25', text: 'I like planning software architectures, managing tasks, and ensuring system quality.', section: 'C', area: 'PM' },

  // Section D — Skills (5)
  { id: 'q26', text: 'My math and statistics foundation is strong enough for AI/Data research.', section: 'D' },
  { id: 'q27', text: 'I am comfortable coding medium-to-large software systems.', section: 'D' },
  { id: 'q28', text: 'I can learn new programming frameworks quickly.', section: 'D' },
  { id: 'q29', text: 'I can handle complex debugging or system troubleshooting.', section: 'D' },
  { id: 'q30', text: 'I enjoy writing documentation and technical reports.', section: 'D' }
];

export default questions;

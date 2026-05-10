export type TopicDetailContent = {
  problemOverview: string[];
  researchObjectives: string[];
  methodology: string[];
  technologies: string[];
};

export const EMPTY_TOPIC_DETAIL_CONTENT: TopicDetailContent = {
  problemOverview: [],
  researchObjectives: [],
  methodology: [],
  technologies: []
};

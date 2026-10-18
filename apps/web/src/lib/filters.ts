/** Directory filter keys that live in the URL as comma-separated lists (shared by the server page and client filters) */
export const LIST_KEYS = ['genre', 'landscape', 'era', 'tag', 'cluster', 'season', 'access'] as const;
export type ListKey = (typeof LIST_KEYS)[number];

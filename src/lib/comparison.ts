import type { ModelResult } from "./types";

export const COMPARE_LIMIT = 3;

export function toggleComparison(models: ModelResult[], model: ModelResult): ModelResult[] {
  if (models.some((item) => item.url === model.url)) return models.filter((item) => item.url !== model.url);
  return models.length < COMPARE_LIMIT ? [...models, model] : models;
}

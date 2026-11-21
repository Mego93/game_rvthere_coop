import { describe, expect, it } from 'vitest';
import { summaryView } from './summaryView';

describe('summaryView', () => {
  it('names the goals by their labels, in done, missed and skipped sections', () => {
    const view = summaryView({ day: 0, done: ['vibecode'], missed: ['outing'], skipped: ['eat'] });
    expect(view.title).toBe('Day 0 is over');
    expect(view.sections.map((section) => section.key)).toEqual(['done', 'missed', 'skipped']);
    expect(view.sections[0]!.labels).toEqual(['Vibecode at a laptop']);
    expect(view.sections[2]!.labels).toEqual(['Eat together in the kitchen']);
  });

  it('labels the goals of a day the table lacks with the test day\'s, as the server plays it', () => {
    expect(summaryView({ day: 1, done: [], missed: [], skipped: [] }).title).toBe('Day 1 is over');
    expect(summaryView({ day: 1, done: ['vibecode'], missed: [], skipped: [] }).sections[0]!.labels).toEqual(['Vibecode at a laptop']);
  });

  it('leaves out an empty section and shows an unknown goal by its id', () => {
    const view = summaryView({ day: 3, done: ['mystery'], missed: [], skipped: [] });
    expect(view.title).toBe('Day 3 is over');
    expect(view.sections).toEqual([{ key: 'done', title: 'Done', labels: ['mystery'] }]);
  });
});

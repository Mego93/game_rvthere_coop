import { STORY_DAYS, type DaySummaryMessage } from '@lodgy/shared';

export interface SummarySection {
  key: 'done' | 'missed' | 'skipped';
  title: string;
  labels: string[];
}

export const dayTitle = (day: number): string => (day === 0 ? 'Test day' : `Day ${day}`);

// A day the table does not have yet plays the test day's goals, as the server does.
const labelOf = (day: number, id: string): string => (STORY_DAYS[day] ?? STORY_DAYS[0])?.goals.find((goal) => goal.id === id)?.label ?? id;

// The day summary as sections, leaving out the empty ones; a goal the table does not know is shown by its id.
export function summaryView(message: Pick<DaySummaryMessage, 'day' | 'done' | 'missed' | 'skipped'>): { title: string; sections: SummarySection[] } {
  const sections: SummarySection[] = [
    { key: 'done', title: 'Done', labels: message.done.map((id) => labelOf(message.day, id)) },
    { key: 'missed', title: 'Missed', labels: message.missed.map((id) => labelOf(message.day, id)) },
    { key: 'skipped', title: 'Skipped (a friend was away)', labels: message.skipped.map((id) => labelOf(message.day, id)) },
  ];
  return { title: `Day ${message.day} is over`, sections: sections.filter((section) => section.labels.length > 0) };
}

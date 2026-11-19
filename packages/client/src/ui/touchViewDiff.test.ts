import { expect, test } from 'vitest';
import { changedFields } from './touchViewDiff';
import type { TouchView } from './touchView';

const view: TouchView = { seated: false, useVisible: false, reelVisible: false, resetVisible: false, sprintVisible: false, fireVisible: false, slots: ['jerrycan', null, null], selected: 0 };

test('with nothing shown every field is changed', () => {
  expect([...changedFields(null, view)].sort()).toEqual(['fireVisible', 'reelVisible', 'resetVisible', 'seated', 'selected', 'slots', 'sprintVisible', 'useVisible']);
});

test('an equal view changes nothing, even with a new slots array', () => {
  expect(changedFields(view, { ...view, slots: [...view.slots] }).size).toBe(0);
});

test('only the changed fields are reported', () => {
  expect([...changedFields(view, { ...view, seated: true })]).toEqual(['seated']);
  expect([...changedFields(view, { ...view, selected: 2, useVisible: true })].sort()).toEqual(['selected', 'useVisible']);
  expect([...changedFields(view, { ...view, slots: ['jerrycan', 'toolbox', null] })]).toEqual(['slots']);
  expect([...changedFields(view, { ...view, reelVisible: true })]).toEqual(['reelVisible']);
  expect([...changedFields(view, { ...view, resetVisible: true })]).toEqual(['resetVisible']);
  expect([...changedFields(view, { ...view, sprintVisible: true })]).toEqual(['sprintVisible']);
  expect([...changedFields(view, { ...view, fireVisible: true })]).toEqual(['fireVisible']);
});

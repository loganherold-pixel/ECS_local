import type { TextStyle } from 'react-native';

import { ECS, TACTICAL, TYPO } from './theme';

export type ECSTextVariant =
  | 'screenTitle'
  | 'sectionTitle'
  | 'sectionSubtitle'
  | 'cardTitle'
  | 'cardSubtitle'
  | 'statLabel'
  | 'statValue'
  | 'body'
  | 'helper'
  | 'chip'
  | 'button'
  | 'dialogTitle'
  | 'dialogBody';

export const ECS_TEXT_SPACING = {
  titleToSection: 12,
  sectionToCard: 10,
  titleToSubtitle: 4,
  titleRowToSummary: 8,
  statLabelToValue: 3,
  helperToCta: 8,
  dialogTitleToBody: 6,
  emptyTitleToBody: 6,
  widgetTitleToValue: 6,
} as const;

export const ECS_TEXT: Record<ECSTextVariant, TextStyle> = {
  screenTitle: {
    ...TYPO.T1,
    fontSize: 20,
    letterSpacing: 1.4,
    lineHeight: 24,
    color: TACTICAL.amber,
    includeFontPadding: false,
  },
  sectionTitle: {
    ...TYPO.U2,
    fontSize: 9,
    letterSpacing: 1.5,
    lineHeight: 12,
    color: TACTICAL.amber,
    includeFontPadding: false,
  },
  sectionSubtitle: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '500',
    color: ECS.muted,
    includeFontPadding: false,
  },
  cardTitle: {
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '800',
    letterSpacing: 0.2,
    color: ECS.text,
    includeFontPadding: false,
  },
  cardSubtitle: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600',
    letterSpacing: 0.2,
    color: ECS.muted,
    includeFontPadding: false,
  },
  statLabel: {
    ...TYPO.U2,
    fontSize: 8,
    lineHeight: 10,
    letterSpacing: 1.05,
    color: ECS.muted,
    includeFontPadding: false,
  },
  statValue: {
    ...TYPO.K3,
    fontSize: 12,
    lineHeight: 15,
    letterSpacing: 0.15,
    color: ECS.text,
    includeFontPadding: false,
  },
  body: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '500',
    letterSpacing: 0.15,
    color: ECS.text,
    includeFontPadding: false,
  },
  helper: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '500',
    letterSpacing: 0.1,
    color: ECS.muted,
    includeFontPadding: false,
  },
  chip: {
    ...TYPO.U2,
    fontSize: 8,
    lineHeight: 10,
    letterSpacing: 0.9,
    color: ECS.text,
    includeFontPadding: false,
  },
  button: {
    ...TYPO.U2,
    fontSize: 10,
    lineHeight: 12,
    letterSpacing: 1,
    includeFontPadding: false,
    textAlign: 'center',
  },
  dialogTitle: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '800',
    letterSpacing: 0.2,
    color: ECS.text,
    includeFontPadding: false,
  },
  dialogBody: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '500',
    letterSpacing: 0.15,
    color: ECS.muted,
    includeFontPadding: false,
  },
};

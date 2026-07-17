import { describe, expect, it } from 'vitest';
import { validateAcademyContentList } from '../schema';
import {
  ADVANCED_ANALYSIS_TRACK,
  CFA_NO_AFFILIATION_DISCLAIMER_AR,
  CFA_NO_AFFILIATION_DISCLAIMER_EN,
} from './advancedAnalysisTrack';

// Mirrors src/app/api/quiz/route.ts's TOPIC_ALLOWLIST (read-only, not exported —
// duplicated here for test verification only, never as product logic).
const QUIZ_TOPIC_ALLOWLIST = [
  'Stock Market Basics',
  'Savings & Jars',
  'Compound Interest',
  'Sharia Compliance',
  'Risk Management',
  'Value Investing',
  'Halal Mutual Funds',
  'TASI Markets',
  'NASDAQ Markets',
];

describe('advanced financial analysis track content', () => {
  it('passes validateAcademyContentList with zero errors', () => {
    const result = validateAcademyContentList([ADVANCED_ANALYSIS_TRACK]);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('has at least 4 units, each with at least 3 lessons', () => {
    expect(ADVANCED_ANALYSIS_TRACK.units.length).toBeGreaterThanOrEqual(4);
    for (const unit of ADVANCED_ANALYSIS_TRACK.units) {
      expect(unit.lessons.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('has a checkpoint on every lesson', () => {
    for (const unit of ADVANCED_ANALYSIS_TRACK.units) {
      for (const lesson of unit.lessons) {
        expect(lesson.checkpoint).toBeDefined();
        expect(lesson.checkpoint.options.length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('has minimumAgeSegment ADULTS and every lesson at ADULTS', () => {
    expect(ADVANCED_ANALYSIS_TRACK.minimumAgeSegment).toBe('ADULTS');
    for (const unit of ADVANCED_ANALYSIS_TRACK.units) {
      for (const lesson of unit.lessons) {
        expect(lesson.ageSegment).toBe('ADULTS');
      }
    }
  });

  it('contains the OQ-9 no-CFA-affiliation disclaimer, in both languages, in the shipped content', () => {
    const introLesson = ADVANCED_ANALYSIS_TRACK.units
      .flatMap((u) => u.lessons)
      .find((l) => l.id === 'adv-u1-intro');
    expect(introLesson).toBeDefined();
    expect(introLesson!.body.en).toContain(CFA_NO_AFFILIATION_DISCLAIMER_EN);
    expect(introLesson!.body.ar).toContain(CFA_NO_AFFILIATION_DISCLAIMER_AR);
    // Guard against silent naming drift implying CFA Institute affiliation.
    expect(CFA_NO_AFFILIATION_DISCLAIMER_EN).toMatch(/not affiliated with, endorsed by, or sponsored by CFA Institute/);
  });

  it('tags every bond/interest/derivative mechanics lesson HARAM or EDUCATIONAL_ONLY', () => {
    const nonCompliantMechanicsIds = [
      'adv-u3-bond-mechanics',
      'adv-u3-bond-pricing',
      'adv-u5-options',
      'adv-u5-futures',
    ];
    const lessons = ADVANCED_ANALYSIS_TRACK.units.flatMap((u) => u.lessons);
    for (const id of nonCompliantMechanicsIds) {
      const lesson = lessons.find((l) => l.id === id);
      expect(lesson, `expected lesson ${id} to exist`).toBeDefined();
      expect(['HARAM', 'EDUCATIONAL_ONLY']).toContain(lesson!.complianceTag);
    }
  });

  it('pairs each non-compliant instrument with a HALAL compliant alternative', () => {
    const lessons = ADVANCED_ANALYSIS_TRACK.units.flatMap((u) => u.lessons);
    const sukuk = lessons.find((l) => l.id === 'adv-u3-sukuk');
    const arbunSalam = lessons.find((l) => l.id === 'adv-u5-arbun-salam');
    expect(sukuk!.complianceTag).toBe('HALAL');
    expect(arbunSalam!.complianceTag).toBe('HALAL');
  });

  it('links unit 4 (portfolio theory & risk) to the lab\'s only reviewed strategySetup', () => {
    const unit4 = ADVANCED_ANALYSIS_TRACK.units.find((u) => u.id === 'portfolio-theory-risk');
    expect(unit4).toBeDefined();
    const strategyLinks = unit4!.practiceLinks.filter((l) => l.kind === 'strategySetup');
    expect(strategyLinks.length).toBeGreaterThanOrEqual(1);
    expect(strategyLinks.some((l) => l.kind === 'strategySetup' && l.setupId === 'bollinger-mr-long-v2')).toBe(true);
  });

  it('teaches drawdown before CAGR in the portfolio-risk unit (loss-avoidance-first framing)', () => {
    const unit4 = ADVANCED_ANALYSIS_TRACK.units.find((u) => u.id === 'portfolio-theory-risk');
    const lessonIds = unit4!.lessons.map((l) => l.id);
    const drawdownIndex = lessonIds.indexOf('adv-u4-drawdown-first');
    const sharpeIndex = lessonIds.indexOf('adv-u4-sharpe-factor');
    expect(drawdownIndex).toBeGreaterThanOrEqual(0);
    expect(sharpeIndex).toBeGreaterThan(drawdownIndex);
  });

  it('states valuation model outputs are "not advice"', () => {
    const dcf = ADVANCED_ANALYSIS_TRACK.units.flatMap((u) => u.lessons).find((l) => l.id === 'adv-u2-dcf');
    expect(dcf!.body.en.toLowerCase()).toContain('not advice');
  });

  it('has unique lesson ids across the whole track', () => {
    const ids = ADVANCED_ANALYSIS_TRACK.units.flatMap((u) => u.lessons.map((l) => l.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has unique unit ids within the track', () => {
    const ids = ADVANCED_ANALYSIS_TRACK.units.map((u) => u.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every unit has at least one practiceLink, and every quizTopic target is in the real allowlist', () => {
    for (const unit of ADVANCED_ANALYSIS_TRACK.units) {
      expect(unit.practiceLinks.length).toBeGreaterThanOrEqual(1);
      for (const link of unit.practiceLinks) {
        if (link.kind === 'quizTopic') {
          expect(QUIZ_TOPIC_ALLOWLIST).toContain(link.topic);
        }
      }
    }
  });

  it('every lesson has bilingual title/summary/body/checkpoint text', () => {
    for (const unit of ADVANCED_ANALYSIS_TRACK.units) {
      for (const lesson of unit.lessons) {
        for (const field of [lesson.title, lesson.summary, lesson.body]) {
          expect(field.en.length).toBeGreaterThan(0);
          expect(field.ar.length).toBeGreaterThan(0);
        }
        expect(lesson.checkpoint.question.ar.length).toBeGreaterThan(0);
        expect(lesson.checkpoint.explanation.ar.length).toBeGreaterThan(0);
      }
    }
  });
});

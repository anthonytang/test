import { describe, it, expect } from 'vitest';
import { getScoreColorClasses, getTagColorClasses } from '../styleUtils';

describe('styleUtils', () => {
  describe('getScoreColorClasses', () => {
    it('should return none classes for null/undefined score', () => {
      expect(getScoreColorClasses(null)).toContain('bg-score-none');
      expect(getScoreColorClasses(undefined)).toContain('bg-score-none');
    });

    it('should return high score classes for score >= 0.5', () => {
      expect(getScoreColorClasses(0.5)).toContain('bg-score-high');
      expect(getScoreColorClasses(0.7)).toContain('bg-score-high');
      expect(getScoreColorClasses(1.0)).toContain('bg-score-high');
    });

    it('should return medium score classes for score >= 0.25 and < 0.5', () => {
      expect(getScoreColorClasses(0.25)).toContain('bg-score-medium');
      expect(getScoreColorClasses(0.4)).toContain('bg-score-medium');
    });

    it('should return low score classes for score < 0.25', () => {
      expect(getScoreColorClasses(0.24)).toContain('bg-score-low');
      expect(getScoreColorClasses(0.1)).toContain('bg-score-low');
      expect(getScoreColorClasses(0)).toContain('bg-score-low');
    });

    it('should return selected classes when isSelected is true', () => {
      expect(getScoreColorClasses(0.5, true)).toContain('bg-score-high-hover');
      expect(getScoreColorClasses(0.3, true)).toContain('bg-score-medium-hover');
      expect(getScoreColorClasses(0.1, true)).toContain('bg-score-low-hover');
      expect(getScoreColorClasses(null, true)).toContain('bg-score-none-hover');
    });
  });

  describe('getTagColorClasses', () => {
    it('should return none classes for null/undefined score', () => {
      expect(getTagColorClasses(null)).toContain('bg-score-none');
      expect(getTagColorClasses(undefined)).toContain('bg-score-none');
    });

    it('should return high score classes for score >= 0.5', () => {
      expect(getTagColorClasses(0.5)).toContain('bg-score-high');
      expect(getTagColorClasses(0.7)).toContain('bg-score-high');
      expect(getTagColorClasses(1.0)).toContain('bg-score-high');
    });

    it('should return medium score classes for score >= 0.25 and < 0.5', () => {
      expect(getTagColorClasses(0.25)).toContain('bg-score-medium');
      expect(getTagColorClasses(0.4)).toContain('bg-score-medium');
    });

    it('should return low score classes for score < 0.25', () => {
      expect(getTagColorClasses(0.24)).toContain('bg-score-low');
      expect(getTagColorClasses(0.1)).toContain('bg-score-low');
      expect(getTagColorClasses(0)).toContain('bg-score-low');
    });

    it('should return selected classes when isSelected is true', () => {
      expect(getTagColorClasses(0.5, true)).toContain('bg-score-high-hover');
      expect(getTagColorClasses(0.3, true)).toContain('bg-score-medium-hover');
      expect(getTagColorClasses(0.1, true)).toContain('bg-score-low-hover');
      expect(getTagColorClasses(null, true)).toContain('bg-score-none-hover');
    });
  });
});


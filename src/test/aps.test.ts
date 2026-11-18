import { describe, expect, it } from 'vitest';
import { apsScore, levelFromPercent } from '@/modules/career/aps';

describe('APS score', () => {
  it('maps NSC percentages to achievement levels', () => {
    expect([80, 79, 70, 60, 50, 40, 30, 29].map(levelFromPercent)).toEqual([7, 6, 6, 5, 4, 3, 2, 1]);
  });
  it('adds the best six subjects and leaves out Life Orientation', () => {
    const aps = apsScore([
      { subject: 'English First Additional Language', grade: '60% (level 5)' }, { subject: 'Sepedi Home Language', grade: '74% (level 6)' },
      { subject: 'Mathematics', grade: '43% (level 3)' }, { subject: 'Life Sciences', grade: '56% (level 4)' },
      { subject: 'Physical Sciences', grade: '40% (level 3)' }, { subject: 'Geography', grade: '60% (level 5)' },
      { subject: 'Life Orientation', grade: '68% (level 5)' },
    ]);
    expect(aps?.score).toBe(26);
    expect(aps?.counted).toHaveLength(6);
  });
  it('counts a subject once when the CV and certificate both list it, and ignores diploma modules', () => {
    const aps = apsScore([{ subject: 'English' }, { subject: 'English First Additional Language', grade: '60%' }, { subject: 'Mathematics' },
      { subject: 'Development Software IB', grade: '78% — Pass', qualification: 'Diploma in Information Technology' }]);
    expect(aps?.score).toBe(5);
    expect(aps?.missing).toEqual(['Mathematics']);
  });
});

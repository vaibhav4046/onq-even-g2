import { describe, expect, it } from 'vitest';
import {
  assertLensBudget,
  buildPresetLiveUi,
  evaluateSafeFormula,
  formatLiveUiForG2,
  parseDisplayMarkup,
  parseOrRepairLiveUiXml,
  reduceLiveUiAction,
  stepPacedReveal,
  synthesizeLiveUiFromPrompt,
} from '../src/index.js';

describe('OnQ LiveUI Engine, Safe Formula Parser & Read-Speed Pacer', () => {
  it('parses display markup (<dwell>, <skim>, <beat/>, <mood:X/>) and paces word reveals cleanly', () => {
    const raw =
      '<mood:confident/>Checking inbox.<beat/><skim>Two emails skipped.</skim> <dwell>Reply ready for Priya.</dwell>';
    const parsed = parseDisplayMarkup(raw, 240);
    expect(parsed.plainText).toBe('Checking inbox. Two emails skipped. Reply ready for Priya.');
    expect(parsed.moods).toEqual(['confident']);
    expect(parsed.totalDurationMs).toBeGreaterThan(1500);

    const early = stepPacedReveal(parsed, 150, 240);
    expect(early.done).toBe(false);
    expect(early.mood).toBe('confident');
    expect(early.visibleText.length).toBeGreaterThan(0);

    const end = stepPacedReveal(parsed, parsed.totalDurationMs + 200, 240);
    expect(end.done).toBe(true);
    expect(end.visibleText).toBe(parsed.plainText);
  });

  it('evaluates safe arithmetic, fmt(), and comparisons without dynamic code execution', () => {
    const env = { bill: 160, tip: 25, people: 4 };
    expect(evaluateSafeFormula('bill*(1+tip/100)/people', env)).toBe(50);
    expect(evaluateSafeFormula("fmt(bill*(1+tip/100),'money','USD')", env)).toBe('USD 200.00');
    expect(evaluateSafeFormula('tip>20', env)).toBe(true);
    expect(evaluateSafeFormula('max(tip, 10, 35)', env)).toBe(35);
  });

  it('parses & repairs <ui .../> markup and enforces G2 7x42 optical lens budget across presets', () => {
    const xml = `<ui frame="bogus" title="Lisbon Hotels"/>
<ui let="nights" be="3"/>
<ui id="tip" c="stepper" in="main" label="Guests" init="4" min="10" max="2" by="1"/>
<ui id="sum" c="facts" in="bottom" label="Budget" value="nights*tip*25" fmt="money:EUR"/>`;
    const repaired = parseOrRepairLiveUiXml(xml);
    expect(repaired).not.toBeNull();
    expect(repaired?.repairedCodes).toContain('frame_repaired');
    expect(repaired?.repairedCodes).toContain('range_repaired');

    for (const preset of ['pomodoro', 'split_bill', 'compare_models', 'reaction_game', 'launch_checklist']) {
      const surface = buildPresetLiveUi(preset);
      const stepped = reduceLiveUiAction(surface, { type: 'tap' });
      const g2 = formatLiveUiForG2(stepped);
      assertLensBudget(g2.lines);
      expect(g2.lines.length).toBeLessThanOrEqual(7);
    }

    const custom = synthesizeLiveUiFromPrompt('Build me a workout sprint checklist');
    expect(custom.components[0]?.kind).toBe('checklist');
    const before = Boolean(custom.components[0]?.rows?.[2]?.checked);
    const ticked = reduceLiveUiAction(custom, { type: 'tap', index: 2 });
    expect(ticked.components[0]?.rows?.[2]?.checked).toBe(!before);
  });
});

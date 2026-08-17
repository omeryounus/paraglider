import { describe, expect, it } from 'vitest';
import { createGlider } from './glider';

function namesOf(root: { traverse: (fn: (o: { name: string }) => void) => void }): string[] {
  const names: string[] = [];
  root.traverse((obj) => {
    if (obj.name) names.push(obj.name);
  });
  return names;
}

describe('createGlider scene graph', () => {
  it('builds a full person under a separate canopy with harness and suspension', () => {
    const visual = createGlider();
    const names = namesOf(visual.root);

    for (const required of [
      'Head',
      'Torso',
      'LeftArm',
      'RightArm',
      'LeftHand',
      'RightHand',
      'LeftLeg',
      'RightLeg',
      'LeftFoot',
      'RightFoot',
      'Harness',
      'ChestStrap',
      'SeatBase',
      'HarnessPack',
      'LeftCarabiner',
      'RightCarabiner',
      'LeftRiser',
      'RightRiser',
      'LeftRiserWeb_A',
      'RightRiserWeb_C',
      'Canopy',
      'Wing',
      'Suspension',
      'Pilot',
    ]) {
      expect(names, `missing ${required}`).toContain(required);
    }

    const left = visual.root.getObjectByName('LeftRiser')!;
    const right = visual.root.getObjectByName('RightRiser')!;
    expect(right.position.x - left.position.x).toBeGreaterThan(0.3);
    expect(right.position.x - left.position.x).toBeLessThan(0.42);

    expect(visual.canopy.position.y).toBeGreaterThan(2.5);
    expect(visual.root.getObjectByName('Pilot')!.position.y).toBeLessThan(visual.canopy.position.y);
    expect(visual.lines.name).toBe('Suspension');
    const riserParent = visual.root.getObjectByName('LeftRiser')!.parent?.name;
    expect(['Harness', 'Torso', 'Pilot']).toContain(riserParent);
    expect(visual.root.getObjectByName('Canopy')).not.toBe(visual.root.getObjectByName('Pilot'));
    expect(visual.root.children.map((c) => c.name)).toEqual(
      expect.arrayContaining(['Canopy', 'Pilot', 'Suspension']),
    );
  });
});

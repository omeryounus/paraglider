import fs from 'fs';
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
} from 'docx';

const p = (text, opts = {}) =>
  new Paragraph({
    spacing: { after: 200, line: 276 },
    ...opts,
    children: [new TextRun({ text, font: 'Arial', size: 22, ...opts.run })],
  });

const h = (text) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 280, after: 120 },
    children: [new TextRun({ text, font: 'Arial', size: 26, bold: true })],
  });

const doc = new Document({
  styles: {
    default: { document: { run: { font: 'Arial', size: 22 } } },
    paragraphStyles: [
      {
        id: 'Heading1',
        name: 'Heading 1',
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: { size: 26, bold: true, font: 'Arial' },
        paragraph: { spacing: { before: 280, after: 120 }, outlineLevel: 0 },
      },
    ],
  },
  sections: [
    {
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      children: [
        new Paragraph({
          alignment: AlignmentType.LEFT,
          spacing: { after: 240 },
          children: [new TextRun({ text: 'Design-Intent Document', font: 'Arial', size: 32, bold: true })],
        }),

        h('1. Game title and genre'),
        p('Aero Glide: Canyon Rush — Survival & Resource Management'),

        h('2. Target player and pitch'),
        p(
          'For mobile players who like short survival sessions. You launch a torn wing down a ridge, pick up scrap in the air, patch the canopy, and land the valley pad before the storm, freeze, or a shredded wing ends the run. One sitting, one ridge, one retry.',
        ),

        h('3. How to play (controls)'),
        p(
          'Portrait phone: left and right thumb sliders bank the wing. Gold packs are fabric. Teal packs are cord. The bottom drawer crafts Patch (2 fabric), Bind (2 cord), and Heat wrap (1 fabric + 1 cord). Flare sticks the pad. Blue columns are heat.',
        ),
        p(
          'Desktop (same loop): A/D bank; 1/2/3 craft; Space flares; R retries. Goal: gather, convert, land. Fail states: freeze, shred, crash, or whiteout. Play Again resets the same ridge.',
        ),

        h('4. Core loop'),
        p(
          'Gather fabric and cord from salvage floating on the line. Convert them: Patch restores canopy integrity, Bind slows storm tear, Heat wrap restores warmth. Thermals refill warmth without a craft. The storm is the escalating threat: over ninety seconds it ramps wind, fog, and canopy tear. You feel the gather-versus-defend trade-off every time you veer off line for scrap instead of running the pad.',
        ),
        p(
          'Win: land the pad with canopy and warmth left. Lose: warmth hits zero, canopy shreds, terrain, or the front arrives. Reset: retry. Meters at the top and the craft drawer at the thumbs make the state readable at a glance.',
        ),

        h('5. What is in this prototype'),
        p(
          'Playable now: one alpine survival session. Salvage pickups, three crafts, canopy / warmth / storm meters, thermals, a shear, pad landing, portrait craft drawer, seated pilot and ram-air wing, offline Web Audio. Win / lose / retry.',
        ),
        p(
          'Not in this build: multiplayer, day/night cycles, a sprawling tech tree, IAP, accounts, ads, or any network call.',
        ),

        h('6. Progression and signature twist'),
        p(
          'Early, the storm is quiet and you gather. Mid-run you must spend scrap on a Patch or keep flying a thinning wing. Late, the front closes: craft and dive for the pad, or freeze and shred. One loop, deeper pressure, no extra modes.',
        ),
        p(
          'Signature twist to validate: the survival meters sit on a live wing you still have to fly. Crafting is not a pause menu. It is a thumb choice while the ridge keeps moving.',
        ),

        h('7. Future-state vision'),
        p(
          'Rebuild as a portrait Horizon title: the same gather-craft-land ridge, local ghosts of your best survival line, and a short course workshop so players publish new valleys without leaving that loop.',
        ),
      ],
    },
  ],
});

const out = new URL('./DESIGN_INTENT.docx', import.meta.url);
Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(out, buf);
  console.log('wrote', out.pathname, buf.length);
});

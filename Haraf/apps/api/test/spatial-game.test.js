import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GameService } from '../src/services/gameService.js';
import { GameLibraryService } from '../src/services/gameLibraryService.js';
import { hasValidSpatialTarget, validateSpatialPlacement } from '../src/games/spatialValidation.js';
import { createGameRepository } from '../src/db/gameRepository.js';
import { GameAnswerReceipt } from '../src/models/GameAnswerReceipt.js';
import { createGameSchema } from '../src/validation/gameLibrary.js';

const spatial = {
  level: 1,
  difficulty: 'beginner',
  scene: {
    backgroundAssetId: null,
    aspectRatio: 1.6,
    objects: [
      { id: 'ball', label: 'الكرة', assetId: null, movable: true, x: 50, y: 450, width: 100, height: 100, layer: 2 },
      { id: 'box', label: 'الصندوق', assetId: null, movable: false, x: 600, y: 300, width: 300, height: 400, layer: 1 },
      { id: 'chair', label: 'الكرسي', assetId: null, movable: false, x: 100, y: 250, width: 180, height: 180, layer: 1 }
    ]
  },
  steps: [{
    id: 'inside-box',
    instruction: 'ضع الكرة داخل الصندوق.',
    instructionAudioAssetId: null,
    movableObjectId: 'ball',
    relationship: 'inside',
    targetObjectId: 'box',
    secondTargetObjectId: null,
    targetRegion: { x: 660, y: 370, width: 180, height: 220 },
    tolerance: 10
  }],
  assistance: { enabled: true, visualHintAfter: 2, demonstrationAfter: 4 }
};

test('spatial placement validation evaluates object dimensions and the configured relationship', () => {
  assert.equal(validateSpatialPlacement(spatial, 0, { x: 700, y: 420 }), true);
  assert.equal(validateSpatialPlacement(spatial, 0, { x: 500, y: 420 }), false);
  assert.equal(validateSpatialPlacement(spatial, 0, { x: 630, y: 420 }), false);

  const outside = structuredClone(spatial);
  outside.steps[0] = {
    ...outside.steps[0],
    relationship: 'outside',
    targetRegion: { x: 600, y: 300, width: 300, height: 400 }
  };
  assert.equal(validateSpatialPlacement(outside, 0, { x: 100, y: 500 }), true);
  assert.equal(validateSpatialPlacement(outside, 0, { x: 650, y: 400 }), false);

  const above = structuredClone(spatial);
  above.steps[0] = {
    ...above.steps[0],
    relationship: 'above',
    targetRegion: { x: 300, y: 100, width: 250, height: 140 }
  };
  assert.equal(validateSpatialPlacement(above, 0, { x: 350, y: 120 }), true);
  assert.equal(validateSpatialPlacement(above, 0, { x: 350, y: 300 }), false);

  const front = structuredClone(spatial);
  front.steps[0] = { ...front.steps[0], relationship: 'front', targetRegion: { x: 300, y: 100, width: 250, height: 140 } };
  assert.equal(validateSpatialPlacement(front, 0, { x: 350, y: 120 }), true);
  front.scene.objects[0].layer = 0;
  assert.equal(validateSpatialPlacement(front, 0, { x: 350, y: 120 }), false);
});

test('spatial between and next-to checks use their target area and configured tolerance', () => {
  const between = structuredClone(spatial);
  between.scene.objects[1] = { ...between.scene.objects[1], x: 150, y: 400, width: 100, height: 100 };
  between.scene.objects[2] = { ...between.scene.objects[2], x: 650, y: 400, width: 100, height: 100 };
  between.steps[0] = {
    ...between.steps[0],
    relationship: 'between',
    targetObjectId: 'box',
    secondTargetObjectId: 'chair',
    targetRegion: { x: 350, y: 400, width: 200, height: 120 },
    tolerance: 40
  };
  assert.equal(validateSpatialPlacement(between, 0, { x: 400, y: 410 }), true);
  assert.equal(validateSpatialPlacement(between, 0, { x: 520, y: 410 }), false);

  const nextTo = structuredClone(spatial);
  nextTo.steps[0] = {
    ...nextTo.steps[0],
    relationship: 'next-to',
    targetRegion: { x: 490, y: 300, width: 100, height: 180 },
    tolerance: 30
  };
  assert.equal(validateSpatialPlacement(nextTo, 0, { x: 490, y: 320 }), true);
  assert.equal(validateSpatialPlacement(nextTo, 0, { x: 350, y: 320 }), false);
});

test('spatial outside targets are checked across the full scene when publishing', () => {
  const outside = structuredClone(spatial);
  outside.steps[0] = {
    ...outside.steps[0],
    relationship: 'outside',
    targetRegion: { x: 600, y: 300, width: 300, height: 400 },
    tolerance: 10
  };
  assert.equal(hasValidSpatialTarget(outside, 0), true);

  outside.steps[0].targetRegion = { x: 0, y: 0, width: 1000, height: 1000 };
  assert.equal(hasValidSpatialTarget(outside, 0), false);
});

test('spatial receipt upserts do not apply defaults over atomic metric increments', async () => {
  const originalFindOneAndUpdate = GameAnswerReceipt.findOneAndUpdate;
  let capturedOptions;
  let capturedUpdate;
  GameAnswerReceipt.findOneAndUpdate = async (_filter, update, options) => {
    capturedUpdate = update;
    capturedOptions = options;
    return { spatialMetrics: { incorrectAttempts: 0 } };
  };
  try {
    const repository = createGameRepository();
    const receipt = await repository.recordSpatialReceipt({
      parentUserId: '000000000000000000000001',
      childId: '000000000000000000000002',
      gameId: 'spatial-test',
      gameVersion: '1',
      submissionId: '4c4a4b83-2f19-4aeb-9a4f-b76545258090',
      questionIndex: 0,
      action: 'placement',
      correct: false,
      now: new Date('2026-10-30T12:00:00Z'),
      expiresAt: new Date('2026-10-31T12:00:00Z')
    });
    assert.equal(receipt.spatialMetrics.incorrectAttempts, 0);
    assert.equal(capturedOptions.upsert, true);
    assert.equal(capturedOptions.setDefaultsOnInsert, false);
    assert.equal('correct' in capturedUpdate.$setOnInsert, false);
    assert.equal('answerIndex' in capturedUpdate.$setOnInsert, false);
    assert.equal(capturedUpdate.$set.correct, false);
  } finally {
    GameAnswerReceipt.findOneAndUpdate = originalFindOneAndUpdate;
  }
});

test('spatial content is validated as a scene with referenced movable and static objects', () => {
  const content = {
    template: 'spatial-relationships',
    title: 'فين المكان؟',
    description: 'نشاط لفهم العلاقات المكانية.',
    companion: 'حرف',
    companionAnimal: '🐢',
    instructions: 'استمع للتعليمة ثم حرّك العنصر.',
    questions: [],
    assetAssignments: [],
    spatial
  };
  assert.equal(createGameSchema.safeParse({ gameId: 'spatial-test', content }).success, true);
  const invalid = structuredClone(content);
  invalid.spatial.steps[0].targetObjectId = 'missing-object';
  assert.equal(createGameSchema.safeParse({ gameId: 'spatial-test', content: invalid }).success, false);
});

test('spatial publishing requires playable image assets and returns safe asset URLs', async () => {
  const content = {
    template: 'spatial-relationships',
    title: 'فين المكان؟',
    description: 'نشاط لفهم العلاقات المكانية.',
    companion: 'حرف',
    companionAnimal: '🐢',
    instructions: 'استمع للتعليمة ثم حرّك العنصر.',
    questions: [],
    assetAssignments: [],
    spatial: structuredClone(spatial)
  };
  const imageIds = ['000000000000000000000001', '000000000000000000000002', '000000000000000000000003'];
  const assets = imageIds.map((id) => ({ id, kind: 'image', active: true, mimeType: 'image/png' }));
  const repository = {
    async findAssetsByIds(ids) { return assets.filter(({ id }) => ids.includes(id)); },
    async findDefinition() { return { gameId: 'spatial-test', status: 'published', publishedVersion: 1 }; },
    async findVersion() { return { gameId: 'spatial-test', version: 1, content, assetIds: imageIds }; }
  };
  const mediaAssetService = {
    async readAssetFile() { return Buffer.from('image'); },
    async isAvailable() { return true; }
  };
  const service = new GameLibraryService({ repository, mediaAssetService });
  await assert.rejects(
    () => service.validateAssignments(content, { requireComplete: true }),
    (error) => error.code === 'SPATIAL_IMAGE_REQUIRED'
  );

  content.spatial.scene.objects.forEach((item, index) => { item.assetId = imageIds[index]; });
  await service.validateAssignments(content, { requireComplete: true });
  const playable = await service.getPlayableGame('spatial-test');
  assert.equal(playable.template, 'spatial-relationships');
  assert.equal(playable.questionCount, 1);
  assert.equal(playable.spatial.scene.objects[0].imageUrl, `/api/v1/media/${imageIds[0]}`);
});

test('server scores spatial progress from validated placement receipts, not client scores', async () => {
  const parentUserId = 'parent-id';
  const childId = 'child-id';
  const submissionId = '4c4a4b83-2f19-4aeb-9a4f-b76545258090';
  const now = new Date('2026-10-30T12:00:00Z');
  const receipts = new Map();
  const attempts = new Map();
  const repository = {
    async recordSpatialReceipt(data) {
      const current = receipts.get(data.questionIndex) ?? {
        questionIndex: data.questionIndex,
        correct: false,
        answerIndex: -1,
        spatialMetrics: { attempts: 0, incorrectAttempts: 0, instructionReplays: 0, hintsUsed: 0, demonstrationsUsed: 0, startedAt: data.now }
      };
      if (data.action === 'placement') {
        current.spatialMetrics.attempts += 1;
        if (!data.correct) current.spatialMetrics.incorrectAttempts += 1;
        current.correct = data.correct;
        current.answerIndex = data.correct ? 0 : -1;
      } else if (data.action === 'instruction_replay') current.spatialMetrics.instructionReplays += 1;
      else if (data.action === 'hint') current.spatialMetrics.hintsUsed += 1;
      else if (data.action === 'demonstration') current.spatialMetrics.demonstrationsUsed += 1;
      receipts.set(data.questionIndex, current);
      return current;
    },
    async listAnswerReceipts() { return [...receipts.values()].sort((a, b) => a.questionIndex - b.questionIndex); },
    async findAttemptBySubmission() { return null; },
    async createAttempt(data) { attempts.set(data.submissionId, data); return data; },
    async deleteAnswerReceipts() {}
  };
  const content = { template: 'spatial-relationships', questions: [], spatial };
  const service = new GameService({
    repository,
    childService: {
      async getOwnedChild() { return { status: 'active' }; },
      async listConsents() { return [{ consentType: 'learning_data', granted: true }]; }
    },
    gameLibraryService: {
      async getScoringGame() { return { version: 3, content }; },
      async getTrialGameIds() { return []; }
    },
    learningPathService: {
      async assertActivityConfigured() {},
      async assertActivityPlayable() {}
    },
    subscriptionService: { async requireActive() {} },
    now: () => now
  });
  const interaction = {
    gameVersion: '3',
    questionIndex: 0,
    parentUserId,
    childId,
    submissionId
  };
  const rejected = await service.checkAnswer('spatial-test', {
    ...interaction,
    action: 'placement',
    position: { x: 500, y: 420 }
  });
  assert.equal(rejected.correct, false);
  const accepted = await service.checkAnswer('spatial-test', {
    ...interaction,
    action: 'placement',
    position: { x: 700, y: 420 }
  });
  assert.equal(accepted.correct, true);
  await service.checkAnswer('spatial-test', { ...interaction, action: 'instruction_replay' });

  const attempt = await service.recordChildAttempt(parentUserId, 'spatial-test', {
    childId,
    submissionId,
    gameVersion: '3',
    durationSeconds: 1
  });
  assert.equal(attempt.correctCount, 1);
  assert.equal(attempt.totalQuestions, 1);
  assert.equal(attempt.spatialProgress.incorrectAttempts, 1);
  assert.equal(attempt.spatialProgress.instructionReplays, 1);
  assert.equal(attempt.spatialProgress.completionPercent, 100);
  assert.equal(attempt.spatialProgress.level, 1);
  assert.equal(attempt.durationSeconds, 0);
});

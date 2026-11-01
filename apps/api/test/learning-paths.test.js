import assert from 'node:assert/strict';
import test from 'node:test';
import { LearningPathService } from '../src/services/learningPathService.js';
import {
  questionnaireSchema,
  questionnaireSubmissionSchema
} from '../src/validation/learningPath.js';

const questionnaire = {
  version: 3,
  maxAssignments: 2,
  questions: [{
    id: 'learning-goals',
    text: 'ما المهارات التي ترغب في تنميتها؟',
    type: 'multiple',
    required: true,
    options: [
      { id: 'goal-listening', label: 'الاستماع', skillIds: ['listening'] },
      { id: 'goal-vocabulary', label: 'المفردات', skillIds: ['vocabulary'] }
    ]
  }]
};

function createService() {
  return new LearningPathService({
    repository: {
      async getActiveQuestionnaire() { return questionnaire; },
      async listPaths() {
        return [
          {
            key: 'listening-path',
            title: 'مسار الاستماع',
            description: 'أنشطة الاستماع',
            status: 'published',
            activities: [{ gameId: 'published-game' }],
            matchingRules: {
              skillIds: ['listening'],
              answerOptionIds: ['goal-listening'],
              minimumMatches: 2,
              priority: 8,
              assignmentType: 'primary'
            }
          },
          {
            key: 'draft-path',
            title: 'مسودة',
            description: 'غير منشور',
            status: 'draft',
            activities: [{ gameId: 'published-game' }],
            matchingRules: { skillIds: ['listening'], minimumMatches: 1 }
          },
          {
            key: 'trial-path',
            title: 'مسار اللعبة التجريبية',
            description: 'يجب استبعاده',
            status: 'published',
            activities: [{ gameId: 'trial-game' }],
            matchingRules: { skillIds: ['listening'], minimumMatches: 1 }
          }
        ];
      },
      async listPublishedActivities() {
        return [{ gameId: 'published-game' }, { gameId: 'trial-game' }];
      },
      async getTrialGameId() { return { value: 'trial-game' }; }
    },
    gameRepository: {},
    childService: {
      async getOwnedChild() {
        return { status: 'active', ageBand: '6-8' };
      }
    },
    subscriptionService: {},
    authService: null
  });
}

test('recommendations are server-derived from a published questionnaire and exclude drafts and trial games', async () => {
  const service = createService();
  const input = {
    questionnaireVersion: 3,
    submissionId: '401f6e5c-1d3f-4e56-8f12-89b25ab66703',
    answers: { 'learning-goals': ['goal-listening'] }
  };
  const result = await service.previewRecommendations('parent-id', 'child-id', input);

  assert.deepEqual(result.recommendations.map(({ key, assignmentType }) => ({ key, assignmentType })), [
    { key: 'listening-path', assignmentType: 'primary' }
  ]);
  assert.match(result.recommendations[0].reason, /الاستماع/);
  assert.match(result.note, /ليست تشخيصًا/);
});

test('recommendation preview rejects stale versions and unrecognized option IDs', async () => {
  const service = createService();
  const baseInput = {
    questionnaireVersion: 3,
    submissionId: '401f6e5c-1d3f-4e56-8f12-89b25ab66703',
    answers: { 'learning-goals': ['goal-listening'] }
  };

  await assert.rejects(
    service.previewRecommendations('parent-id', 'child-id', { ...baseInput, questionnaireVersion: 2 }),
    { code: 'LEARNING_QUESTIONNAIRE_OUTDATED' }
  );
  await assert.rejects(
    service.previewRecommendations('parent-id', 'child-id', {
      ...baseInput,
      answers: { 'learning-goals': ['unmapped-option'] }
    }),
    { code: 'LEARNING_QUESTIONNAIRE_INVALID_ANSWER' }
  );
});

test('required multiple-choice questions reject empty selections for pending child registrations', async () => {
  const service = createService();
  service.childService.getOwnedChild = async () => ({ status: 'pending_registration', ageBand: '6-8' });
  await assert.rejects(
    service.previewRecommendations('parent-id', 'child-id', {
      questionnaireVersion: 3,
      submissionId: '401f6e5c-1d3f-4e56-8f12-89b25ab66703',
      answers: { 'learning-goals': [] }
    }),
    { code: 'LEARNING_QUESTIONNAIRE_INCOMPLETE' }
  );
});

test('initial child registration assigns only server recommendations before activating the child', async () => {
  const assignments = [];
  const responses = [];
  const child = { status: 'pending_registration', ageBand: '6-8' };
  const path = {
    key: 'listening-path',
    title: 'مسار الاستماع',
    description: 'أنشطة الاستماع',
    status: 'published',
    activities: [{ gameId: 'published-game', title: 'لعبة منشورة', learningArea: 'الاستماع', description: 'نشاط' }],
    matchingRules: { skillIds: ['listening'], minimumMatches: 1, assignmentType: 'primary' }
  };
  const repository = {
    async getActiveQuestionnaire() { return questionnaire; },
    async listPaths() { return [path]; },
    async listPublishedActivities() { return [{ gameId: 'published-game' }]; },
    async getTrialGameId() { return { value: 'trial-game' }; },
    async getQuestionnaireVersion() { return questionnaire; },
    async getQuestionnaireResponse() { return null; },
    async saveQuestionnaireResponse(data) { responses.push(data); return data; },
    async assignPath(data) { assignments.push(data); return data; },
    async listChildAssignments() { return []; }
  };
  const childService = {
    async getOwnedChild() { return child; },
    async listConsents() { return [{ consentType: 'learning_data', granted: true }]; },
    async completeRegistration() { child.status = 'active'; return { id: 'child-id', status: child.status }; }
  };
  const service = new LearningPathService({
    repository,
    childService,
    gameRepository: {},
    subscriptionService: {},
    authService: null
  });
  const result = await service.completeChildRegistration('parent-id', 'child-id', {
    questionnaireVersion: 3,
    submissionId: '401f6e5c-1d3f-4e56-8f12-89b25ab66703',
    answers: { 'learning-goals': ['goal-listening'] },
    pathKeys: ['listening-path']
  });

  assert.equal(result.child.status, 'active');
  assert.deepEqual(assignments.map(({ pathKey, assignmentType }) => ({ pathKey, assignmentType })), [
    { pathKey: 'listening-path', assignmentType: 'primary' }
  ]);
  assert.equal(responses.length, 1);
});

test('initial registration with no matching path preserves answers and stays pending for review', async () => {
  const savedDrafts = [];
  const responses = [];
  const child = { status: 'pending_registration', ageBand: '6-8' };
  const repository = {
    async getActiveQuestionnaire() { return questionnaire; },
    async listPaths() { return []; },
    async listPublishedActivities() { return []; },
    async getTrialGameId() { return { value: 'trial-game' }; },
    async getQuestionnaireVersion() { return questionnaire; },
    async getQuestionnaireResponse() { return null; },
    async saveQuestionnaireResponse(data) { responses.push(data); return data; },
    async assignPath() { assert.fail('A path must not be assigned when there is no match.'); }
  };
  const childService = {
    async getOwnedChild() { return child; },
    async listConsents() { return [{ consentType: 'learning_data', granted: true }]; },
    async saveRegistrationDraft(_parentId, _childId, draft) { savedDrafts.push(draft); return draft; },
    async completeRegistration() { assert.fail('A child without an initial path must remain pending.'); }
  };
  const service = new LearningPathService({
    repository,
    childService,
    gameRepository: {},
    subscriptionService: {},
    authService: null
  });
  const answers = { 'learning-goals': ['goal-listening'] };
  const result = await service.completeChildRegistration('parent-id', 'child-id', {
    questionnaireVersion: 3,
    submissionId: '401f6e5c-1d3f-4e56-8f12-89b25ab66703',
    answers,
    pathKeys: []
  });

  assert.equal(result.needsReview, true);
  assert.deepEqual(responses[0].answers, answers);
  assert.equal(savedDrafts[0].step, 'needs_review');
  assert.equal(child.status, 'pending_registration');
});

test('questionnaire submission schema constrains IDs, answer shapes, and retry identifiers', () => {
  assert.equal(questionnaireSubmissionSchema.safeParse({
    questionnaireVersion: 3,
    submissionId: '401f6e5c-1d3f-4e56-8f12-89b25ab66703',
    answers: { 'learning-goals': ['goal-listening', 'goal-vocabulary'] }
  }).success, true);
  assert.equal(questionnaireSubmissionSchema.safeParse({
    questionnaireVersion: 3,
    submissionId: 'not-a-uuid',
    answers: { 'learning-goals': ['goal-listening'] }
  }).success, false);
});

test('questionnaire editor rejects option IDs reused across questions', () => {
  assert.equal(questionnaireSchema.safeParse({
    maxAssignments: 1,
    questions: [
      {
        id: 'question-one',
        text: 'سؤال أول',
        type: 'single',
        required: true,
        options: [
          { id: 'shared-option', label: 'اختيار ١', skillIds: ['listening'] },
          { id: 'option-two', label: 'اختيار ٢', skillIds: [] }
        ]
      },
      {
        id: 'question-two',
        text: 'سؤال ثانٍ',
        type: 'single',
        required: true,
        options: [
          { id: 'shared-option', label: 'اختيار ٣', skillIds: [] },
          { id: 'option-four', label: 'اختيار ٤', skillIds: [] }
        ]
      }
    ]
  }).success, false);
});

test('only parent-confirmed recommendations are stored after child ownership and learning consent checks', async () => {
  const questionnaireResponses = new Map();
  const assignments = [];
  const base = createService();
  base.repository.getQuestionnaireResponse = async (_parentId, _childId, submissionId) => (
    questionnaireResponses.get(submissionId) ?? null
  );
  base.repository.getQuestionnaireVersion = async () => questionnaire;
  base.repository.saveQuestionnaireResponse = async (data) => {
    questionnaireResponses.set(data.submissionId, data);
    return data;
  };
  base.repository.assignPath = async (data) => {
    assignments.push(data);
    return data;
  };
  base.childService.listConsents = async () => [
    { consentType: 'learning_data', granted: true }
  ];

  const input = {
    questionnaireVersion: 3,
    submissionId: '401f6e5c-1d3f-4e56-8f12-89b25ab66703',
    answers: { 'learning-goals': ['goal-listening'] },
    pathKeys: ['listening-path']
  };
  const result = await base.confirmPathAssignments('parent-id', 'child-id', input);
  assert.equal(result.assignments.length, 1);
  assert.equal(assignments[0].source, 'parent');
  assert.equal(assignments[0].pathKey, 'listening-path');
  assert.equal(questionnaireResponses.get(input.submissionId).recommendationKeys[0], 'listening-path');

  await assert.rejects(
    base.confirmPathAssignments('parent-id', 'child-id', { ...input, pathKeys: ['draft-path'] }),
    { code: 'LEARNING_ASSIGNMENT_INVALID' }
  );
  await assert.rejects(
    base.confirmPathAssignments('parent-id', 'child-id', { ...input, pathKeys: [] }),
    { code: 'LEARNING_SUBMISSION_CONFLICT' }
  );

  base.childService.listConsents = async () => [];
  await assert.rejects(
    base.confirmPathAssignments('parent-id', 'child-id', {
      ...input,
      submissionId: '501f6e5c-1d3f-4e56-8f12-89b25ab66703'
    }),
    { code: 'LEARNING_CONSENT_REQUIRED' }
  );
});

test('activity launches require membership in an assigned path and respect locked activity order', async () => {
  const service = createService();
  service.childService.listConsents = async () => [{ consentType: 'learning_data', granted: true }];
  service.repository.listChildAssignments = async () => [];
  service.getChildLearningOverview = async () => ({
    paths: [{
      key: 'listening-path',
      status: 'active',
      activities: [
        { gameId: 'published-game', status: 'available' },
        { gameId: 'locked-game', status: 'upcoming' }
      ]
    }]
  });

  await service.assertActivityPlayable('parent-id', 'child-id', 'published-game');
  await assert.rejects(
    service.assertActivityPlayable('parent-id', 'child-id', 'unassigned-game'),
    { code: 'LEARNING_ACTIVITY_UNAVAILABLE' }
  );
  await assert.rejects(
    service.assertActivityPlayable('parent-id', 'child-id', 'locked-game'),
    { code: 'LEARNING_ACTIVITY_LOCKED' }
  );
  service.getChildLearningOverview = async () => ({ paths: [] });
  await assert.rejects(
    service.assertActivityPlayable('parent-id', 'child-id', 'unassigned-game'),
    { code: 'LEARNING_ACTIVITY_UNAVAILABLE' }
  );
});

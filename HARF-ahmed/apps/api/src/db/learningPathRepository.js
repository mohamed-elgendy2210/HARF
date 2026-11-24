import { GameDefinition } from '../models/GameDefinition.js';
import { GameSetting } from '../models/GameSetting.js';
import { GameVersion } from '../models/GameVersion.js';
import { LearningPath } from '../models/LearningPath.js';
import { LearningProgress } from '../models/LearningProgress.js';
import { LearningPathAssignment } from '../models/LearningPathAssignment.js';
import { LearningQuestionnaire } from '../models/LearningQuestionnaire.js';
import { LearningQuestionnaireResponse } from '../models/LearningQuestionnaireResponse.js';
import { initialQuestionnaire } from './learningPathSeed.js';

async function loadPublishedActivities(gameIds = null) {
  const definitions = await GameDefinition.find({
    status: 'published',
    publishedVersion: { $gt: 0 },
    ...(gameIds ? { gameId: { $in: gameIds } } : {})
  }).select('gameId publishedVersion').lean();
  if (!definitions.length) return [];
  const versions = await GameVersion.find({
    $or: definitions.map(({ gameId, publishedVersion }) => ({ gameId, version: publishedVersion }))
  }).select('gameId version content').lean();
  const versionsByKey = new Map(versions.map((version) => [`${version.gameId}:${version.version}`, version]));
  return definitions.flatMap((definition) => {
    const version = versionsByKey.get(`${definition.gameId}:${definition.publishedVersion}`);
    return version ? [{
      gameId: definition.gameId,
      publishedVersion: definition.publishedVersion,
      draftContent: version.content
    }] : [];
  });
}

export async function ensureLearningPathIndexes() {
  await Promise.all([
    LearningPath.createIndexes(),
    LearningProgress.createIndexes(),
    LearningPathAssignment.createIndexes(),
    LearningQuestionnaire.createIndexes(),
    LearningQuestionnaireResponse.createIndexes()
  ]);
}

export async function seedLearningPath() {
  const activeQuestionnaire = await LearningQuestionnaire.findOne({ status: 'published' }).select('_id').lean();
  if (!activeQuestionnaire) {
    const latestQuestionnaire = await LearningQuestionnaire.findOne().sort({ version: -1 }).select('version').lean();
    try {
      await LearningQuestionnaire.create({
        version: (latestQuestionnaire?.version ?? 0) + 1,
        ...initialQuestionnaire
      });
    } catch (error) {
      if (error?.code !== 11000) throw error;
      const concurrentSeed = await LearningQuestionnaire.findOne({ status: 'published' }).select('_id').lean();
      if (!concurrentSeed) throw error;
    }
  }

  const definitionIds = await loadPublishedActivities([
    'word-sounds',
    'word-match',
    'matching-pairs',
    'animal-sounds'
  ]);
  const trial = await GameSetting.findOne({ key: 'trialGameIds' }).select('value').lean()
    ?? await GameSetting.findOne({ key: 'trialGameId' }).select('value').lean();
  const trialIds = Array.isArray(trial?.value) ? trial.value : [trial?.value].filter(Boolean);
  const activities = definitionIds
    .filter(({ gameId }) => !trialIds.includes(gameId))
    .map(({ gameId, draftContent }) => ({
      gameId,
      title: draftContent.title,
      learningArea: gameId === 'animal-sounds'
        ? 'تمييز أصوات الحيوانات'
        : gameId === 'word-sounds' ? 'تمييز الأصوات' : 'ربط الكلمات والصور',
      description: draftContent.description
    }));
  if (!activities.length) return;

  const existing = await LearningPath.findOne({ key: 'default' }).lean();
  if (!existing) {
    await LearningPath.create({
        key: 'default',
        title: 'خطوات التعلّم',
        description: 'أنشطة تعليمية متدرجة يمكن تكرارها والعودة إلى أي نشاط سابق.',
        activities,
        rules: { minimumAttempts: 3, sampleSize: 5, targetAccuracyPercent: 75 },
        updatedBy: null
    });
  } else {
    const existingIds = new Set(existing.activities.map(({ gameId }) => gameId));
    const additions = activities.filter(({ gameId }) => !existingIds.has(gameId));
    const updates = {};
    if (additions.length > 0) updates.activities = [...existing.activities, ...additions];
    if (!existing.status) updates.status = 'published';
    if (Object.keys(updates).length > 0) {
      await LearningPath.updateOne(
        { key: 'default' },
        { $set: updates }
      );
    }
  }

  const recommendationPaths = [
    {
      key: 'listening-sounds',
      title: 'مسار الاستماع والأصوات',
      description: 'أنشطة للتفاعل مع الأصوات وفهمها تدريجيًا.',
      gameIds: ['word-sounds', 'animal-sounds'],
      skillIds: ['listening', 'sound-awareness'],
      answerOptionIds: ['goal-listening', 'goal-sounds'],
      priority: 100
    },
    {
      key: 'visual-vocabulary',
      title: 'مسار الصور والمفردات',
      description: 'أنشطة للتعرّف على الصور وربطها بالمفردات.',
      gameIds: ['word-match', 'matching-pairs'],
      skillIds: ['visual-recognition', 'vocabulary'],
      answerOptionIds: ['goal-vocabulary'],
      priority: 90
    },
    {
      key: 'communication-practice',
      title: 'مسار التواصل والتعبير',
      description: 'أنشطة تفاعلية تشجّع التواصل والتعبير.',
      gameIds: ['word-sounds', 'word-match'],
      skillIds: ['communication', 'expression'],
      answerOptionIds: ['goal-expression'],
      priority: 80
    }
  ];
  const activitySkills = {
    'word-sounds': ['listening', 'sound-awareness', 'communication', 'expression'],
    'animal-sounds': ['listening', 'sound-awareness'],
    'word-match': ['visual-recognition', 'vocabulary', 'communication', 'expression'],
    'matching-pairs': ['visual-recognition', 'vocabulary']
  };
  const availableById = new Map(activities.map((activity) => [activity.gameId, activity]));
  for (const definition of recommendationPaths) {
    const configuredActivities = definition.gameIds
      .map((gameId) => availableById.get(gameId))
      .filter(Boolean)
      .map((activity) => ({
        ...activity,
        skillIds: definition.skillIds.filter((skillId) => activitySkills[activity.gameId]?.includes(skillId))
      }));
    if (!configuredActivities.length) continue;
    await LearningPath.updateOne({ key: definition.key }, {
      $setOnInsert: {
        key: definition.key,
        title: definition.title,
        description: definition.description,
        status: 'published',
        skillIds: definition.skillIds,
        objectives: definition.skillIds,
        matchingRules: {
          skillIds: definition.skillIds,
          answerOptionIds: definition.answerOptionIds,
          minimumMatches: 1,
          priority: definition.priority,
          assignmentType: 'either'
        },
        activities: configuredActivities,
        rules: { minimumAttempts: 3, sampleSize: 5, targetAccuracyPercent: 75 },
        updatedBy: null
      }
    }, { upsert: true });
  }
}

export function createLearningPathRepository() {
  return {
    getPath() {
      return LearningPath.findOne({ key: 'default' }).lean();
    },
    updatePath(updates) {
      return LearningPath.findOneAndUpdate(
        { key: 'default' },
        { $set: updates },
        { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
      ).lean();
    },
    listPaths() {
      return LearningPath.find({}).sort({ status: 1, title: 1 }).lean();
    },
    createPath(data) {
      return LearningPath.create(data).then((path) => path.toObject());
    },
    updatePathByKey(key, updates) {
      return LearningPath.findOneAndUpdate(
        { key },
        { $set: updates },
        { new: true, runValidators: true }
      ).lean();
    },
    getPathByKey(key) {
      return LearningPath.findOne({ key }).lean();
    },
    getActiveQuestionnaire() {
      return LearningQuestionnaire.findOne({ status: 'published' }).sort({ version: -1 }).lean();
    },
    getQuestionnaireVersion(version) {
      return LearningQuestionnaire.findOne({ version }).lean();
    },
    async publishQuestionnaire(actorId, input) {
      let questionnaire;
      for (let attempt = 0; attempt < 3 && !questionnaire; attempt += 1) {
        const latest = await LearningQuestionnaire.findOne().sort({ version: -1 }).select('version').lean();
        const version = (latest?.version ?? 0) + 1;
        try {
          questionnaire = await LearningQuestionnaire.create({
            ...input,
            version,
            status: 'published',
            updatedBy: actorId
          });
        } catch (error) {
          if (error?.code !== 11000 || attempt === 2) throw error;
        }
      }
      await LearningQuestionnaire.updateMany(
        { status: 'published', version: { $lt: questionnaire.version } },
        { $set: { status: 'archived' } }
      );
      return questionnaire.toObject();
    },
    async saveQuestionnaireResponse(data) {
      const filter = {
        parentUserId: data.parentUserId,
        childId: data.childId,
        submissionId: data.submissionId
      };
      try {
        return await LearningQuestionnaireResponse.findOneAndUpdate(
          filter,
          { $setOnInsert: data },
          { new: true, upsert: true, runValidators: true }
        ).lean();
      } catch (error) {
        if (error?.code !== 11000) throw error;
        const existing = await LearningQuestionnaireResponse.findOne(filter).lean();
        if (!existing) throw error;
        return existing;
      }
    },
    getQuestionnaireResponse(parentUserId, childId, submissionId) {
      return LearningQuestionnaireResponse.findOne({ parentUserId, childId, submissionId }).lean();
    },
    listQuestionnaireResponses(parentUserId, childId) {
      return LearningQuestionnaireResponse.find({ parentUserId, childId }).sort({ createdAt: -1 }).lean();
    },
    async assignPath(data) {
      const filter = { parentUserId: data.parentUserId, childId: data.childId, pathKey: data.pathKey };
      const existing = await LearningPathAssignment.findOne(filter).lean();
      if (existing?.lastSubmissionId === data.submissionId) return existing;
      const action = existing
        ? existing.status === 'paused' ? 'resumed' : existing.assignmentType !== data.assignmentType ? 'role-changed' : 'assigned'
        : 'assigned';
      const update = {
        $set: {
          assignmentType: data.assignmentType,
          status: 'active',
          source: data.source,
          reason: data.reason,
          questionnaireVersion: data.questionnaireVersion ?? null,
          lastSubmissionId: data.submissionId,
          answers: data.answers ?? null
        },
        $setOnInsert: { parentUserId: data.parentUserId, childId: data.childId, pathKey: data.pathKey },
        $push: {
          history: {
            action,
            reason: data.reason ?? '',
            actorUserId: data.actorUserId,
            source: data.source,
            createdAt: new Date()
          }
        }
      };
      try {
        return await LearningPathAssignment.findOneAndUpdate(
          filter,
          update,
          { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
        ).lean();
      } catch (error) {
        if (error?.code !== 11000) throw error;
        const existingAssignment = await LearningPathAssignment.findOne(filter).lean();
        if (!existingAssignment) throw error;
        return LearningPathAssignment.findOneAndUpdate(
          filter,
          { $set: update.$set, $push: update.$push },
          { new: true, runValidators: true }
        ).lean();
      }
    },
    listChildAssignments(parentUserId, childId) {
      return LearningPathAssignment.find({
        parentUserId,
        childId,
        status: { $in: ['active', 'paused', 'completed'] }
      }).sort({ assignmentType: 1, createdAt: 1 }).lean();
    },
    listAdminAssignments(childId) {
      return LearningPathAssignment.find(childId ? { childId } : {})
        .select('_id parentUserId childId pathKey assignmentType status source reason questionnaireVersion history createdAt updatedAt')
        .sort({ updatedAt: -1 })
        .limit(200)
        .lean();
    },
    updateAssignment(parentUserId, childId, pathKey, updates) {
      const { historyEntry, ...fields } = updates;
      return LearningPathAssignment.findOneAndUpdate(
        { parentUserId, childId, pathKey },
        { $set: fields, $push: { history: historyEntry } },
        { new: true, runValidators: true }
      ).lean();
    },
    async listPublishedActivities() {
      return (await loadPublishedActivities()).sort((left, right) => left.gameId.localeCompare(right.gameId));
    },
    async getTrialGameId() {
      const current = await GameSetting.findOne({ key: 'trialGameIds' }).select('value').lean();
      if (Array.isArray(current?.value)) return current;
      const legacy = await GameSetting.findOne({ key: 'trialGameId' }).select('value').lean();
      return { value: [legacy?.value].filter(Boolean) };
    },
    async markActivityCompleted(parentUserId, childId, pathKey, completion) {
      const filter = { parentUserId, childId, pathKey };
      try {
        await LearningProgress.findOneAndUpdate(
          filter,
          { $setOnInsert: { parentUserId, childId, pathKey } },
          { upsert: true, new: true, runValidators: true }
        );
      } catch (error) {
        if (error.code !== 11000) throw error;
      }
      await LearningProgress.updateOne({
        ...filter,
        'completedActivities.gameId': { $ne: completion.gameId }
      }, { $push: { completedActivities: completion } });
    },
    getChildProgress(parentUserId, childId, pathKey) {
      return LearningProgress.findOne({ parentUserId, childId, pathKey }).lean();
    }
  };
}

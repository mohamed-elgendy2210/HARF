import { GameDefinition } from '../models/GameDefinition.js';
import { GameSetting } from '../models/GameSetting.js';
import { GameVersion } from '../models/GameVersion.js';
import { MediaAsset } from '../models/MediaAsset.js';
import { getGame } from '../games/catalog.js';

const BUILT_IN_GAME_IDS = ['first-letter-trial', 'word-sounds', 'word-match', 'matching-pairs', 'animal-sounds'];

export async function ensureGameLibraryIndexes() {
  await Promise.all([
    GameDefinition.createIndexes(),
    GameVersion.createIndexes(),
    GameSetting.createIndexes(),
    MediaAsset.createIndexes()
  ]);
}

export async function seedGameLibrary() {
  for (const gameId of BUILT_IN_GAME_IDS) {
    const builtIn = getGame(gameId);
    const content = {
      template: builtIn.template ?? 'multiple-choice',
      title: builtIn.title,
      description: builtIn.description,
      companion: builtIn.companion,
      companionAnimal: builtIn.companionAnimal,
      instructions: builtIn.instructions,
      questions: builtIn.questions,
      assetAssignments: []
    };
    const definition = await GameDefinition.findOneAndUpdate(
      { gameId },
      {
        $setOnInsert: {
          gameId,
          template: builtIn.template ?? 'multiple-choice',
          draftContent: content,
          draftAssetIds: [],
          status: 'published',
          publishedVersion: 1
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    if (definition.publishedVersion > 0) {
      await GameVersion.updateOne(
        { gameId, version: 1 },
        {
          $setOnInsert: {
            gameId,
            version: 1,
            content: definition.draftContent,
            assetIds: definition.draftAssetIds,
            publishedBy: definition.createdBy,
            publishedAt: definition.createdAt ?? new Date()
          }
        },
        { upsert: true }
      );
    }
  }
  await GameSetting.updateOne(
    { key: 'trialGameId' },
    { $setOnInsert: { key: 'trialGameId', value: 'first-letter-trial' } },
    { upsert: true }
  );
  const legacyTrial = await GameSetting.findOne({ key: 'trialGameId' }).lean();
  const existingTrials = await GameSetting.findOne({ key: 'trialGameIds' }).lean();
  if (!existingTrials) {
    const publishedGames = await GameDefinition.find({
      status: 'published',
      publishedVersion: { $gt: 0 }
    }).select('gameId').sort({ gameId: 1 }).lean();
    const selected = [...new Set([
      legacyTrial?.value,
      ...publishedGames.map(({ gameId }) => gameId)
    ].filter(Boolean))].slice(0, 4);
    await GameSetting.create({ key: 'trialGameIds', value: selected });
  }
}

export function createGameLibraryRepository() {
  return {
    listDefinitions() {
      return GameDefinition.find({}).sort({ updatedAt: -1, gameId: 1 }).lean();
    },
    findDefinition(gameId) {
      return GameDefinition.findOne({ gameId }).lean();
    },
    createDefinition(data) {
      return GameDefinition.create(data);
    },
    updateDefinition(gameId, updates) {
      return GameDefinition.findOneAndUpdate(
        { gameId },
        { $set: updates },
        { new: true, runValidators: true }
      ).lean();
    },
    createVersion(data) {
      return GameVersion.create(data);
    },
    findVersion(gameId, version) {
      return GameVersion.findOne({ gameId, version }).lean();
    },
    async listPublishedVersions() {
      const definitions = await GameDefinition.find({ status: 'published', publishedVersion: { $gt: 0 } })
        .select('gameId')
        .lean();
      const gameIds = definitions.map(({ gameId }) => gameId);
      if (gameIds.length === 0) return [];
      return GameVersion.find({ gameId: { $in: gameIds } }).lean();
    },
    getSetting(key) {
      return GameSetting.findOne({ key }).lean();
    },
    setSetting(key, value, updatedBy) {
      return GameSetting.findOneAndUpdate(
        { key },
        { $set: { value, updatedBy } },
        { upsert: true, new: true, runValidators: true }
      ).lean();
    },
    listAssets() {
      return MediaAsset.find({}).sort({ createdAt: -1, _id: -1 }).lean();
    },
    findAssetsByIds(assetIds) {
      return MediaAsset.find({ _id: { $in: assetIds } }).lean();
    },
    findAsset(assetId) {
      return MediaAsset.findById(assetId).lean();
    },
    createAsset(data) {
      return MediaAsset.create(data);
    },
    updateAsset(assetId, updates) {
      return MediaAsset.findByIdAndUpdate(
        assetId,
        { $set: updates },
        { new: true, runValidators: true }
      ).lean();
    },
    async isAssetReferenced(assetId) {
      const [draftReference, versionReference] = await Promise.all([
        GameDefinition.exists({ draftAssetIds: assetId }),
        GameVersion.exists({ assetIds: assetId })
      ]);
      return Boolean(draftReference || versionReference);
    },
    async listAssetUsage(assetId) {
      const [definitions, versions] = await Promise.all([
        GameDefinition.find({ draftAssetIds: assetId }).select('gameId draftContent').lean(),
        GameVersion.find({ assetIds: assetId }).select('gameId version content').lean()
      ]);
      const uses = [];
      const addContentUses = (gameId, title, source, version, content) => {
        for (const [questionIndex, question] of content.questions.entries()) {
          if (question.promptImageAssetId === assetId) {
            uses.push({ gameId, title, source, version, location: `السؤال ${questionIndex + 1} · صورة السؤال` });
          }
          if (question.promptAudioAssetId === assetId) {
            uses.push({ gameId, title, source, version, location: `السؤال ${questionIndex + 1} · الصوت` });
          }
          for (const [optionIndex, optionAssetId] of (question.optionImageAssetIds ?? []).entries()) {
            if (optionAssetId === assetId) {
              uses.push({ gameId, title, source, version, location: `السؤال ${questionIndex + 1} · صورة الاختيار ${optionIndex + 1}` });
            }
          }
        }
        for (const assignment of content.assetAssignments ?? []) {
          if (assignment.assetId === assetId) {
            uses.push({ gameId, title, source, version, location: `حدث ${assignment.event}` });
          }
        }
        if (content.spatial) {
          if (content.spatial.scene?.backgroundAssetId === assetId) {
            uses.push({ gameId, title, source, version, location: 'خلفية المشهد المكاني' });
          }
          content.spatial.scene?.objects?.forEach((item, index) => {
            if (item.assetId === assetId) {
              uses.push({ gameId, title, source, version, location: `عنصر المشهد ${index + 1}` });
            }
          });
          content.spatial.steps?.forEach((step, index) => {
            if (step.instructionAudioAssetId === assetId) {
              uses.push({ gameId, title, source, version, location: `صوت التعليمة ${index + 1}` });
            }
          });
        }
      };
      definitions.forEach(({ gameId, draftContent }) => {
        addContentUses(gameId, draftContent.title, 'مسودة', null, draftContent);
      });
      versions.forEach(({ gameId, version, content }) => {
        addContentUses(gameId, content.title, 'نسخة منشورة', version, content);
      });
      return uses;
    },
    replaceDraftAssetReferences(oldAssetId, newAssetId) {
      const replaceReference = (value) => ({
        $cond: [{ $eq: [value, oldAssetId] }, newAssetId, value]
      });
      return GameDefinition.updateMany(
        { draftAssetIds: oldAssetId },
        [{
          $set: {
            draftAssetIds: { $map: { input: '$draftAssetIds', as: 'assetId', in: replaceReference('$$assetId') } },
            draftContent: {
              $mergeObjects: ['$draftContent', {
                questions: {
                  $map: {
                    input: '$draftContent.questions',
                    as: 'question',
                    in: {
                      $mergeObjects: ['$$question', {
                        promptImageAssetId: replaceReference('$$question.promptImageAssetId'),
                        promptAudioAssetId: replaceReference('$$question.promptAudioAssetId'),
                        optionImageAssetIds: {
                          $cond: [
                            { $isArray: '$$question.optionImageAssetIds' },
                            {
                              $map: {
                                input: '$$question.optionImageAssetIds',
                                as: 'assetId',
                                in: replaceReference('$$assetId')
                              }
                            },
                            '$$REMOVE'
                          ]
                        }
                      }]
                    }
                  }
                },
                assetAssignments: {
                  $map: {
                    input: { $ifNull: ['$draftContent.assetAssignments', []] },
                    as: 'assignment',
                    in: {
                      $mergeObjects: ['$$assignment', { assetId: replaceReference('$$assignment.assetId') }]
                    }
                  }
                },
                spatial: {
                  $cond: [
                    { $eq: [{ $type: '$draftContent.spatial' }, 'missing'] },
                    '$$REMOVE',
                    {
                      $mergeObjects: ['$draftContent.spatial', {
                        scene: {
                          $mergeObjects: ['$draftContent.spatial.scene', {
                            backgroundAssetId: replaceReference('$draftContent.spatial.scene.backgroundAssetId'),
                            objects: {
                              $map: {
                                input: { $ifNull: ['$draftContent.spatial.scene.objects', []] },
                                as: 'object',
                                in: {
                                  $mergeObjects: ['$$object', {
                                    assetId: replaceReference('$$object.assetId')
                                  }]
                                }
                              }
                            }
                          }]
                        },
                        steps: {
                          $map: {
                            input: { $ifNull: ['$draftContent.spatial.steps', []] },
                            as: 'step',
                            in: {
                              $mergeObjects: ['$$step', {
                                instructionAudioAssetId: replaceReference('$$step.instructionAudioAssetId')
                              }]
                            }
                          }
                        }
                      }]
                    }
                  ]
                }
              }]
            }
          }
        }]
      );
    },
    deleteAsset(assetId) {
      return MediaAsset.findByIdAndDelete(assetId);
    },
    findActivePublicAsset(assetId) {
      return MediaAsset.findOne({ _id: assetId, active: true }).lean();
    }
  };
}

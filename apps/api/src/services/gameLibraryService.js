import { AppError } from '../middleware/errors.js';
import { hasValidSpatialTarget } from '../games/spatialValidation.js';

function contentAssetIds(content) {
  const questionAssetIds = content.questions.flatMap((question) => [
    question.promptImageAssetId,
    question.promptAudioAssetId,
    ...(question.optionImageAssetIds ?? [])
  ].filter(Boolean).map(String));
  return [...new Set([
    ...content.assetAssignments.map(({ assetId }) => String(assetId)),
    ...(content.pairs ?? []).map(({ imageAssetId }) => imageAssetId).filter(Boolean).map(String),
    ...questionAssetIds,
    ...(content.spatial?.scene?.backgroundAssetId ? [String(content.spatial.scene.backgroundAssetId)] : []),
    ...(content.spatial?.scene?.objects ?? []).map(({ assetId }) => assetId).filter(Boolean).map(String),
    ...(content.spatial?.steps ?? []).map(({ instructionAudioAssetId }) => instructionAudioAssetId)
      .filter(Boolean).map(String)
  ])];
}

function normalizeContent(content) {
  if (content.template !== 'picture-matching') return content;
  const options = content.pairs.map(({ label }) => label);
  const optionImageAssetIds = content.pairs.map(({ imageAssetId }) => imageAssetId);
  return {
    ...content,
    questions: content.pairs.map((pair, correctAnswerIndex) => ({
      prompt: `وصل صورة ${pair.label}`,
      options,
      correctAnswerIndex,
      promptImageAssetId: pair.imageAssetId,
      promptAudioAssetId: null,
      optionImageAssetIds,
      difficulty: content.difficulty ?? 'beginner',
      correctFeedback: 'برافو! ممتاز!',
      incorrectFeedback: 'حاول مرة تانية!'
    }))
  };
}

function publicContent(version, assetMap) {
  const content = version.content;
  const assets = {};
  for (const assignment of content.assetAssignments ?? []) {
    const asset = assetMap.get(String(assignment.assetId));
    if (!asset?.active || asset.kind !== assignment.kind) continue;
    assets[assignment.event] ??= {};
    if (assignment.kind === 'animation' && asset.mimeType === 'application/json') {
      assets[assignment.event].animationJsonAvailable = true;
      continue;
    }
    if (assignment.kind === 'animation' && asset.mimeType === 'image/gif') {
      assets[assignment.event].animationUrl = `/api/v1/media/${String(asset._id ?? asset.id)}`;
      continue;
    }
    assets[assignment.event][`${assignment.kind}Url`] = `/api/v1/media/${String(asset._id ?? asset.id)}`;
  }
  const spatial = content.spatial ? {
    ...content.spatial,
    scene: {
      ...content.spatial.scene,
      backgroundUrl: content.spatial.scene.backgroundAssetId
        ? publicAssetUrl(assetMap, content.spatial.scene.backgroundAssetId, 'image')
        : null,
      objects: content.spatial.scene.objects.map((item) => ({
        ...item,
        imageUrl: publicAssetUrl(assetMap, item.assetId, 'image'),
        altText: publicAssetAlt(assetMap, item.assetId, 'image')
      }))
    },
    steps: content.spatial.steps.map((step) => ({
      ...step,
      instructionAudioUrl: step.instructionAudioAssetId
        ? publicAssetUrl(assetMap, step.instructionAudioAssetId, 'audio')
        : null
    }))
  } : null;
  return {
    id: version.gameId,
    template: content.template ?? 'multiple-choice',
    title: content.title,
    description: content.description,
    companion: content.companion,
    companionAnimal: content.companionAnimal,
    instructions: content.instructions,
    version: String(version.version),
    questionCount: content.template === 'spatial-relationships'
      ? content.spatial.steps.length
      : content.questions.length,
    questions: content.questions.map((question) => ({
      prompt: question.prompt,
      options: question.options,
      difficulty: question.difficulty ?? 'beginner',
      correctFeedback: question.correctFeedback ?? '',
      incorrectFeedback: question.incorrectFeedback ?? '',
      ...(question.promptImageAssetId ? {
        promptImageUrl: publicAssetUrl(assetMap, question.promptImageAssetId, 'image'),
        promptImageAlt: publicAssetAlt(assetMap, question.promptImageAssetId, 'image')
      } : {}),
      ...(question.promptAudioAssetId ? {
        promptAudioUrl: publicAssetUrl(assetMap, question.promptAudioAssetId, 'audio')
      } : {}),
      ...(question.optionImageAssetIds ? {
        optionImageUrls: question.optionImageAssetIds.map((assetId) => (
          assetId ? publicAssetUrl(assetMap, assetId, 'image') : null
        )),
        optionImageAltTexts: question.optionImageAssetIds.map((assetId) => (
          assetId ? publicAssetAlt(assetMap, assetId, 'image') : ''
        ))
      } : {})
    })),
    assets,
    ...(spatial ? { spatial } : {})
  };
}

function publicAssetUrl(assetMap, assetId, kind) {
  const asset = assetMap.get(String(assetId));
  if (!asset?.active || asset.kind !== kind) return null;
  return `/api/v1/media/${String(asset._id ?? asset.id)}`;
}

function publicAssetAlt(assetMap, assetId, kind) {
  const asset = assetMap.get(String(assetId));
  if (!asset?.active || asset.kind !== kind) return '';
  return asset.altText ?? asset.displayName;
}

export class GameLibraryService {
  constructor({ repository, mediaAssetService, authService }) {
    this.repository = repository;
    this.mediaAssetService = mediaAssetService;
    this.authService = authService;
  }

  async listGames() {
    const [definitions, setting] = await Promise.all([
      this.repository.listDefinitions(),
      this.getTrialGamesSetting()
    ]);
    const trialGameIds = setting?.value ?? [];
    return {
      trialGameId: trialGameIds[0] ?? null,
      trialGameIds,
      games: await Promise.all(definitions.map(async (definition) => {
        const publishedVersion = definition.publishedVersion > 0
          ? await this.repository.findVersion(definition.gameId, definition.publishedVersion)
          : null;
        return {
          gameId: definition.gameId,
          template: definition.template,
          status: definition.status,
          publishedVersion: definition.publishedVersion,
          publishedContent: publishedVersion?.content ?? null,
          publishedQuestionCount: publishedVersion?.content.template === 'spatial-relationships'
            ? publishedVersion?.content.spatial?.steps?.length ?? 0
            : publishedVersion?.content.questions.length ?? 0,
          draftContent: definition.draftContent,
          questionCount: definition.draftContent.template === 'spatial-relationships'
            ? definition.draftContent.spatial?.steps?.length ?? 0
            : definition.draftContent.questions.length,
          updatedAt: definition.updatedAt,
          isTrial: trialGameIds.includes(definition.gameId)
        };
      }))
    };
  }

  async createGame(actor, { gameId, content }) {
    if (await this.repository.findDefinition(gameId)) {
      throw new AppError(409, 'GAME_ID_IN_USE', 'Choose a unique game identifier.');
    }
    content = normalizeContent(content);
    const assets = await this.validateAssignments(content);
    const definition = await this.repository.createDefinition({
      gameId,
      template: content.template ?? 'multiple-choice',
      draftContent: content,
      draftAssetIds: contentAssetIds(content),
      status: 'draft',
      publishedVersion: 0,
      createdBy: actor._id ?? actor.id
    });
    await this.audit(actor, 'admin.game_created', {
      gameId,
      questionCount: content.questions.length || content.spatial?.steps?.length || 0,
      assignedAssets: assets.length
    });
    return definition;
  }

  async updateDraft(actor, gameId, content) {
    const definition = await this.repository.findDefinition(gameId);
    if (!definition) throw new AppError(404, 'GAME_NOT_FOUND', 'The game was not found.');
    content = normalizeContent(content);
    const assets = await this.validateAssignments(content);
    const updated = await this.repository.updateDefinition(gameId, {
      template: content.template ?? 'multiple-choice',
      draftContent: content,
      draftAssetIds: contentAssetIds(content)
    });
    await this.audit(actor, 'admin.game_draft_updated', {
      gameId,
      questionCount: content.questions.length || content.spatial?.steps?.length || 0,
      assignedAssets: assets.length
    });
    return updated;
  }

  async publish(actor, gameId) {
    const definition = await this.repository.findDefinition(gameId);
    if (!definition) throw new AppError(404, 'GAME_NOT_FOUND', 'The game was not found.');
    await this.validateAssignments(definition.draftContent, { requireComplete: true });
    const version = definition.publishedVersion + 1;
    await this.repository.createVersion({
      gameId,
      version,
      content: definition.draftContent,
      assetIds: definition.draftAssetIds,
      publishedBy: actor._id ?? actor.id,
      publishedAt: new Date()
    });
    const updated = await this.repository.updateDefinition(gameId, {
      status: 'published',
      publishedVersion: version
    });
    await this.audit(actor, 'admin.game_published', { gameId, version });
    return updated;
  }

  async unpublish(actor, gameId) {
    const definition = await this.repository.findDefinition(gameId);
    if (!definition) throw new AppError(404, 'GAME_NOT_FOUND', 'The game was not found.');
    if ((await this.getTrialGameIds()).includes(gameId)) {
      throw new AppError(409, 'TRIAL_GAME_MUST_REMAIN_PUBLISHED', 'Choose another published trial game before unpublishing this game.');
    }
    const updated = await this.repository.updateDefinition(gameId, { status: 'unpublished' });
    await this.audit(actor, 'admin.game_unpublished', { gameId });
    return updated;
  }

  async selectTrial(actor, gameId) {
    const definition = await this.repository.findDefinition(gameId);
    if (!definition || definition.status !== 'published' || definition.publishedVersion < 1) {
      throw new AppError(409, 'TRIAL_GAME_NOT_PUBLISHED', 'The public trial must be a published game.');
    }
    const gameIds = [gameId];
    const result = await this.repository.setSetting('trialGameIds', gameIds, actor._id ?? actor.id);
    await this.repository.setSetting('trialGameId', gameId, actor._id ?? actor.id);
    await this.audit(actor, 'admin.trial_game_selected', { gameId, gameIds });
    return { value: gameId, gameIds: result.value };
  }

  async selectTrials(actor, gameIds) {
    await this.validateTrialGames(gameIds);
    const result = await this.repository.setSetting('trialGameIds', gameIds, actor._id ?? actor.id);
    await this.repository.setSetting('trialGameId', gameIds[0], actor._id ?? actor.id);
    await this.audit(actor, 'admin.trial_games_selected', { gameIds });
    return result;
  }

  async validateTrialGames(gameIds) {
    if (gameIds.length !== 4 || new Set(gameIds).size !== 4) {
      throw new AppError(400, 'INVALID_TRIAL_GAMES', 'Choose exactly four different trial games.');
    }
    const definitions = await Promise.all(gameIds.map((gameId) => this.repository.findDefinition(gameId)));
    if (definitions.some((definition) => (
      !definition || definition.status !== 'published' || definition.publishedVersion < 1
    ))) {
      throw new AppError(409, 'TRIAL_GAME_NOT_PUBLISHED', 'All four public trial games must be published.');
    }
  }

  async getTrialGamesSetting() {
    const current = await this.repository.getSetting('trialGameIds');
    if (Array.isArray(current?.value)) return current;
    const legacy = await this.repository.getSetting('trialGameId');
    return { value: legacy?.value ? [legacy.value] : [] };
  }

  async getTrialGameIds() {
    return (await this.getTrialGamesSetting()).value;
  }

  async listAssets() {
    const assets = await this.mediaAssetService.listAssets();
    return Promise.all(assets.map(async (asset) => ({
      ...asset,
      usage: await this.repository.listAssetUsage(asset.id)
    })));
  }

  async uploadAsset(actor, data) {
    const asset = await this.mediaAssetService.upload({ ...data, createdBy: actor._id ?? actor.id });
    await this.audit(actor, 'admin.media_asset_uploaded', {
      assetId: asset.id,
      kind: asset.kind,
      sizeBytes: asset.sizeBytes
    });
    return asset;
  }

  async setAssetActive(actor, assetId, active) {
    const asset = await this.mediaAssetService.setActive(assetId, active);
    await this.audit(actor, 'admin.media_asset_status_changed', { assetId, active });
    return asset;
  }

  async updateAsset(actor, assetId, updates) {
    const asset = await this.mediaAssetService.updateMetadata(assetId, updates);
    await this.audit(actor, 'admin.media_asset_metadata_updated', {
      assetId,
      changedFields: Object.keys(updates)
    });
    return asset;
  }

  async replaceAsset(actor, assetId, file) {
    const asset = await this.mediaAssetService.replace({
      assetId,
      file,
      createdBy: actor._id ?? actor.id
    });
    await this.audit(actor, 'admin.media_asset_replaced', {
      assetId,
      kind: asset.kind,
      sizeBytes: asset.sizeBytes
    });
    return asset;
  }

  async deleteAsset(actor, assetId) {
    await this.mediaAssetService.delete(assetId);
    await this.audit(actor, 'admin.media_asset_deleted', { assetId });
  }

  async getPublicGames() {
    const trialGameIds = await this.getTrialGameIds();
    const definitions = (await this.repository.listDefinitions()).filter((definition) => (
      definition.status === 'published' && definition.publishedVersion > 0
    ));
    const games = await Promise.all(definitions.map(async (definition) => {
      const version = await this.repository.findVersion(definition.gameId, definition.publishedVersion);
      if (!version) return null;
      return {
        id: definition.gameId,
        title: version.content.title,
        description: version.content.description,
        companion: version.content.companion,
        companionAnimal: version.content.companionAnimal,
        template: version.content.template ?? 'multiple-choice',
        access: trialGameIds.includes(definition.gameId) ? 'trial' : 'parent',
        version: String(definition.publishedVersion),
        questionCount: version.content.template === 'spatial-relationships'
          ? version.content.spatial?.steps?.length ?? 0
          : version.content.questions.length
      };
    }));
    return games.filter(Boolean);
  }

  async getPlayableGame(gameId) {
    const definition = await this.repository.findDefinition(gameId);
    if (!definition || definition.status !== 'published' || definition.publishedVersion < 1) return null;
    const version = await this.repository.findVersion(gameId, definition.publishedVersion);
    if (!version) return null;
    const storedAssets = await this.repository.findAssetsByIds(version.assetIds);
    const availability = await Promise.all(storedAssets.map((asset) => this.mediaAssetService.isAvailable(asset)));
    const assets = storedAssets.filter((asset, index) => availability[index]);
    const assetMap = new Map(assets.map((asset) => [String(asset._id ?? asset.id), asset]));
    return publicContent(version, assetMap);
  }

  async getScoringGame(gameId, version = null) {
    const definition = await this.repository.findDefinition(gameId);
    if (!definition || definition.status !== 'published' || definition.publishedVersion < 1) return null;
    const requestedVersion = version === null ? definition.publishedVersion : Number(version);
    if (!Number.isInteger(requestedVersion) || requestedVersion < 1 || requestedVersion > definition.publishedVersion) {
      return null;
    }
    return this.repository.findVersion(gameId, requestedVersion);
  }

  async validateAssignments(content, { requireComplete = false } = {}) {
    const ids = contentAssetIds(content);
    const assets = await this.repository.findAssetsByIds(ids);
    const byId = new Map(assets.map((asset) => [String(asset._id ?? asset.id), asset]));
    for (const assignment of content.assetAssignments) {
      const asset = byId.get(String(assignment.assetId));
      if (!asset || !asset.active) {
        throw new AppError(400, 'ASSET_UNAVAILABLE', 'Every assigned asset must exist and be active.');
      }
      if (asset.kind !== assignment.kind) {
        throw new AppError(400, 'ASSET_KIND_MISMATCH', 'The assigned asset type does not match its game event.');
      }
      if (assignment.kind === 'video' && asset.mimeType !== 'video/mp4') {
        throw new AppError(400, 'ASSET_KIND_MISMATCH', 'Mascot videos must use the verified MP4 format.');
      }
    }
    for (const pair of content.pairs ?? []) {
      if (!pair.imageAssetId) {
        if (requireComplete) {
          throw new AppError(400, 'GAME_IMAGE_MAPPING_REQUIRED', 'اختر صورة نشطة ومتاحة لكل زوج قبل نشر لعبة التوصيل.');
        }
        continue;
      }
      const asset = byId.get(String(pair.imageAssetId));
      if (!asset || asset.kind !== 'image' || !asset.active) {
        throw new AppError(400, 'QUESTION_IMAGE_UNAVAILABLE', 'A picture pair must refer to an active image asset.');
      }
    }
    for (const question of content.questions) {
      if (question.promptAudioAssetId) {
        const asset = byId.get(String(question.promptAudioAssetId));
        if (!asset || asset.kind !== 'audio' || !asset.active) {
          throw new AppError(400, 'QUESTION_AUDIO_UNAVAILABLE', 'A question audio mapping must refer to an active audio asset.');
        }
      }
      if (question.promptImageAssetId) {
        const asset = byId.get(String(question.promptImageAssetId));
        if (!asset || asset.kind !== 'image' || !asset.active) {
          throw new AppError(400, 'QUESTION_IMAGE_UNAVAILABLE', 'A question image mapping must refer to an active image asset.');
        }
      }
      for (const assetId of question.optionImageAssetIds ?? []) {
        if (!assetId) continue;
        const asset = byId.get(String(assetId));
        if (!asset || asset.kind !== 'image' || !asset.active) {
          throw new AppError(400, 'QUESTION_IMAGE_UNAVAILABLE', 'An option image mapping must refer to an active image asset.');
        }
      }
    }
    if (requireComplete && content.template === 'audio-choice'
      && content.questions.some((question) => !question.promptAudioAssetId
        || question.optionImageAssetIds?.length !== question.options.length
        || question.optionImageAssetIds.some((assetId) => !assetId))) {
      throw new AppError(400, 'GAME_AUDIO_MAPPING_REQUIRED', 'Assign an audio file to every question and an image to every answer option before publishing this listening game.');
    }
    if (requireComplete && content.template === 'matching-pairs'
      && content.questions.some((question) => !question.promptImageAssetId
        || question.optionImageAssetIds?.length !== question.options.length
        || question.optionImageAssetIds.some((assetId) => !assetId))) {
      throw new AppError(400, 'GAME_IMAGE_MAPPING_REQUIRED', 'Assign an image to the matching item and every answer option before publishing this game.');
    }
    if (requireComplete && content.template === 'picture-matching'
      && (!content.pairs || content.pairs.length < 2 || content.pairs.length > 8
        || content.pairs.some((pair) => !pair.imageAssetId)
        || new Set(content.pairs.map(({ imageAssetId }) => String(imageAssetId))).size !== content.pairs.length)) {
      throw new AppError(400, 'GAME_IMAGE_MAPPING_REQUIRED', 'لعبة التوصيل تحتاج صورتين مختلفتين على الأقل، مع صورة فريدة لكل زوج.');
    }
    if (content.template === 'spatial-relationships') {
      for (const object of content.spatial.scene.objects) {
        if (!object.assetId) {
          if (requireComplete) {
            throw new AppError(400, 'SPATIAL_IMAGE_REQUIRED', 'اختر صورة لكل عنصر في المشهد قبل نشر النشاط.');
          }
          continue;
        }
        const asset = byId.get(String(object.assetId));
        if (!asset || asset.kind !== 'image' || !asset.active) {
          throw new AppError(400, 'SPATIAL_IMAGE_UNAVAILABLE', 'كل عنصر بالمشهد يجب أن يستخدم صورة نشطة من مكتبة الوسائط.');
        }
      }
      if (content.spatial.scene.backgroundAssetId) {
        const background = byId.get(String(content.spatial.scene.backgroundAssetId));
        if (!background || background.kind !== 'image' || !background.active) {
          throw new AppError(400, 'SPATIAL_BACKGROUND_UNAVAILABLE', 'اختر خلفية صورة نشطة من مكتبة الوسائط.');
        }
      }
      for (const [stepIndex, step] of content.spatial.steps.entries()) {
        if (!step.instruction.trim()) {
          throw new AppError(400, 'SPATIAL_INSTRUCTION_REQUIRED', 'كل خطوة مكانية تحتاج إلى تعليمة عربية.');
        }
        if (requireComplete && !hasValidSpatialTarget(content.spatial, stepIndex)) {
          throw new AppError(400, 'SPATIAL_TARGET_UNREACHABLE', 'منطقة الهدف لا تسمح بوضع العنصر وفق العلاقة المكانية المحددة.');
        }
        if (!step.instructionAudioAssetId) continue;
        const audio = byId.get(String(step.instructionAudioAssetId));
        if (!audio || audio.kind !== 'audio' || !audio.active) {
          throw new AppError(400, 'SPATIAL_AUDIO_UNAVAILABLE', 'ملف صوت التعليمة يجب أن يكون نشطًا من مكتبة الوسائط.');
        }
      }
    }
    if (requireComplete) {
      for (const asset of assets) {
        const stored = await this.mediaAssetService.readAssetFile(asset);
        if (!stored) {
          throw new AppError(409, 'MEDIA_FILE_MISSING', 'A mapped media file is missing from storage. Replace the asset before publishing.');
        }
      }
    }
    return assets;
  }

  async readPublicAsset(assetId) {
    return this.mediaAssetService.readPublicAsset(assetId);
  }

  async readAdminAsset(assetId) {
    return this.mediaAssetService.readAdminAsset(assetId);
  }

  async audit(actor, action, metadata) {
    if (!this.authService?.recordAudit) return;
    await this.authService.recordAudit(action, {
      actorUserId: actor._id ?? actor.id,
      metadata
    });
  }
}

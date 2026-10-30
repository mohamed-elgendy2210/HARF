import { AppError } from '../middleware/errors.js';

function accuracyPercent(attempts) {
  const questionCount = attempts.reduce((total, attempt) => total + attempt.totalQuestions, 0);
  if (!questionCount) return null;
  const correctCount = attempts.reduce((total, attempt) => total + attempt.correctCount, 0);
  return Math.round((correctCount / questionCount) * 100);
}

function canonicalAnswers(answers) {
  return JSON.stringify(Object.fromEntries(
    Object.entries(answers)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, Array.isArray(value) ? [...value].sort() : value])
  ));
}

const skillLabels = {
  communication: 'التواصل',
  vocabulary: 'المفردات',
  expression: 'التعبير',
  listening: 'الاستماع',
  'visual-recognition': 'التعرّف البصري',
  attention: 'الانتباه',
  'sound-awareness': 'الوعي بالأصوات'
};

function serializePath(path) {
  if (!path) {
    throw new AppError(503, 'LEARNING_PATH_UNAVAILABLE', 'لم يتم إعداد مسار تعلّم منشور بعد.');
  }
  return {
    title: path.title,
    description: path.description,
    key: path.key,
    status: path.status,
    ageBands: path.ageBands ?? [],
    skillIds: path.skillIds ?? [],
    objectives: path.objectives ?? [],
    matchingRules: path.matchingRules ?? {},
    activities: path.activities,
    rules: path.rules,
    updatedAt: path.updatedAt
  };
}

function selectedTrialIds(setting) {
  return Array.isArray(setting?.value) ? setting.value : [setting?.value].filter(Boolean);
}

export class LearningPathService {
  constructor({ repository, gameRepository, childService, subscriptionService, authService, now = () => new Date() }) {
    this.repository = repository;
    this.gameRepository = gameRepository;
    this.childService = childService;
    this.subscriptionService = subscriptionService;
    this.authService = authService;
    this.now = now;
  }

  async getAdminPath() {
    const [path, availableGames, trialSetting] = await Promise.all([
      this.repository.getPath(),
      this.repository.listPublishedActivities(),
      this.repository.getTrialGameId()
    ]);
    const trialIds = selectedTrialIds(trialSetting);
    const games = availableGames
      .filter((game) => !trialIds.includes(game.gameId))
      .map((game) => ({
        gameId: game.gameId,
        title: game.draftContent.title,
        publishedVersion: game.publishedVersion
      }));
    return { path: serializePath(path), availableGames: games };
  }

  async updatePath(actor, input) {
    const [availableGames, trialSetting] = await Promise.all([
      this.repository.listPublishedActivities(),
      this.repository.getTrialGameId()
    ]);
    const trialIds = selectedTrialIds(trialSetting);
    const availableIds = new Set(availableGames
      .filter((game) => !trialIds.includes(game.gameId))
      .map((game) => game.gameId));
    const unavailable = input.activities.find(({ gameId }) => !availableIds.has(gameId));
    if (unavailable) {
      throw new AppError(400, 'LEARNING_ACTIVITY_UNAVAILABLE', 'لا يمكن إضافة لعبة غير منشورة أو اللعبة التجريبية إلى مسار ولي الأمر.');
    }

    const path = await this.repository.updatePath({
      ...input,
      key: 'default',
      updatedBy: actor._id ?? actor.id
    });
    await this.audit(actor, 'admin.learning_path_updated', {
      activityCount: input.activities.length,
      minimumAttempts: input.rules.minimumAttempts,
      sampleSize: input.rules.sampleSize,
      targetAccuracyPercent: input.rules.targetAccuracyPercent
    });
    return serializePath(path);
  }

  async listAdminPaths() {
    const [paths, availableGames, trialSetting] = await Promise.all([
      this.repository.listPaths(),
      this.repository.listPublishedActivities(),
      this.repository.getTrialGameId()
    ]);
    const trialIds = selectedTrialIds(trialSetting);
    const availableIds = new Set(availableGames
      .filter((game) => !trialIds.includes(game.gameId))
      .map((game) => game.gameId));
    return {
      paths: paths.map((path) => ({
        ...serializePath(path),
        activities: path.activities.map((activity) => ({
          ...activity,
          available: availableIds.has(activity.gameId)
        }))
      })),
      availableGames: availableGames
        .filter((game) => !trialIds.includes(game.gameId))
        .map((game) => ({
          gameId: game.gameId,
          title: game.draftContent.title,
          publishedVersion: game.publishedVersion
        }))
    };
  }

  async createPath(actor, input) {
    await this.assertPathActivitiesAvailable(input.activities, input);
    let path;
    try {
      path = await this.repository.createPath({
        ...input,
        status: input.status ?? 'draft',
        updatedBy: actor._id ?? actor.id
      });
    } catch (error) {
      if (error?.code !== 11000) throw error;
      throw new AppError(409, 'LEARNING_PATH_KEY_EXISTS', 'معرّف مسار التعلّم مستخدم بالفعل.');
    }
    await this.audit(actor, 'admin.learning_path_created', { pathKey: path.key, status: path.status });
    return serializePath(path);
  }

  async updatePathByKey(actor, pathKey, input) {
    if (input.key && input.key !== pathKey) {
      throw new AppError(400, 'LEARNING_PATH_KEY_IMMUTABLE', 'لا يمكن تغيير معرّف المسار بعد إنشائه.');
    }
    await this.assertPathActivitiesAvailable(input.activities, input);
    const { key: _key, ...updates } = input;
    const path = await this.repository.updatePathByKey(pathKey, {
      ...updates,
      updatedBy: actor._id ?? actor.id
    });
    if (!path) throw new AppError(404, 'LEARNING_PATH_NOT_FOUND', 'مسار التعلّم غير موجود.');
    await this.audit(actor, 'admin.learning_path_updated', { pathKey, status: path.status });
    return serializePath(path);
  }

  async assertPathActivitiesAvailable(activities, pathInput) {
    const [availableGames, trialSetting, questionnaire] = await Promise.all([
      this.repository.listPublishedActivities(),
      this.repository.getTrialGameId(),
      this.repository.getActiveQuestionnaire()
    ]);
    const trialIds = selectedTrialIds(trialSetting);
    const availableIds = new Set(availableGames
      .filter((game) => !trialIds.includes(game.gameId))
      .map((game) => game.gameId));
    const unavailable = activities.find(({ gameId }) => !availableIds.has(gameId));
    if (unavailable) {
      throw new AppError(400, 'LEARNING_ACTIVITY_UNAVAILABLE', 'لا يمكن إضافة لعبة غير منشورة أو اللعبة التجريبية إلى مسار ولي الأمر.');
    }
    if (!questionnaire) throw new AppError(503, 'LEARNING_QUESTIONNAIRE_UNAVAILABLE', 'لم يتم إعداد استبيان تعلّم منشور بعد.');
    const allowedOptionIds = new Set(questionnaire.questions.flatMap(({ options }) => options.map(({ id }) => id)));
    const allowedSkillIds = new Set(questionnaire.questions.flatMap(({ options }) => options.flatMap(({ skillIds }) => skillIds)));
    const unknownOption = (pathInput.matchingRules?.answerOptionIds ?? []).find((id) => !allowedOptionIds.has(id));
    if (unknownOption) {
      throw new AppError(400, 'LEARNING_MATCH_OPTION_UNKNOWN', 'تتضمن قواعد المسار خيارًا غير موجود في إصدار الاستبيان الحالي.');
    }
    const unknownSkill = [...(pathInput.skillIds ?? []), ...(pathInput.matchingRules?.skillIds ?? [])]
      .find((id) => !allowedSkillIds.has(id));
    if (unknownSkill) {
      throw new AppError(400, 'LEARNING_MATCH_SKILL_UNKNOWN', 'تتضمن قواعد المسار مهارة غير مرتبطة بخيارات الاستبيان الحالي.');
    }
  }

  async getQuestionnaire() {
    const questionnaire = await this.repository.getActiveQuestionnaire();
    if (!questionnaire) throw new AppError(503, 'LEARNING_QUESTIONNAIRE_UNAVAILABLE', 'لم يتم إعداد استبيان تعلّم منشور بعد.');
    return {
      version: questionnaire.version,
      maxAssignments: questionnaire.maxAssignments,
      questions: questionnaire.questions.map(({ id, text, helpText, type, required, options }) => ({
        id,
        text,
        helpText,
        type,
        required,
        options: options.map(({ id: optionId, label }) => ({ id: optionId, label }))
      }))
    };
  }

  async getAdminQuestionnaire() {
    const questionnaire = await this.repository.getActiveQuestionnaire();
    if (!questionnaire) throw new AppError(503, 'LEARNING_QUESTIONNAIRE_UNAVAILABLE', 'لم يتم إعداد استبيان تعلّم منشور بعد.');
    return {
      version: questionnaire.version,
      maxAssignments: questionnaire.maxAssignments,
      questions: questionnaire.questions
    };
  }

  async updateQuestionnaire(actor, input) {
    const [paths, currentQuestionnaire] = await Promise.all([
      this.repository.listPaths(),
      this.repository.getActiveQuestionnaire()
    ]);
    const nextOptions = new Set(input.questions.flatMap(({ options }) => options.map(({ id }) => id)));
    const nextSkills = new Set(input.questions.flatMap(({ options }) => options.flatMap(({ skillIds }) => skillIds)));
    const incompatiblePath = paths.find((path) => path.status === 'published'
      && (
        (path.matchingRules?.answerOptionIds ?? []).some((id) => !nextOptions.has(id))
        || [...(path.skillIds ?? []), ...(path.matchingRules?.skillIds ?? [])].some((id) => !nextSkills.has(id))
      ));
    if (incompatiblePath) {
      throw new AppError(409, 'LEARNING_QUESTIONNAIRE_IN_USE', `حدّث قواعد المسار «${incompatiblePath.title}» قبل إزالة الخيارات أو المهارات المرتبطة به.`);
    }
    if (!currentQuestionnaire) throw new AppError(503, 'LEARNING_QUESTIONNAIRE_UNAVAILABLE', 'لم يتم إعداد استبيان تعلّم منشور بعد.');
    let questionnaire;
    try {
      questionnaire = await this.repository.publishQuestionnaire(actor._id ?? actor.id, input);
    } catch (error) {
      if (error?.code !== 11000) throw error;
      throw new AppError(409, 'LEARNING_QUESTIONNAIRE_VERSION_CONFLICT', 'تعذر إنشاء إصدار الاستبيان بالتزامن. أعد المحاولة.');
    }
    await this.audit(actor, 'admin.learning_questionnaire_published', {
      version: questionnaire.version,
      questionCount: questionnaire.questions.length
    });
    return this.getAdminQuestionnaire();
  }

  async previewRecommendations(parentUserId, childId, input) {
    const child = await this.childService.getOwnedChild(parentUserId, childId);
    if (child.status !== 'active') throw new AppError(409, 'CHILD_PROFILE_ARCHIVED', 'أعد تفعيل ملف الطفل لإعداد مسارات التعلّم.');
    const questionnaire = await this.repository.getActiveQuestionnaire();
    if (!questionnaire || questionnaire.version !== input.questionnaireVersion) {
      throw new AppError(409, 'LEARNING_QUESTIONNAIRE_OUTDATED', 'تم تحديث الاستبيان. أعد فتحه قبل المتابعة.');
    }
    const answerSkills = new Set();
    const selectedOptionIds = new Set();
    const labelsByOption = new Map();
    questionnaire.questions.forEach(({ options }) => {
      options.forEach(({ id, label }) => labelsByOption.set(id, label));
    });
    for (const question of questionnaire.questions) {
      const selected = input.answers[question.id];
      if (selected === undefined) {
        if (question.required) throw new AppError(400, 'LEARNING_QUESTIONNAIRE_INCOMPLETE', 'أجب عن جميع الأسئلة المطلوبة.');
        continue;
      }
      const values = Array.isArray(selected) ? selected : [selected];
      if ((question.type === 'single' && (values.length !== 1 || Array.isArray(selected)))
        || (question.type === 'multiple' && !Array.isArray(selected))
        || new Set(values).size !== values.length) {
        throw new AppError(400, 'LEARNING_QUESTIONNAIRE_INVALID_ANSWER', 'إجابة أحد الأسئلة غير صالحة.');
      }
      for (const value of values) {
        const option = question.options.find(({ id }) => id === value);
        if (!option) throw new AppError(400, 'LEARNING_QUESTIONNAIRE_INVALID_ANSWER', 'إجابة أحد الأسئلة غير صالحة.');
        selectedOptionIds.add(option.id);
        option.skillIds.forEach((skillId) => answerSkills.add(skillId));
      }
    }
    const unknownQuestions = Object.keys(input.answers).some(
      (questionId) => !questionnaire.questions.some(({ id }) => id === questionId)
    );
    if (unknownQuestions) throw new AppError(400, 'LEARNING_QUESTIONNAIRE_INVALID_ANSWER', 'يتضمن الاستبيان إجابات غير معروفة.');

    const ageBand = child.ageBand ?? input.ageBand ?? null;
    const [paths, availableGames, trialSetting] = await Promise.all([
      this.repository.listPaths(),
      this.repository.listPublishedActivities(),
      this.repository.getTrialGameId()
    ]);
    const trialIds = selectedTrialIds(trialSetting);
    const validGames = new Set(availableGames
      .filter((game) => !trialIds.includes(game.gameId))
      .map((game) => game.gameId));
    const recommendations = paths
      .filter((path) => path.status === 'published'
        && path.activities.length > 0
        && path.activities.every(({ gameId }) => validGames.has(gameId)))
      .map((path) => {
        const rules = path.matchingRules ?? {};
        const requiredSkills = [...new Set([...(path.skillIds ?? []), ...(rules.skillIds ?? [])])];
        const matchedSkills = requiredSkills.filter((skillId) => answerSkills.has(skillId));
        const matchedOptions = (rules.answerOptionIds ?? []).filter((id) => selectedOptionIds.has(id));
        const requiredAgeBands = rules.ageBands?.length ? rules.ageBands : path.ageBands ?? [];
        if (requiredAgeBands.length && (!ageBand || !requiredAgeBands.includes(ageBand))) return null;
        const matchCount = matchedSkills.length + matchedOptions.length;
        if (matchCount < (rules.minimumMatches ?? 1)) return null;
        const reasons = [
          ...matchedSkills.map((skillId) => `يتوافق مع مهارة ${skillLabels[skillId] ?? skillId}`),
          ...matchedOptions.map((optionId) => `يتوافق مع اختيارك: ${labelsByOption.get(optionId)}`)
        ];
        return {
          key: path.key,
          title: path.title,
          description: path.description,
          assignmentType: rules.assignmentType === 'complementary' ? 'complementary' : 'primary',
          priority: rules.priority ?? 0,
          matchCount,
          reason: reasons.length ? reasons.join('، ') : `يتوافق مع الفئة العمرية ${ageBand ?? 'المحددة'} وأهداف التعلّم المختارة.`
        };
      })
      .filter(Boolean)
      .sort((left, right) => right.priority - left.priority || right.matchCount - left.matchCount || left.title.localeCompare(right.title, 'ar'))
      .slice(0, questionnaire.maxAssignments);
    recommendations.forEach((recommendation, index) => {
      if (index > 0 && recommendation.assignmentType !== 'complementary') {
        recommendation.assignmentType = 'complementary';
      }
    });
    return {
      questionnaireVersion: questionnaire.version,
      submissionId: input.submissionId,
      recommendations,
      maxAssignments: questionnaire.maxAssignments,
      note: 'هذه اقتراحات لأنشطة تعليمية وفق اختيارات ولي الأمر، وليست تشخيصًا أو تقييمًا طبيًا.'
    };
  }

  async confirmPathAssignments(parentUserId, childId, input) {
    const [child, consents] = await Promise.all([
      this.childService.getOwnedChild(parentUserId, childId),
      this.childService.listConsents(parentUserId, childId)
    ]);
    if (child.status !== 'active') throw new AppError(409, 'CHILD_PROFILE_ARCHIVED', 'أعد تفعيل ملف الطفل قبل حفظ مسارات التعلّم.');
    if (!consents.some((consent) => consent.consentType === 'learning_data' && consent.granted)) {
      throw new AppError(403, 'LEARNING_CONSENT_REQUIRED', 'يلزم تفعيل موافقة حفظ أنشطة التعلّم قبل حفظ الاستبيان والمسارات.');
    }
    const existing = await this.repository.getQuestionnaireResponse(parentUserId, childId, input.submissionId);
    if (existing && (existing.questionnaireVersion !== input.questionnaireVersion
      || existing.ageBand !== (child.ageBand ?? input.ageBand ?? null)
      || canonicalAnswers(existing.answers) !== canonicalAnswers(input.answers))) {
      throw new AppError(409, 'LEARNING_SUBMISSION_CONFLICT', 'معرّف الإرسال مستخدم بإجابات مختلفة. أعد المحاولة باستبيان جديد.');
    }
    const preview = await this.previewRecommendations(parentUserId, childId, input);
    const keys = [...new Set(input.pathKeys)];
    if (keys.length !== input.pathKeys.length || keys.some((key) => !preview.recommendations.some((item) => item.key === key))) {
      throw new AppError(400, 'LEARNING_ASSIGNMENT_INVALID', 'اختر مسارات من التوصيات المعروضة فقط.');
    }
    if (existing && canonicalAnswers({ paths: existing.confirmedPathKeys ?? [] })
      !== canonicalAnswers({ paths: keys })) {
      throw new AppError(409, 'LEARNING_SUBMISSION_CONFLICT', 'معرّف الإرسال مرتبط باختيارات مسارات مختلفة. أعد فتح الاستبيان قبل التغيير.');
    }
    const labelsByOption = new Map((await this.repository.getQuestionnaireVersion(input.questionnaireVersion))
      .questions.flatMap(({ options }) => options.map(({ id, label }) => [id, label])));
    const answerSummary = Object.values(input.answers).flatMap((answer) => Array.isArray(answer) ? answer : [answer])
      .map((id) => labelsByOption.get(id)).filter(Boolean);
    await this.repository.saveQuestionnaireResponse({
      parentUserId,
      childId,
      submissionId: input.submissionId,
      questionnaireVersion: input.questionnaireVersion,
      ageBand: child.ageBand ?? input.ageBand ?? null,
      answers: input.answers,
      recommendationKeys: preview.recommendations.map(({ key }) => key),
      confirmedPathKeys: keys
    });
    const assigned = [];
    for (const key of keys) {
      const recommendation = preview.recommendations.find((item) => item.key === key);
      assigned.push(await this.repository.assignPath({
        parentUserId,
        childId,
        pathKey: key,
        assignmentType: recommendation.assignmentType,
        source: 'parent',
        reason: recommendation.reason,
        questionnaireVersion: input.questionnaireVersion,
        submissionId: input.submissionId,
        answers: answerSummary,
        actorUserId: parentUserId
      }));
    }
    await this.audit({ _id: parentUserId }, 'parent.learning_paths_assigned', {
      childId,
      pathKeys: keys,
      questionnaireVersion: input.questionnaireVersion
    });
    return { assignments: assigned };
  }

  async getChildLearningOverview(parentUserId, childId) {
    if (typeof this.repository.listChildAssignments !== 'function') {
      const progress = await this.getChildProgress(parentUserId, childId);
      return {
        ...progress,
        paths: [{
          key: 'default',
          ...progress.path,
          assignmentType: 'primary',
          status: 'active',
          summary: progress.summary,
          activities: progress.activities,
          suggestedActivity: progress.suggestedActivity
        }]
      };
    }
    const [child, consents] = await Promise.all([
      this.childService.getOwnedChild(parentUserId, childId),
      this.childService.listConsents(parentUserId, childId)
    ]);
    if (child.status !== 'active') throw new AppError(409, 'CHILD_PROFILE_ARCHIVED', 'أعد تفعيل ملف الطفل لعرض تقدمه.');
    if (!consents.some((consent) => consent.consentType === 'learning_data' && consent.granted)) {
      throw new AppError(403, 'LEARNING_CONSENT_REQUIRED', 'يلزم تفعيل موافقة حفظ أنشطة التعلّم لعرض التقدم والاقتراحات لهذا الملف.');
    }
    await this.subscriptionService.requireActive(parentUserId);
    let assignments = await this.repository.listChildAssignments(parentUserId, childId);
    const resultsByPath = new Map();
    if (assignments.length === 0) {
      const legacyPath = await this.repository.getPathByKey('default');
      if (legacyPath?.status === 'published') {
        const [legacyProgress, legacyResults] = await Promise.all([
          this.repository.getChildProgress(parentUserId, childId, 'default'),
          this.gameRepository.getChildActivityResults(
            parentUserId,
            childId,
            legacyPath.activities.map(({ gameId }) => gameId),
            legacyPath.rules.sampleSize
          )
        ]);
        if (legacyProgress || legacyResults.some(({ attemptCount }) => attemptCount > 0)) {
          assignments = [{
            pathKey: 'default',
            assignmentType: 'legacy',
            status: 'active',
            reason: 'مسار متوافق مع سجل التعلّم السابق.'
          }];
          resultsByPath.set('default', legacyResults);
        }
      }
    }
    const paths = [];
    for (const assignment of assignments.filter(({ status }) => status !== 'removed')) {
      const path = await this.repository.getPathByKey(assignment.pathKey);
      if (!path || path.status !== 'published') continue;
      const results = resultsByPath.get(path.key) ?? await this.gameRepository.getChildActivityResults(
        parentUserId,
        childId,
        path.activities.map(({ gameId }) => gameId),
        path.rules.sampleSize
      );
      const resultsById = new Map(results.map((result) => [result.gameId, result]));
      const completed = await this.repository.getChildProgress(parentUserId, childId, path.key);
      const completedById = new Map((completed?.completedActivities ?? []).map((item) => [item.gameId, item]));
      for (const result of results) {
        if (result.recentAttempts.length < path.rules.minimumAttempts) continue;
        const percent = accuracyPercent(result.recentAttempts);
        if (percent >= path.rules.targetAccuracyPercent) {
          const item = {
            gameId: result.gameId,
            completedAt: result.recentAttempts[0].completedAt ?? this.now(),
            qualifyingAttempts: result.recentAttempts.length,
            accuracyPercent: percent
          };
          await this.repository.markActivityCompleted(parentUserId, childId, path.key, item);
          completedById.set(item.gameId, item);
        }
      }
      const requiredIncomplete = path.activities.findIndex(
        (activity) => activity.required !== false && !completedById.has(activity.gameId)
      );
      const optionalIncomplete = path.activities.findIndex(
        (activity) => activity.required === false && !completedById.has(activity.gameId)
      );
      const suggestionIndex = requiredIncomplete >= 0
        ? requiredIncomplete
        : optionalIncomplete >= 0 ? optionalIncomplete : 0;
      const activities = path.activities.map((activity, index) => {
        const result = resultsById.get(activity.gameId);
        const completion = completedById.get(activity.gameId);
        return {
          ...activity,
          status: completion ? 'completed' : activity.required === false || index === suggestionIndex ? 'available' : 'upcoming',
          attemptCount: Math.max(result?.attemptCount ?? 0, completion?.qualifyingAttempts ?? 0),
          recentAccuracyPercent: result ? accuracyPercent(result.recentAttempts) : completion?.accuracyPercent ?? null,
          completion: completion ?? null,
          suggested: index === suggestionIndex,
          suggestionReason: index === suggestionIndex
            ? completion
              ? 'اكتملت الأنشطة الحالية؛ يمكن تكرار هذا النشاط للمراجعة.'
              : 'اقتراح النشاط التالي في المسار المحدد.'
            : null
        };
      });
      const requiredActivities = activities.filter(({ required }) => required !== false);
      const pathActivitiesComplete = requiredActivities.length
        ? requiredActivities.every(({ status }) => status === 'completed')
        : activities.every(({ status }) => status === 'completed');
      let assignmentStatus = assignment.status;
      if (assignment.status === 'active'
        && pathActivitiesComplete) {
        const updated = await this.repository.updateAssignment(
          parentUserId,
          childId,
          path.key,
          {
            status: 'completed',
            historyEntry: {
              action: 'completed',
              reason: 'اكتملت الأنشطة المطلوبة بناءً على المحاولات المسجلة.',
              actorUserId: parentUserId,
              source: 'automatic',
              createdAt: this.now()
            }
          }
        );
        assignmentStatus = updated?.status ?? 'completed';
      }
      paths.push({
        key: path.key,
        title: path.title,
        description: path.description,
        assignmentType: assignment.assignmentType,
        assignmentReason: assignment.reason,
        status: assignmentStatus,
        summary: {
          completedActivities: activities.filter(({ status }) => status === 'completed').length,
          totalActivities: activities.length
        },
        activities,
        suggestedActivity: activities[suggestionIndex] ?? null
      });
    }
    const legacy = paths.find(({ key }) => key === 'default') ?? null;
    return {
      childId,
      paths,
      ...(legacy ?? {}),
      note: 'تعرض الخريطة الأنشطة المسجلة فعليًا. هذه ملاحظات تعليمية وليست تشخيصًا أو تقييمًا طبيًا.'
    };
  }

  async listAdminAssignments(childId) {
    return this.repository.listAdminAssignments(childId);
  }

  async reviewAssignment(actor, parentUserId, childId, pathKey, status, reason = '') {
    const current = await this.repository.listChildAssignments(parentUserId, childId);
    const assignment = current.find((item) => item.pathKey === pathKey);
    if (!assignment) throw new AppError(404, 'LEARNING_ASSIGNMENT_NOT_FOUND', 'تعيين مسار التعلّم غير موجود.');
    const action = status === 'removed' ? 'removed' : status === 'paused' ? 'paused' : 'resumed';
    const updated = await this.repository.updateAssignment(parentUserId, childId, pathKey, {
      status,
      historyEntry: {
        action,
        reason,
        actorUserId: actor._id ?? actor.id,
        source: 'admin',
        createdAt: this.now()
      }
    });
    await this.audit(actor, 'admin.learning_path_assignment_reviewed', { childId, pathKey, status });
    return updated;
  }

  async removeActivityForTrial(actor, gameId) {
    if (typeof this.repository.listPaths !== 'function') {
      const path = await this.repository.getPath();
      if (!path?.activities.some((activity) => activity.gameId === gameId)) return;
      if (path.activities.length <= 1) {
        throw new AppError(409, 'LEARNING_PATH_REQUIRES_ACTIVITY', 'أضف نشاطًا آخر إلى مسار التعلّم قبل اختياره لعبة تجريبية.');
      }
      await this.updatePath(actor, {
        title: path.title,
        description: path.description,
        activities: path.activities.filter(({ gameId: id }) => id !== gameId),
        rules: path.rules
      });
      return;
    }
    const paths = await this.repository.listPaths();
    const affectedPaths = paths.filter((path) => path.activities.some((activity) => activity.gameId === gameId));
    if (affectedPaths.some((path) => path.status === 'published' && path.activities.length <= 1)) {
      throw new AppError(409, 'LEARNING_PATH_REQUIRES_ACTIVITY', 'أضف نشاطًا آخر أو أوقف نشر المسار قبل اختيار اللعبة كنشاط تجريبي.');
    }
    for (const path of affectedPaths.filter(({ activities }) => activities.length > 1)) {
      await this.repository.updatePathByKey(path.key, {
        activities: path.activities.filter((activity) => activity.gameId !== gameId),
        updatedBy: actor._id ?? actor.id
      });
    }
  }

  async assertCanSelectTrials(gameIds) {
    if (typeof this.repository.listPaths !== 'function') return;
    const paths = await this.repository.listPaths();
    const blockedPath = paths.find((path) => path.status === 'published'
      && path.activities.length <= 1
      && gameIds.includes(path.activities[0]?.gameId));
    if (blockedPath) {
      throw new AppError(409, 'LEARNING_PATH_REQUIRES_ACTIVITY', `أضف نشاطًا آخر إلى مسار «${blockedPath.title}» قبل اختياره لعبة تجريبية.`);
    }
  }

  async getChildProgress(parentUserId, childId) {
    const [child, consents] = await Promise.all([
      this.childService.getOwnedChild(parentUserId, childId),
      this.childService.listConsents(parentUserId, childId)
    ]);
    if (child.status !== 'active') {
      throw new AppError(409, 'CHILD_PROFILE_ARCHIVED', 'أعد تفعيل ملف الطفل لعرض تقدمه.');
    }
    if (!consents.some((consent) => consent.consentType === 'learning_data' && consent.granted)) {
      throw new AppError(403, 'LEARNING_CONSENT_REQUIRED', 'يلزم تفعيل موافقة حفظ أنشطة التعلّم لعرض التقدم والاقتراحات لهذا الملف.');
    }
    await this.subscriptionService.requireActive(parentUserId);

    const path = serializePath(await this.repository.getPath());
    const { activities, rules } = path;
    const results = await this.gameRepository.getChildActivityResults(
      parentUserId,
      childId,
      activities.map(({ gameId }) => gameId),
      rules.sampleSize
    );
    const resultsById = new Map(results.map((result) => [result.gameId, result]));
    const completedById = new Map();
    for (const result of results) {
      if (result.recentAttempts.length < rules.minimumAttempts) continue;
      const recentAccuracyPercent = accuracyPercent(result.recentAttempts);
      if (recentAccuracyPercent >= rules.targetAccuracyPercent) {
        const completion = {
          gameId: result.gameId,
          completedAt: result.recentAttempts[0].completedAt ?? this.now(),
          qualifyingAttempts: result.recentAttempts.length,
          accuracyPercent: recentAccuracyPercent
        };
        await this.repository.markActivityCompleted(parentUserId, childId, 'default', completion);
        completedById.set(result.gameId, completion);
      }
    }
    const persistedProgress = await this.repository.getChildProgress(parentUserId, childId, 'default');
    for (const completion of persistedProgress?.completedActivities ?? []) {
      completedById.set(completion.gameId, completion);
    }

    const firstIncompleteIndex = activities.findIndex(({ gameId }) => !completedById.has(gameId));
    const suggestionIndex = firstIncompleteIndex < 0 ? 0 : firstIncompleteIndex;
    const progressActivities = activities.map((activity, index) => {
      const result = resultsById.get(activity.gameId);
      const completed = completedById.get(activity.gameId);
      const recentAccuracy = result ? accuracyPercent(result.recentAttempts) : completed?.accuracyPercent ?? null;
      const isSuggestion = index === suggestionIndex;
      const recentAttemptCount = result?.recentAttempts.length ?? 0;
      return {
        ...activity,
        status: completed ? 'completed' : isSuggestion ? 'available' : 'upcoming',
        attemptCount: Math.max(result?.attemptCount ?? 0, completed?.qualifyingAttempts ?? 0),
        recentAccuracyPercent: recentAccuracy,
        completion: completed ?? null,
        suggested: isSuggestion,
        suggestionReason: isSuggestion
          ? completed
            ? 'اكتملت الأنشطة الحالية؛ يمكن تكرار هذا النشاط للمراجعة.'
            : recentAttemptCount < rules.minimumAttempts
              ? `اقتراح تعليمي: كرروا النشاط حتى تسجيل ${rules.minimumAttempts} محاولات قبل الانتقال.`
              : `اقتراح تعليمي: واصلوا التدريب؛ قاعدة الانتقال تتطلب ${rules.targetAccuracyPercent}% على الأقل في آخر ${rules.sampleSize} محاولات.`
          : null
      };
    });
    const completedCount = progressActivities.filter((activity) => activity.status === 'completed').length;
    return {
      childId,
      path: { title: path.title, description: path.description, rules },
      summary: { completedActivities: completedCount, totalActivities: activities.length },
      activities: progressActivities,
      suggestedActivity: progressActivities[suggestionIndex] ?? null,
      note: 'هذه اقتراحات تعليمية مبنية على محاولات مسجلة فقط، وليست تشخيصًا أو تقييمًا طبيًا.'
    };
  }

  async assertActivityConfigured(gameId) {
    const [availableGames, trialSetting] = await Promise.all([
      this.repository.listPublishedActivities(),
      this.repository.getTrialGameId()
    ]);
    if (selectedTrialIds(trialSetting).includes(gameId)
      || !availableGames.some((game) => game.gameId === gameId)) {
      throw new AppError(403, 'LEARNING_ACTIVITY_UNAVAILABLE', 'هذا النشاط غير متاح ضمن الألعاب المنشورة.');
    }
  }

  async assertActivityPlayable(parentUserId, childId, gameId) {
    const child = await this.childService.getOwnedChild(parentUserId, childId);
    if (child.status !== 'active') {
      throw new AppError(409, 'CHILD_PROFILE_ARCHIVED', 'أعد تفعيل ملف الطفل قبل بدء النشاط.');
    }
    const consents = await this.childService.listConsents(parentUserId, childId);
    if (!consents.some((consent) => consent.consentType === 'learning_data' && consent.granted)) {
      throw new AppError(403, 'LEARNING_CONSENT_REQUIRED', 'يلزم تفعيل موافقة حفظ أنشطة التعلّم قبل الوصول إلى هذا النشاط.');
    }
    if (typeof this.repository.listChildAssignments !== 'function') {
      const path = serializePath(await this.repository.getPath());
      const activity = path.activities.find((item) => item.gameId === gameId);
      if (!activity) {
        throw new AppError(403, 'LEARNING_ACTIVITY_UNAVAILABLE', 'هذا النشاط غير مُدرج حاليًا في مسار التعلّم.');
      }
      const progress = await this.getChildProgress(parentUserId, childId);
      const selected = progress.activities.find((item) => item.gameId === gameId);
      if (selected?.status === 'upcoming') {
        throw new AppError(409, 'LEARNING_ACTIVITY_LOCKED', 'أكملوا النشاط المتاح في المسار أولًا. يمكنكم تكرار الأنشطة السابقة في أي وقت.');
      }
      return;
    }
    const assignments = await this.repository.listChildAssignments(parentUserId, childId);
    const activePaths = [];
    for (const assignment of assignments.filter(({ status }) => status === 'active')) {
      const path = await this.repository.getPathByKey(assignment.pathKey);
      if (path?.status === 'published' && path.activities.some((activity) => activity.gameId === gameId)) {
        activePaths.push(path);
      }
    }
    if (!activePaths.length) return;
    const progress = await this.getChildLearningOverview(parentUserId, childId);
    const selectedActivities = progress.paths
      .filter(({ key }) => activePaths.some((path) => path.key === key))
      .flatMap(({ activities }) => activities.filter((activity) => activity.gameId === gameId));
    if (selectedActivities.length > 0 && selectedActivities.every(({ status }) => status === 'upcoming')) {
      throw new AppError(409, 'LEARNING_ACTIVITY_LOCKED', 'أكملوا النشاط المتاح في المسار أولًا. يمكنكم تكرار الأنشطة السابقة في أي وقت.');
    }
  }

  async audit(actor, action, metadata) {
    if (!this.authService?.recordAudit) return;
    await this.authService.recordAudit(action, {
      actorUserId: actor._id ?? actor.id,
      metadata
    });
  }
}

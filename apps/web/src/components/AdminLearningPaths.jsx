import { useEffect, useState } from 'react';
import brandAsset from '../../../../Branding/Colors with logo.png';
import { apiRequest, getApiUrl } from '../lib/api.js';

const emptyPath = {
  key: '',
  title: '',
  description: '',
  status: 'draft',
  ageBands: [],
  skillIds: [],
  objectives: [],
  matchingRules: {
    skillIds: [],
    answerOptionIds: [],
    ageBands: [],
    minimumMatches: 1,
    priority: 0,
    assignmentType: 'either'
  },
  activities: [],
  rules: { minimumAttempts: 3, sampleSize: 5, targetAccuracyPercent: 75 }
};

function emptyLevel(pathKey = '', sortOrder = 0, levelCompletionStars = 20) {
  return {
    learningPathKey: pathKey,
    title: '',
    titleEnglish: '',
    description: '',
    descriptionEnglish: '',
    coverImageAssetId: null,
    sortOrder,
    gameIds: [],
    minimumCompletedGames: 1,
    minimumScorePercent: 0,
    mandatoryGameIds: [],
    completionRule: 'count',
    additionalGamesCount: 0,
    unlockAfterLevelId: null,
    completionReward: { stars: levelCompletionStars, badgeRewardId: null, giftRewardId: null },
    rewardsActive: true,
    celebrationEnabled: true,
    active: true
  };
}

function emptyReward(type = 'badge') {
  return {
    name: '',
    description: '',
    type,
    imageAssetId: null,
    category: type === 'badge' ? 'achievement' : 'accessory',
    rarity: 'common',
    unlockDescription: '',
    active: true
  };
}

const learningSkills = [
  { id: 'communication', label: 'التواصل' },
  { id: 'vocabulary', label: 'المفردات' },
  { id: 'expression', label: 'التعبير' },
  { id: 'listening', label: 'الاستماع وفهم التعليمات' },
  { id: 'visual-recognition', label: 'التعرّف على الصور' },
  { id: 'attention', label: 'الانتباه والتفاعل' },
  { id: 'sound-awareness', label: 'الوعي بالأصوات' }
];

const ageBands = [
  { id: '3-5', label: '٣–٥ سنوات' },
  { id: '6-8', label: '٦–٨ سنوات' },
  { id: '9-12', label: '٩–١٢ سنة' },
  { id: '13+', label: '١٣ سنة فأكثر' }
];

function skillLabel(skillId) {
  return learningSkills.find((skill) => skill.id === skillId)?.label ?? skillId;
}

export default function AdminLearningPaths({ logoUrl }) {
  const [tab, setTab] = useState('paths');
  const [paths, setPaths] = useState([]);
  const [availableGames, setAvailableGames] = useState([]);
  const [registrationReviews, setRegistrationReviews] = useState([]);
  const [editingPath, setEditingPath] = useState(null);
  const [questionnaire, setQuestionnaire] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [levels, setLevels] = useState([]);
  const [rewards, setRewards] = useState([]);
  const [activeLevelPathKey, setActiveLevelPathKey] = useState('');
  const [mediaAssets, setMediaAssets] = useState([]);
  const [gamificationSettings, setGamificationSettings] = useState(null);
  const [levelEditor, setLevelEditor] = useState(null);
  const [rewardEditor, setRewardEditor] = useState(null);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [rewardSearchText, setRewardSearchText] = useState('');
  const [rewardChildren, setRewardChildren] = useState([]);
  const [selectedRewardChild, setSelectedRewardChild] = useState(null);
  const [rewardSummary, setRewardSummary] = useState(null);
  const [rewardHistory, setRewardHistory] = useState([]);
  const [rewardHistoryType, setRewardHistoryType] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [pathData, questionnaireData, assignmentData, reviewData, levelData, rewardData, settingsData, assetData] = await Promise.all([
        apiRequest('/api/v1/admin/learning-paths'),
        apiRequest('/api/v1/admin/learning-questionnaire'),
        apiRequest('/api/v1/admin/learning-assignments'),
        apiRequest('/api/v1/admin/learning-registration-reviews'),
        apiRequest('/api/v1/admin/learning-levels'),
        apiRequest('/api/v1/admin/rewards'),
        apiRequest('/api/v1/admin/gamification-settings'),
        apiRequest('/api/v1/admin/assets')
      ]);
      setPaths(pathData.paths);
      setActiveLevelPathKey((current) => current && pathData.paths.some(({ key }) => key === current)
        ? current
        : pathData.paths[0]?.key ?? '');
      setAvailableGames(pathData.availableGames);
      setQuestionnaire(questionnaireData.questionnaire);
      setAssignments(assignmentData.assignments);
      setRegistrationReviews(reviewData.reviews);
      setLevels(levelData.levels);
      setRewards(rewardData.rewards);
      setGamificationSettings(settingsData.settings);
      setMediaAssets(assetData.assets.filter(({ kind, active, available }) => kind === 'image' && active && available));
      setEditingPath((current) => current
        ? pathData.paths.find((path) => path.key === current.key) ?? current
        : null);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const updatePath = (field, value) => {
    setEditingPath((current) => ({ ...current, [field]: value }));
  };

  const updateMatchingRule = (field, value) => {
    setEditingPath((current) => ({
      ...current,
      matchingRules: { ...current.matchingRules, [field]: value }
    }));
  };

  const togglePathAge = (ageBand) => {
    setEditingPath((current) => {
      const selected = new Set(current.ageBands ?? []);
      if (selected.has(ageBand)) selected.delete(ageBand);
      else selected.add(ageBand);
      return { ...current, ageBands: [...selected] };
    });
  };

  const togglePathSkill = (skillId) => {
    setEditingPath((current) => {
      const currentSkills = new Set([
        ...(current.skillIds ?? []),
        ...(current.matchingRules?.skillIds ?? [])
      ]);
      if (currentSkills.has(skillId)) currentSkills.delete(skillId);
      else currentSkills.add(skillId);
      return {
        ...current,
        skillIds: (current.skillIds ?? []).filter((id) => currentSkills.has(id)),
        matchingRules: { ...current.matchingRules, skillIds: [...currentSkills] }
      };
    });
  };

  const togglePathOption = (optionId) => {
    const selected = new Set(editingPath.matchingRules?.answerOptionIds ?? []);
    if (selected.has(optionId)) selected.delete(optionId);
    else selected.add(optionId);
    updateMatchingRule('answerOptionIds', [...selected]);
  };

  const questionnaireSkillIds = [...new Set(
    questionnaire?.questions.flatMap((question) => question.options.flatMap((option) => option.skillIds ?? [])) ?? []
  )];
  const pathSkillIds = [...new Set([
    ...questionnaireSkillIds,
    ...(editingPath?.skillIds ?? []),
    ...(editingPath?.matchingRules?.skillIds ?? [])
  ])];

  const pathStatus = (status) => ({
    published: 'منشور',
    archived: 'مؤرشف',
    draft: 'مسودة'
  }[status] ?? 'مسودة');

  const savePath = async (event) => {
    event.preventDefault();
    if (!editingPath) return;
    setSaving(true);
    setError('');
    setNotice('');
    const payload = {
      key: editingPath.key,
      title: editingPath.title,
      description: editingPath.description,
      status: editingPath.status,
      ageBands: editingPath.ageBands,
      skillIds: editingPath.skillIds,
      objectives: editingPath.objectives,
      matchingRules: editingPath.matchingRules,
      activities: editingPath.activities.map((activity) => ({
        gameId: activity.gameId,
        title: activity.title,
        learningArea: activity.learningArea,
        description: activity.description,
        required: activity.required,
        repeatable: activity.repeatable,
        skillIds: activity.skillIds
      })),
      rules: editingPath.rules
    };
    try {
      const isExisting = paths.some(({ key }) => key === editingPath.key);
      const result = await apiRequest(
        isExisting
          ? `/api/v1/admin/learning-paths/${encodeURIComponent(editingPath.key)}`
          : '/api/v1/admin/learning-paths',
        {
          method: isExisting ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }
      );
      setNotice('تم حفظ مسار التعلّم.');
      setEditingPath(result.path);
      await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  const addActivity = (gameId) => {
    const game = availableGames.find((item) => item.gameId === gameId);
    if (!game || !editingPath || editingPath.activities.some((item) => item.gameId === gameId)) return;
    updatePath('activities', [...editingPath.activities, {
      gameId,
      title: game.title,
      learningArea: 'مهارات التعلّم',
      description: `نشاط تعليمي: ${game.title}`,
      required: true,
      repeatable: true,
      skillIds: []
    }]);
  };

  const saveQuestionnaire = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const result = await apiRequest('/api/v1/admin/learning-questionnaire', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          maxAssignments: questionnaire.maxAssignments,
          questions: questionnaire.questions
        })
      });
      setQuestionnaire(result.questionnaire);
      setNotice('تم نشر إصدار جديد من استبيان وليّ الأمر.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  const updateQuestion = (questionId, updates) => {
    setQuestionnaire((current) => ({
      ...current,
      questions: current.questions.map((question) => question.id === questionId
        ? { ...question, ...updates }
        : question)
    }));
  };

  const addQuestion = () => {
    const id = `question-${Date.now()}`;
    setQuestionnaire((current) => ({
      ...current,
      questions: [...current.questions, {
        id,
        text: '',
        helpText: '',
        type: 'single',
        required: true,
        options: [
          { id: `${id}-option-1`, label: '', skillIds: [] },
          { id: `${id}-option-2`, label: '', skillIds: [] }
        ]
      }]
    }));
  };

  const addOption = (question) => {
    if (question.options.length >= 12) return;
    const id = `${question.id}-option-${Date.now()}`;
    updateQuestion(question.id, {
      options: [...question.options, { id, label: '', skillIds: [] }]
    });
  };

  const moveQuestion = (questionIndex, offset) => {
    setQuestionnaire((current) => {
      const target = questionIndex + offset;
      if (target < 0 || target >= current.questions.length) return current;
      const questions = [...current.questions];
      [questions[questionIndex], questions[target]] = [questions[target], questions[questionIndex]];
      return { ...current, questions };
    });
  };

  const reviewAssignment = async (assignment, status) => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await apiRequest('/api/v1/admin/learning-assignments/review', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentUserId: assignment.parentUserId,
          childId: assignment.childId,
          pathKey: assignment.pathKey,
          status,
          reason: status === 'removed' ? 'مراجعة إدارية' : ''
        })
      });
      setNotice('تم تحديث حالة تعيين المسار.');
      await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  const saveLevel = async (event) => {
    event.preventDefault();
    if (!levelEditor) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const payload = {
        learningPathKey: levelEditor.learningPathKey,
        title: levelEditor.title,
        titleEnglish: levelEditor.titleEnglish ?? '',
        description: levelEditor.description,
        descriptionEnglish: levelEditor.descriptionEnglish ?? '',
        coverImageAssetId: levelEditor.coverImageAssetId ?? null,
        sortOrder: Number(levelEditor.sortOrder),
        gameIds: levelEditor.gameIds,
        minimumCompletedGames: Number(levelEditor.minimumCompletedGames),
        minimumScorePercent: Number(levelEditor.minimumScorePercent),
        mandatoryGameIds: levelEditor.mandatoryGameIds,
        completionRule: levelEditor.completionRule,
        additionalGamesCount: Number(levelEditor.additionalGamesCount ?? 0),
        unlockAfterLevelId: levelEditor.unlockAfterLevelId ?? null,
        completionReward: {
          stars: levelEditor.completionReward?.stars ?? null,
          badgeRewardId: levelEditor.completionReward?.badgeRewardId ?? null,
          giftRewardId: levelEditor.completionReward?.giftRewardId ?? null
        },
        rewardsActive: levelEditor.rewardsActive,
        celebrationEnabled: levelEditor.celebrationEnabled,
        active: levelEditor.active
      };
      const levelId = levelEditor.id ?? levelEditor._id;
      const result = await apiRequest(
        levelId
          ? `/api/v1/admin/learning-levels/${encodeURIComponent(levelId)}`
          : '/api/v1/admin/learning-levels',
        {
          method: levelId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }
      );
      setLevelEditor(result.level);
      setNotice('تم حفظ المستوى وإعداداته.');
      await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteLevel = async () => {
    if (!levelEditor || !window.confirm('هل تريد حذف هذا المستوى؟ لا يمكن حذف مستوى له تقدم محفوظ.')) return;
    setSaving(true);
    setError('');
    try {
      await apiRequest(`/api/v1/admin/learning-levels/${encodeURIComponent(levelEditor.id ?? levelEditor._id)}`, {
        method: 'DELETE'
      });
      setLevelEditor(null);
      setNotice('تم حذف المستوى.');
      await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  const reorderLevels = async (level, offset) => {
    const pathLevels = levels
      .filter(({ learningPathKey }) => learningPathKey === level.learningPathKey)
      .sort((left, right) => left.sortOrder - right.sortOrder);
    const index = pathLevels.findIndex(({ id }) => id === level.id);
    const target = index + offset;
    if (target < 0 || target >= pathLevels.length) return;
    [pathLevels[index], pathLevels[target]] = [pathLevels[target], pathLevels[index]];
    try {
      setSaving(true);
      await apiRequest(`/api/v1/admin/learning-paths/${encodeURIComponent(level.learningPathKey)}/learning-levels/reorder`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds: pathLevels.map(({ id }) => id) })
      });
      setNotice('تم تحديث ترتيب مستويات المغامرة.');
      await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  const saveReward = async (event) => {
    event.preventDefault();
    if (!rewardEditor) return;
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: rewardEditor.name,
        description: rewardEditor.description,
        type: rewardEditor.type,
        imageAssetId: rewardEditor.imageAssetId ?? null,
        category: rewardEditor.category,
        rarity: rewardEditor.rarity,
        unlockDescription: rewardEditor.unlockDescription,
        active: rewardEditor.active
      };
      const rewardId = rewardEditor.id ?? rewardEditor._id;
      const result = await apiRequest(
        rewardId
          ? `/api/v1/admin/rewards/${encodeURIComponent(rewardId)}`
          : '/api/v1/admin/rewards',
        {
          method: rewardId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }
      );
      setRewardEditor(result.reward);
      setNotice('تم حفظ تعريف المكافأة.');
      await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteReward = async () => {
    if (!rewardEditor || !window.confirm('هل تريد حذف المكافأة؟ إذا كانت مرتبطة بمستوى أو سجل صرف، عطّلها بدلًا من حذفها.')) return;
    setSaving(true);
    setError('');
    try {
      await apiRequest(`/api/v1/admin/rewards/${encodeURIComponent(rewardEditor._id ?? rewardEditor.id)}`, {
        method: 'DELETE'
      });
      setRewardEditor(null);
      setNotice('تم حذف المكافأة.');
      await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  const saveRewardSettings = async (event) => {
    event.preventDefault();
    if (!gamificationSettings) return;
    setSettingsSaving(true);
    setError('');
    try {
      const payload = {
        completionStars: Number(gamificationSettings.completionStars),
        performanceBonusStars: Number(gamificationSettings.performanceBonusStars),
        performanceThresholdPercent: Number(gamificationSettings.performanceThresholdPercent),
        firstCompletionBonusStars: Number(gamificationSettings.firstCompletionBonusStars),
        levelCompletionStars: Number(gamificationSettings.levelCompletionStars),
        adventureCompletionStars: Number(gamificationSettings.adventureCompletionStars),
        repeatRewardsEnabled: gamificationSettings.repeatRewardsEnabled,
        maxRepeatRewardCount: Number(gamificationSettings.maxRepeatRewardCount),
        repeatCooldownMinutes: Number(gamificationSettings.repeatCooldownMinutes),
        gameRewards: gamificationSettings.gameRewards.map((rule) => ({
          ...rule,
          completionStars: Number(rule.completionStars),
          performanceBonusStars: Number(rule.performanceBonusStars),
          performanceThresholdPercent: Number(rule.performanceThresholdPercent),
          firstCompletionBonusStars: Number(rule.firstCompletionBonusStars),
          maxRepeatRewardCount: Number(rule.maxRepeatRewardCount),
          repeatCooldownMinutes: Number(rule.repeatCooldownMinutes)
        }))
      };
      const { settings } = await apiRequest('/api/v1/admin/gamification-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      setGamificationSettings(settings);
      setNotice('تم حفظ إعدادات النجوم والمكافآت.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSettingsSaving(false);
    }
  };

  const searchRewardHistory = async (event) => {
    event.preventDefault();
    setError('');
    try {
      const { children: matches } = await apiRequest(
        `/api/v1/admin/gamification-children?q=${encodeURIComponent(rewardSearchText.trim())}`
      );
      setRewardChildren(matches);
      setSelectedRewardChild(null);
      setRewardHistory([]);
      if (matches.length === 0) setNotice('لا يوجد طفل بهذا الاسم.');
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const selectRewardChild = async (child) => {
    setSelectedRewardChild(child);
    setError('');
    try {
      const [summary, history] = await Promise.all([
        apiRequest(`/api/v1/admin/gamification-children/${child.id}/rewards`),
        apiRequest(`/api/v1/admin/reward-transactions?childId=${encodeURIComponent(child.id)}${rewardHistoryType ? `&rewardType=${rewardHistoryType}` : ''}`)
      ]);
      setRewardSummary({ totalStars: summary.totalStars, badges: summary.badges.filter(({ earned }) => earned), gifts: summary.gifts.filter(({ earned }) => earned) });
      setRewardHistory(history.transactions);
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const updateLevelEditor = (field, value) => {
    setLevelEditor((current) => ({ ...current, [field]: value }));
  };

  const updateLevelReward = (field, value) => {
    setLevelEditor((current) => ({
      ...current,
      completionReward: { ...current.completionReward, [field]: value }
    }));
  };

  const toggleLevelGame = (gameId, mandatory = false) => {
    setLevelEditor((current) => {
      const field = mandatory ? 'mandatoryGameIds' : 'gameIds';
      const values = new Set(current[field] ?? []);
      if (values.has(gameId)) values.delete(gameId);
      else values.add(gameId);
      const next = { ...current, [field]: [...values] };
      if (mandatory && !next.gameIds.includes(gameId)) next.gameIds.push(gameId);
      if (!mandatory && !values.has(gameId)) {
        next.mandatoryGameIds = next.mandatoryGameIds.filter((id) => id !== gameId);
      }
      return next;
    });
  };

  const moveLevelGame = (index, offset) => {
    setLevelEditor((current) => {
      const target = index + offset;
      if (target < 0 || target >= current.gameIds.length) return current;
      const gameIds = [...current.gameIds];
      [gameIds[index], gameIds[target]] = [gameIds[target], gameIds[index]];
      return { ...current, gameIds };
    });
  };

  const updateSettings = (field, value) => {
    setGamificationSettings((current) => ({ ...current, [field]: value }));
  };

  const addGameRewardRule = (gameId) => {
    if (!gameId || gamificationSettings.gameRewards.some((rule) => rule.gameId === gameId)) return;
    setGamificationSettings((current) => ({
      ...current,
      gameRewards: [...current.gameRewards, {
        gameId,
        completionStars: current.completionStars,
        performanceBonusStars: current.performanceBonusStars,
        performanceThresholdPercent: current.performanceThresholdPercent,
        firstCompletionBonusStars: current.firstCompletionBonusStars,
        repeatRewardsEnabled: current.repeatRewardsEnabled,
        maxRepeatRewardCount: current.maxRepeatRewardCount,
        repeatCooldownMinutes: current.repeatCooldownMinutes
      }]
    }));
  };

  const updateGameRewardRule = (gameId, field, value) => {
    setGamificationSettings((current) => ({
      ...current,
      gameRewards: current.gameRewards.map((rule) => rule.gameId === gameId
        ? { ...rule, [field]: value }
        : rule)
    }));
  };

  const removeGameRewardRule = (gameId) => {
    setGamificationSettings((current) => ({
      ...current,
      gameRewards: current.gameRewards.filter((rule) => rule.gameId !== gameId)
    }));
  };

  return (
    <section className="admin-dashboard__content admin-dashboard-panel admin-learning-management">
      <div className="admin-dashboard-panel__heading">
        <div>
          <h2>إدارة مسارات التعلّم</h2>
          <p>المطابقة التعليمية شفافة وقابلة للتعديل، ولا تمثل تشخيصًا أو تقييمًا طبيًا.</p>
        </div>
        <button type="button" className="button button--small button--outline" disabled={loading} onClick={load}>
          تحديث
        </button>
      </div>
      <div className="admin-learning-tabs" role="tablist" aria-label="أقسام إعداد التعلّم">
        <button type="button" aria-selected={tab === 'paths'} onClick={() => setTab('paths')}>المسارات</button>
        <button type="button" aria-selected={tab === 'levels'} onClick={() => setTab('levels')}>المستويات والمغامرة</button>
        <button type="button" aria-selected={tab === 'rewards'} onClick={() => setTab('rewards')}>المكافآت والنجوم</button>
        <button type="button" aria-selected={tab === 'questionnaire'} onClick={() => setTab('questionnaire')}>استبيان وليّ الأمر</button>
        <button type="button" aria-selected={tab === 'assignments'} onClick={() => setTab('assignments')}>تعيينات الأطفال</button>
        <button type="button" aria-selected={tab === 'reviews'} onClick={() => setTab('reviews')}>
          حالات تحتاج مراجعة{registrationReviews.length ? ` (${registrationReviews.length})` : ''}
        </button>
      </div>
      {error && <p className="auth-error" role="alert">{error}</p>}
      {notice && <p className="auth-success" role="status">{notice}</p>}
      {loading ? <p className="dashboard-loading" role="status">جارٍ تحميل إعدادات التعلّم…</p> : null}
      {!loading && tab === 'paths' && (
        <div className={`admin-learning-path-manager${paths.length === 0 ? ' is-empty' : ''}`}>
          <aside className="admin-path-sidebar">
            <div className="admin-path-sidebar__heading">
              <div>
                <span>مكتبة المسارات</span>
                <strong>{paths.length} مسارات</strong>
              </div>
              <button type="button" className="admin-path-create" aria-label="إنشاء مسار جديد"
                onClick={() => setEditingPath({ ...emptyPath })}>+</button>
            </div>
            <div className="admin-learning-path-list">
              {paths.map((path) => (
                <button type="button" key={path.key}
                  className={`admin-learning-path-list__item${editingPath?.key === path.key ? ' is-selected' : ''}`}
                  onClick={() => setEditingPath({ ...path })}>
                  <span className="admin-learning-path-list__icon" aria-hidden="true">↗</span>
                  <span className="admin-learning-path-list__content">
                    <strong>{path.title}</strong>
                    <small>{path.activities.length} أنشطة</small>
                  </span>
                  <span className={`admin-path-status admin-path-status--${path.status}`}>{pathStatus(path.status)}</span>
                </button>
              ))}
              {paths.length === 0 && (
                <div className="admin-path-empty">
                  <span aria-hidden="true">✦</span>
                  <p>لم تنشئ أي مسار بعد.</p>
                  <small>أنشئ مسارًا لربط الأنشطة بالأهداف التعليمية.</small>
                  <button type="button" className="button button--small button--primary"
                    onClick={() => setEditingPath({ ...emptyPath })}>إنشاء أول مسار</button>
                </div>
              )}
            </div>
          </aside>
          {editingPath && (
            <form className="admin-learning-path" onSubmit={savePath}>
              <div className="admin-path-editor-heading">
                <div>
                  <span className="admin-questionnaire-step">{paths.some(({ key }) => key === editingPath.key) ? 'تعديل مسار' : 'مسار جديد'}</span>
                  <h3>{editingPath.title || 'مسار تعلّم جديد'}</h3>
                  <p>أكمل المعلومات ومعايير التوصية، ثم أضف الأنشطة واحفظ التغييرات.</p>
                </div>
                <span className={`admin-path-status admin-path-status--${editingPath.status}`}>{pathStatus(editingPath.status)}</span>
              </div>

              <section className="admin-path-editor-section">
                <div className="admin-path-section-heading">
                  <span>١</span><div><h4>معلومات المسار</h4><p>هذه التفاصيل تظهر لوليّ الأمر عند مراجعة التوصية.</p></div>
                </div>
                <div className="admin-path-form-grid">
                  <label className="admin-path-field--wide">اسم المسار
                    <input value={editingPath.title} required maxLength={120} placeholder="مثال: مسار الصور والمفردات"
                      onChange={(event) => updatePath('title', event.target.value)} />
                  </label>
                  <label className="admin-path-field--wide">وصف مختصر
                    <textarea value={editingPath.description} required maxLength={500} rows={2}
                      placeholder="اشرح لوليّ الأمر ما الذي يقدمه هذا المسار"
                      onChange={(event) => updatePath('description', event.target.value)} />
                  </label>
                  <label>حالة المسار
                    <select value={editingPath.status} onChange={(event) => updatePath('status', event.target.value)}>
                      <option value="draft">مسودة — غير ظاهر للتوصيات</option>
                      <option value="published">منشور — متاح للتوصيات</option>
                      <option value="archived">مؤرشف — غير متاح للتوصيات</option>
                    </select>
                  </label>
                  {!paths.some(({ key }) => key === editingPath.key) && (
                    <label>معرّف داخلي (بالإنجليزية)
                      <input value={editingPath.key} required maxLength={60} pattern="[a-z0-9-]+"
                        placeholder="مثال: visual-vocabulary"
                        onChange={(event) => updatePath('key', event.target.value)} />
                    </label>
                  )}
                  {paths.some(({ key }) => key === editingPath.key) && (
                    <div className="admin-path-readonly-id"><span>المعرّف الداخلي</span><code>{editingPath.key}</code></div>
                  )}
                </div>
              </section>

              <section className="admin-path-editor-section">
                <div className="admin-path-section-heading">
                  <span>٢</span><div><h4>متى نقترح هذا المسار؟</h4><p>اختر العمر والمهارات والاختيارات التي تناسب هذا المسار. لا حاجة لإدخال رموز تقنية.</p></div>
                </div>
                <div className="admin-path-rule-group">
                  <strong>الفئة العمرية المناسبة</strong>
                  <small>اترك جميع الفئات دون تحديد إذا كان المسار مناسبًا للجميع.</small>
                  <div className="admin-path-chip-list">
                    {ageBands.map((band) => (
                      <label className="admin-path-chip" key={band.id}>
                        <input type="checkbox" checked={(editingPath.ageBands ?? []).includes(band.id)}
                          onChange={() => togglePathAge(band.id)} />
                        <span>{band.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="admin-path-rule-group">
                  <strong>المهارات التي يركز عليها المسار</strong>
                  <small>تظهر المهارة في سبب التوصية إذا اختار وليّ الأمر إجابة مرتبطة بها.</small>
                  <div className="admin-path-chip-list">
                    {pathSkillIds.map((skillId) => (
                      <label className="admin-path-chip" key={skillId}>
                        <input type="checkbox" checked={(editingPath.skillIds ?? []).includes(skillId)
                          || (editingPath.matchingRules?.skillIds ?? []).includes(skillId)}
                          onChange={() => togglePathSkill(skillId)} />
                        <span>{skillLabel(skillId)}</span>
                      </label>
                    ))}
                  </div>
                  {pathSkillIds.length === 0 && (
                    <small>لا توجد مهارات مرتبطة بالاستبيان حاليًا. اربط مهارات بإجابات الاستبيان أولًا، أو استخدم اختيار إجابة محددة أدناه.</small>
                  )}
                </div>
                <details className="admin-path-advanced">
                  <summary>تحديد إجابات معينة من الاستبيان (اختياري)</summary>
                  <p>فعّل هذا الخيار إذا كان المسار يجب أن يظهر عند اختيار إجابة بعينها. يظل ربط المهارات أعلاه هو الطريقة الأبسط.</p>
                  {questionnaire?.questions.map((question) => (
                    <div className="admin-path-answer-group" key={question.id}>
                      <strong>{question.text}</strong>
                      <div className="admin-path-chip-list">
                        {question.options.map((option) => (
                          <label className="admin-path-chip" key={option.id}>
                            <input type="checkbox" checked={(editingPath.matchingRules?.answerOptionIds ?? []).includes(option.id)}
                              onChange={() => togglePathOption(option.id)} />
                            <span>{option.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </details>
                <div className="admin-path-rule-controls">
                  <label>عدد المعايير المطلوبة لتطابق الإجابة
                    <input type="number" min="1" max="20" value={editingPath.matchingRules?.minimumMatches ?? 1}
                      onChange={(event) => updateMatchingRule('minimumMatches', Number(event.target.value))} />
                    <small>كل مهارة أو إجابة محددة تُحسب معيارًا واحدًا. يكفي تطابق هذا العدد لظهور التوصية.</small>
                  </label>
                  <label>نوع المسار عند التوصية
                    <select value={editingPath.matchingRules?.assignmentType ?? 'either'} onChange={(event) => updateMatchingRule('assignmentType', event.target.value)}>
                      <option value="either">يحدده ترتيب التوصيات تلقائيًا</option>
                      <option value="primary">أساسي</option>
                      <option value="complementary">تكميلي</option>
                    </select>
                  </label>
                  <label>أولوية العرض
                    <input type="number" min="0" max="1000" value={editingPath.matchingRules?.priority ?? 0}
                      onChange={(event) => updateMatchingRule('priority', Number(event.target.value))} />
                    <small>عند تطابق أكثر من مسار، تظهر الأولوية الأعلى أولًا.</small>
                  </label>
                </div>
              </section>

              <section className="admin-path-editor-section">
                <div className="admin-path-section-heading">
                  <span>٣</span><div><h4>أنشطة المسار وترتيبها</h4><p>الترتيب هو تسلسل الأنشطة المقترح. لا يمكن إضافة لعبة غير منشورة أو اللعبة التجريبية.</p></div>
                </div>
                <div className="admin-path-activity-list">
                {editingPath.activities.map((activity, index) => (
                  <article className="admin-path-activity" key={`${activity.gameId}-${index}`}>
                    <div className="admin-path-activity__top">
                      <span className="admin-path-activity__order">{index + 1}</span>
                      <div><strong>{activity.title}</strong><small>{activity.learningArea}</small></div>
                      <div className="admin-path-activity__actions">
                        <button type="button" aria-label={`تحريك ${activity.title} لأعلى`} title="لأعلى" disabled={index === 0}
                        onClick={() => {
                          const activities = [...editingPath.activities];
                          [activities[index - 1], activities[index]] = [activities[index], activities[index - 1]];
                          updatePath('activities', activities);
                        }}>↑</button>
                        <button type="button" aria-label={`تحريك ${activity.title} لأسفل`} title="لأسفل" disabled={index === editingPath.activities.length - 1}
                        onClick={() => {
                          const activities = [...editingPath.activities];
                          [activities[index + 1], activities[index]] = [activities[index], activities[index + 1]];
                          updatePath('activities', activities);
                        }}>↓</button>
                        <button type="button" aria-label={`إزالة ${activity.title}`} title="إزالة" disabled={editingPath.activities.length <= 1}
                          onClick={() => updatePath('activities', editingPath.activities.filter((item) => item.gameId !== activity.gameId))}>×</button>
                      </div>
                    </div>
                    <div className="admin-path-activity__fields">
                      <label>مجال التعلّم
                        <input value={activity.learningArea} required maxLength={100}
                          onChange={(event) => updatePath('activities', editingPath.activities.map((item, itemIndex) => itemIndex === index ? { ...item, learningArea: event.target.value } : item))} />
                      </label>
                      <label>وصف النشاط
                        <input value={activity.description} required maxLength={240}
                          onChange={(event) => updatePath('activities', editingPath.activities.map((item, itemIndex) => itemIndex === index ? { ...item, description: event.target.value } : item))} />
                      </label>
                    </div>
                    <div className="admin-path-activity__toggles">
                      <label className="admin-learning-checkbox">
                        <input type="checkbox" checked={activity.required !== false}
                          onChange={(event) => updatePath('activities', editingPath.activities.map((item, itemIndex) => itemIndex === index ? { ...item, required: event.target.checked } : item))} />
                        مطلوب لإكمال المسار
                      </label>
                      <label className="admin-learning-checkbox">
                        <input type="checkbox" checked={activity.repeatable !== false}
                          onChange={(event) => updatePath('activities', editingPath.activities.map((item, itemIndex) => itemIndex === index ? { ...item, repeatable: event.target.checked } : item))} />
                        يمكن تكراره
                      </label>
                    </div>
                    {!availableGames.some(({ gameId }) => gameId === activity.gameId) && (
                      <small className="admin-path-activity__warning" role="alert">هذه اللعبة غير منشورة حاليًا؛ استبدلها قبل نشر المسار.</small>
                    )}
                  </article>
                ))}
              </div>
                <label className="admin-path-add-activity">إضافة لعبة منشورة
                  <select value="" onChange={(event) => addActivity(event.target.value)}>
                    <option value="">اختر لعبة من المكتبة</option>
                    {availableGames.filter(({ gameId }) => !editingPath.activities.some((item) => item.gameId === gameId))
                      .map((game) => <option key={game.gameId} value={game.gameId}>{game.title}</option>)}
                  </select>
                </label>
              </section>

              <details className="admin-path-advanced">
                <summary>إعدادات التقدم وإكمال المسار</summary>
                <p>يُحسب الإكمال من نتائج المحاولات الفعلية المسجلة، ولا ينشئ درجات تقديرية.</p>
                <div className="admin-path-rule-controls">
                  <label>الحد الأدنى للمحاولات
                    <input type="number" min="2" max="10" value={editingPath.rules.minimumAttempts}
                      onChange={(event) => updatePath('rules', { ...editingPath.rules, minimumAttempts: Number(event.target.value) })} />
                  </label>
                  <label>عدد المحاولات التي تُراجع
                    <input type="number" min="2" max="10" value={editingPath.rules.sampleSize}
                      onChange={(event) => updatePath('rules', { ...editingPath.rules, sampleSize: Number(event.target.value) })} />
                  </label>
                  <label>نسبة الإجابات الصحيحة المطلوبة (%)
                    <input type="number" min="50" max="100" value={editingPath.rules.targetAccuracyPercent}
                      onChange={(event) => updatePath('rules', { ...editingPath.rules, targetAccuracyPercent: Number(event.target.value) })} />
                  </label>
                </div>
              </details>
              <div className="admin-path-editor-footer">
                <button type="button" className="button button--outline" onClick={() => setEditingPath(null)}>إلغاء</button>
                <button type="submit" className="button button--primary" disabled={saving || editingPath.activities.length === 0}>
                  {saving ? 'جارٍ الحفظ…' : 'حفظ التغييرات'}
                </button>
              </div>
            </form>
          )}
          {!editingPath && paths.length > 0 && (
            <div className="admin-path-no-selection">
              <span aria-hidden="true">↗</span>
              <h3>اختر مسارًا لبدء التعديل</h3>
              <p>أو أنشئ مسارًا جديدًا لتحديد الفئة العمرية والمهارات والأنشطة المناسبة.</p>
              <button type="button" className="button button--primary" onClick={() => setEditingPath({ ...emptyPath })}>إنشاء مسار جديد</button>
            </div>
          )}
        </div>
      )}
      {!loading && tab === 'levels' && (
        <div className="admin-learning-path-manager">
          <aside className="admin-path-sidebar">
            <label>المغامرة / مسار التعلّم
              <select value={activeLevelPathKey} onChange={(event) => {
                setActiveLevelPathKey(event.target.value);
                setLevelEditor(null);
              }}>
                {paths.map((path) => <option value={path.key} key={path.key}>{path.title}</option>)}
              </select>
            </label>
            <div className="admin-path-sidebar__heading">
              <div><span>المستويات</span><strong>{levels.filter(({ learningPathKey }) => learningPathKey === activeLevelPathKey).length} مستوى</strong></div>
              <button type="button" className="admin-path-create" disabled={!activeLevelPathKey}
                onClick={() => setLevelEditor(emptyLevel(
                  activeLevelPathKey,
                  levels.filter(({ learningPathKey }) => learningPathKey === activeLevelPathKey).length,
                  gamificationSettings?.levelCompletionStars ?? 20
                ))}>+</button>
            </div>
            {levels.filter(({ learningPathKey }) => learningPathKey === activeLevelPathKey)
              .sort((left, right) => left.sortOrder - right.sortOrder)
              .map((level, index, list) => (
                <article className="admin-level-list-item" key={level.id}>
                  <button type="button" className={`admin-learning-path-list__item admin-level-list-item__select${(levelEditor?.id ?? levelEditor?._id) === level.id ? ' is-selected' : ''}`}
                    onClick={() => setLevelEditor({ ...level })}>
                    <strong>{index + 1}. {level.title}</strong>
                    <small>{level.gameIds.length} ألعاب · {level.active ? 'نشط' : 'معطّل'}</small>
                  </button>
                  <div className="admin-level-order-actions">
                    <button type="button" aria-label="رفع المستوى" disabled={saving || index === 0}
                      onClick={() => void reorderLevels(level, -1)}>↑</button>
                    <button type="button" aria-label="خفض المستوى" disabled={saving || index === list.length - 1}
                      onClick={() => void reorderLevels(level, 1)}>↓</button>
                  </div>
                </article>
              ))}
            {activeLevelPathKey && !levels.some(({ learningPathKey }) => learningPathKey === activeLevelPathKey)
              && <p>أضف أول مستوى لبدء بناء المغامرة.</p>}
          </aside>
          {levelEditor ? (
            <form className="admin-learning-path" onSubmit={saveLevel}>
              <div className="admin-path-editor-heading">
                <div>
                  <span className="admin-questionnaire-step">{levelEditor.id || levelEditor._id ? 'تعديل مستوى' : 'مستوى جديد'}</span>
                  <h3>{levelEditor.title || 'مستوى مغامرة جديد'}</h3>
                  <p>اختَر الألعاب وقاعدة الإكمال والمكافآت. تُحسب النتيجة على الخادم من المحاولة المحفوظة.</p>
                </div>
                <label className="admin-level-active-toggle">
                  <input type="checkbox" checked={levelEditor.active}
                    onChange={(event) => updateLevelEditor('active', event.target.checked)} />
                  المستوى نشط
                </label>
              </div>
              <div className="admin-path-form-grid">
                <label>المسار
                  <select value={levelEditor.learningPathKey} required
                    onChange={(event) => updateLevelEditor('learningPathKey', event.target.value)}>
                    {paths.map((path) => <option value={path.key} key={path.key}>{path.title}</option>)}
                  </select>
                </label>
                <label>رقم الترتيب
                  <input type="number" min="0" value={levelEditor.sortOrder} readOnly aria-describedby="level-order-help" />
                </label>
                <small id="level-order-help">استخدم سهمَي الرفع والخفض في قائمة المستويات لتغيير الترتيب.</small>
                <label className="admin-path-field--wide">اسم المستوى بالعربية
                  <input required maxLength={120} value={levelEditor.title}
                    onChange={(event) => updateLevelEditor('title', event.target.value)} />
                </label>
                <label className="admin-path-field--wide">اسم المستوى بالإنجليزية (اختياري)
                  <input maxLength={120} value={levelEditor.titleEnglish ?? ''}
                    onChange={(event) => updateLevelEditor('titleEnglish', event.target.value)} />
                </label>
                <label className="admin-path-field--wide">الوصف بالعربية
                  <textarea required rows={2} maxLength={500} value={levelEditor.description}
                    onChange={(event) => updateLevelEditor('description', event.target.value)} />
                </label>
                <label className="admin-path-field--wide">الوصف بالإنجليزية (اختياري)
                  <textarea rows={2} maxLength={500} value={levelEditor.descriptionEnglish ?? ''}
                    onChange={(event) => updateLevelEditor('descriptionEnglish', event.target.value)} />
                </label>
                <label className="admin-path-field--wide">صورة غلاف من مكتبة الوسائط
                  <select value={levelEditor.coverImageAssetId ?? ''}
                    onChange={(event) => updateLevelEditor('coverImageAssetId', event.target.value || null)}>
                    <option value="">بدون صورة غلاف</option>
                    {mediaAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.displayName}</option>)}
                  </select>
                </label>
              </div>
              <section className="admin-path-editor-section">
                <h4>ألعاب المستوى وترتيبها</h4>
                <p>الألعاب المتاحة مأخوذة من أنشطة المسار المنشورة وغير التجريبية.</p>
                <div className="admin-level-game-picker">
                  {availableGames.filter(({ gameId }) => paths.find(({ key }) => key === levelEditor.learningPathKey)
                    ?.activities.some((activity) => activity.gameId === gameId)).map((game) => (
                    <label className="admin-level-game-option" key={game.gameId}>
                      <input type="checkbox" checked={levelEditor.gameIds.includes(game.gameId)}
                        onChange={() => toggleLevelGame(game.gameId)} />
                      <span>{game.title}<small>{game.gameId}</small></span>
                    </label>
                  ))}
                </div>
                <ol className="admin-level-selected-games">
                  {levelEditor.gameIds.map((gameId, index) => (
                    <li key={gameId}>
                      <span>{availableGames.find((game) => game.gameId === gameId)?.title ?? gameId}</span>
                      <label><input type="checkbox" checked={levelEditor.mandatoryGameIds.includes(gameId)}
                        onChange={() => toggleLevelGame(gameId, true)} /> إلزامية</label>
                      <button type="button" disabled={index === 0} onClick={() => moveLevelGame(index, -1)} aria-label="رفع اللعبة">↑</button>
                      <button type="button" disabled={index === levelEditor.gameIds.length - 1} onClick={() => moveLevelGame(index, 1)} aria-label="خفض اللعبة">↓</button>
                      <button type="button" onClick={() => toggleLevelGame(gameId)} aria-label="إزالة اللعبة">إزالة</button>
                    </li>
                  ))}
                </ol>
              </section>
              <section className="admin-path-editor-section">
                <h4>قاعدة إكمال المستوى</h4>
                <label>طريقة الإكمال
                  <select value={levelEditor.completionRule}
                    onChange={(event) => setLevelEditor((current) => ({
                      ...current,
                      completionRule: event.target.value,
                      minimumScorePercent: event.target.value === 'mandatory-score' && current.minimumScorePercent === 0
                        ? 70
                        : current.minimumScorePercent
                    }))}>
                    <option value="all">إنهاء كل الألعاب المحددة</option>
                    <option value="count">إنهاء عدد محدد من الألعاب، مع الألعاب الإلزامية</option>
                    <option value="mandatory-count">إنهاء الألعاب الإلزامية وعدد إضافي من الألعاب</option>
                    <option value="mandatory-score">إنهاء كل الألعاب الإلزامية وتحقيق حد النتيجة</option>
                  </select>
                </label>
                <p className="dashboard-privacy-note">
                  {levelEditor.completionRule === 'all'
                    ? 'يُكمل الطفل المستوى عند إنهاء كل الألعاب النشطة المعيّنة.'
                    : levelEditor.completionRule === 'mandatory-count'
                      ? 'يجب إنهاء جميع الألعاب الإلزامية بالإضافة إلى العدد الإضافي أدناه.'
                      : levelEditor.completionRule === 'mandatory-score'
                        ? 'يجب إنهاء كل الألعاب الإلزامية وتحقيق حد النتيجة في كل لعبة منها.'
                        : 'يجب إنهاء الألعاب الإلزامية والعدد الإجمالي المحدد أدناه.'}
                </p>
                {levelEditor.completionRule === 'count' && (
                  <label>عدد الألعاب المطلوب إنهاؤها
                    <input type="number" min={Math.max(1, levelEditor.mandatoryGameIds.length)}
                      max={levelEditor.gameIds.length} value={levelEditor.minimumCompletedGames}
                      onChange={(event) => updateLevelEditor('minimumCompletedGames', Number(event.target.value))} />
                  </label>
                )}
                {levelEditor.completionRule === 'mandatory-count' && (
                  <label>عدد الألعاب الإضافية بعد الإلزامية
                    <input type="number" min="0"
                      max={Math.max(0, levelEditor.gameIds.length - levelEditor.mandatoryGameIds.length)}
                      value={levelEditor.additionalGamesCount}
                      onChange={(event) => updateLevelEditor('additionalGamesCount', Number(event.target.value))} />
                  </label>
                )}
                <label>أقل نتيجة مقبولة لكل لعبة مطلوبة (%)
                  <input type="number" min={levelEditor.completionRule === 'mandatory-score' ? 1 : 0}
                    max="100" value={levelEditor.minimumScorePercent}
                    onChange={(event) => updateLevelEditor('minimumScorePercent', Number(event.target.value))} />
                </label>
                <label>شرط فتح المستوى (اختياري)
                  <select value={levelEditor.unlockAfterLevelId ?? ''}
                    onChange={(event) => updateLevelEditor('unlockAfterLevelId', event.target.value || null)}>
                    <option value="">المستوى السابق حسب الترتيب</option>
                    {levels.filter((item) => item.learningPathKey === levelEditor.learningPathKey
                      && item.sortOrder < levelEditor.sortOrder
                      && item.id !== (levelEditor.id ?? levelEditor._id))
                      .map((item) => <option key={item.id} value={item.id}>{item.sortOrder + 1}. {item.title}</option>)}
                  </select>
                </label>
              </section>
              <section className="admin-path-editor-section">
                <h4>مكافأة إكمال المستوى</h4>
                <div className="admin-path-form-grid">
                  <label>النجوم
                    <input type="number" min="0" max="10000"
                      value={levelEditor.completionReward?.stars ?? gamificationSettings?.levelCompletionStars ?? 20}
                      onChange={(event) => updateLevelReward('stars', Number(event.target.value))} />
                  </label>
                  <label>الشارة
                    <select value={levelEditor.completionReward?.badgeRewardId ?? ''}
                      onChange={(event) => updateLevelReward('badgeRewardId', event.target.value || null)}>
                      <option value="">بدون شارة</option>
                      {rewards.filter(({ type }) => type === 'badge' && type).map((reward) => (
                        <option key={reward._id} value={reward._id}>{reward.name}{reward.active ? '' : ' (معطّلة)'}</option>
                      ))}
                    </select>
                  </label>
                  <label>هدية افتراضية
                    <select value={levelEditor.completionReward?.giftRewardId ?? ''}
                      onChange={(event) => updateLevelReward('giftRewardId', event.target.value || null)}>
                      <option value="">بدون هدية</option>
                      {rewards.filter(({ type }) => type === 'gift').map((reward) => (
                        <option key={reward._id} value={reward._id}>{reward.name}{reward.active ? '' : ' (معطّلة)'}</option>
                      ))}
                    </select>
                  </label>
                  <label><input type="checkbox" checked={levelEditor.rewardsActive}
                    onChange={(event) => updateLevelEditor('rewardsActive', event.target.checked)} /> تفعيل مكافآت المستوى</label>
                  <label><input type="checkbox" checked={levelEditor.celebrationEnabled}
                    onChange={(event) => updateLevelEditor('celebrationEnabled', event.target.checked)} /> عرض احتفال عند الإكمال</label>
                </div>
              </section>
              <aside className="admin-level-child-preview" dir="rtl">
                {levelEditor.coverImageAssetId && (
                  <img src={getApiUrl(`/api/v1/admin/assets/${levelEditor.coverImageAssetId}/preview`)} alt="" />
                )}
                <span>معاينة خريطة الطفل · المستوى {levelEditor.sortOrder + 1}</span>
                <h4>{levelEditor.title || 'اسم المستوى'}</h4>
                <p>{levelEditor.description || 'وصف المغامرة سيظهر للطفل هنا.'}</p>
                <small>{levelEditor.gameIds.length} ألعاب · {levelEditor.completionReward?.stars ?? 0} نجمة عند الإكمال</small>
              </aside>
              <div className="admin-path-editor-footer">
                <button type="button" className="button button--outline" onClick={() => setLevelEditor(null)}>إلغاء</button>
                {(levelEditor.id || levelEditor._id) && (
                  <button type="button" className="button button--outline" disabled={saving} onClick={() => void deleteLevel()}>حذف بأمان</button>
                )}
                <button type="submit" className="button button--primary" disabled={saving || levelEditor.gameIds.length === 0}>
                  {saving ? 'جارٍ الحفظ…' : 'حفظ المستوى'}
                </button>
              </div>
            </form>
          ) : (
            <div className="admin-path-no-selection">
              <h3>مغامرة {paths.find(({ key }) => key === activeLevelPathKey)?.title ?? ''}</h3>
              <p>{paths.find(({ key }) => key === activeLevelPathKey)?.description ?? 'اختر مسارًا منشورًا أو أنشئ مسارًا جديدًا.'}</p>
              <button type="button" className="button button--primary" disabled={!activeLevelPathKey}
                onClick={() => setLevelEditor(emptyLevel(activeLevelPathKey, levels.filter(({ learningPathKey }) => learningPathKey === activeLevelPathKey).length, gamificationSettings?.levelCompletionStars ?? 20))}>
                إضافة مستوى
              </button>
            </div>
          )}
        </div>
      )}
      {!loading && tab === 'rewards' && (
        <div className="admin-gamification-manager">
          <header className="admin-reward-hero">
            <span>مركز إدارة المكافآت</span>
            <h2>النجوم والمكافآت</h2>
            <p>حدّد متى يكسب الطفل النجوم، ثم أنشئ الشارات والهدايا واربطها بالمستويات. كل مكافأة تُسجّل في سجل واضح.</p>
          </header>
          {gamificationSettings && (
            <form className="admin-dashboard-subpanel" onSubmit={saveRewardSettings}>
              <div className="admin-reward-section-heading">
                <span className="admin-reward-step">١</span>
                <div>
                  <h3>قواعد كسب النجوم</h3>
                  <p>هذه القواعد الافتراضية للألعاب، ما لم تضبط مكافأة مختلفة للعبة بعينها.</p>
                </div>
              </div>
              <div className="admin-reward-overview">
                <article><span aria-hidden="true">⭐</span><strong>{gamificationSettings.completionStars}</strong><small>نجوم إكمال اللعبة</small></article>
                <article><span aria-hidden="true">🏆</span><strong>+{gamificationSettings.performanceBonusStars}</strong><small>عند تحقيق {gamificationSettings.performanceThresholdPercent}%</small></article>
                <article><span aria-hidden="true">🚩</span><strong>{gamificationSettings.levelCompletionStars}</strong><small>نجمة لإكمال المستوى</small></article>
                <article><span aria-hidden="true">🗺️</span><strong>{gamificationSettings.adventureCompletionStars}</strong><small>نجمة لإكمال المغامرة</small></article>
              </div>
              <div className="admin-reward-settings-groups">
                <section className="admin-reward-settings-group">
                  <h4>مكافأة اللعبة</h4>
                  <p>تُمنح عند إكمال اللعبة بنجاح. مكافأة أول إكمال تُضاف مرة واحدة فقط.</p>
                  <div className="admin-path-form-grid">
                    {[
                      ['completionStars', 'نجوم إكمال اللعبة'],
                      ['firstCompletionBonusStars', 'إضافة لأول إكمال']
                    ].map(([field, label]) => (
                      <label key={field}>{label}
                        <input type="number" min="0" max="10000" value={gamificationSettings[field]}
                          onChange={(event) => updateSettings(field, Number(event.target.value))} />
                      </label>
                    ))}
                  </div>
                </section>
                <section className="admin-reward-settings-group">
                  <h4>مكافأة الأداء المميز</h4>
                  <p>تُضاف النجوم الإضافية عندما يبلغ الطفل حد الأداء المحدد.</p>
                  <div className="admin-path-form-grid">
                    {[
                      ['performanceBonusStars', 'نجوم إضافية'],
                      ['performanceThresholdPercent', 'حد الأداء (%)']
                    ].map(([field, label]) => (
                      <label key={field}>{label}
                        <input type="number" min="0" max={field.includes('Percent') ? 100 : 10000}
                          value={gamificationSettings[field]}
                          onChange={(event) => updateSettings(field, Number(event.target.value))} />
                      </label>
                    ))}
                  </div>
                </section>
                <section className="admin-reward-settings-group">
                  <h4>مكافآت التقدم</h4>
                  <p>تُمنح هذه النجوم عند إكمال المستوى أو جميع مستويات المغامرة.</p>
                  <div className="admin-path-form-grid">
                    {[
                      ['levelCompletionStars', 'نجوم إكمال المستوى'],
                      ['adventureCompletionStars', 'نجوم إكمال المغامرة']
                    ].map(([field, label]) => (
                      <label key={field}>{label}
                        <input type="number" min="0" max="10000" value={gamificationSettings[field]}
                          onChange={(event) => updateSettings(field, Number(event.target.value))} />
                      </label>
                    ))}
                  </div>
                </section>
                <section className="admin-reward-settings-group">
                  <h4>مكافآت إعادة اللعبة</h4>
                  <p>تجنّب تكرار النجوم بلا حدود: فعّل الإعادة ثم حدّد سقف المكافآت ووقت الانتظار.</p>
                  <label className="admin-reward-toggle">
                    <input type="checkbox" checked={gamificationSettings.repeatRewardsEnabled}
                      onChange={(event) => updateSettings('repeatRewardsEnabled', event.target.checked)} />
                    <span><strong>السماح بمكافآت الإعادة</strong><small>تُطبّق على الألعاب التي لا تملك إعدادًا خاصًا.</small></span>
                  </label>
                  <div className="admin-path-form-grid">
                    <label>الحد الأقصى لمكافآت الإعادة
                      <input type="number" min="0" max="1000" disabled={!gamificationSettings.repeatRewardsEnabled}
                        value={gamificationSettings.maxRepeatRewardCount}
                        onChange={(event) => updateSettings('maxRepeatRewardCount', Number(event.target.value))} />
                    </label>
                    <label>الانتظار بين المكافآت (دقيقة)
                      <input type="number" min="0" max="43200" disabled={!gamificationSettings.repeatRewardsEnabled}
                        value={gamificationSettings.repeatCooldownMinutes}
                        onChange={(event) => updateSettings('repeatCooldownMinutes', Number(event.target.value))} />
                    </label>
                  </div>
                </section>
              </div>
              <div className="admin-path-editor-footer">
                <button className="button button--primary" disabled={settingsSaving}>
                  {settingsSaving ? 'جارٍ الحفظ…' : 'حفظ الإعدادات العامة'}
                </button>
              </div>
              <div className="admin-reward-section-heading admin-reward-section-heading--subsection">
                <span className="admin-reward-step">٢</span>
                <div><h3>تخصيص مكافأة لعبة</h3><p>أضف استثناءً للعبة محددة؛ الألعاب الأخرى تظل على الإعدادات العامة.</p></div>
              </div>
              <label className="admin-reward-game-picker">إضافة لعبة منشورة
                <select value="" onChange={(event) => addGameRewardRule(event.target.value)}>
                  <option value="">اختر لعبة لإضافة إعداد خاص…</option>
                  {availableGames.filter(({ gameId }) => !gamificationSettings.gameRewards.some((rule) => rule.gameId === gameId))
                    .map((game) => <option value={game.gameId} key={game.gameId}>{game.title}</option>)}
                </select>
              </label>
              {gamificationSettings.gameRewards.map((rule) => (
                <fieldset className="admin-game-reward-rule" key={rule.gameId}>
                  <legend>{availableGames.find(({ gameId }) => gameId === rule.gameId)?.title ?? rule.gameId}</legend>
                  <p>إعدادات هذه اللعبة تستبدل القواعد العامة لها فقط.</p>
                  <div className="admin-path-form-grid">
                    {[
                      ['completionStars', 'نجوم الإكمال'],
                      ['performanceBonusStars', 'مكافأة الأداء'],
                      ['performanceThresholdPercent', 'حد الأداء (%)'],
                      ['firstCompletionBonusStars', 'مكافأة أول مرة'],
                      ['maxRepeatRewardCount', 'أقصى مرات الإعادة'],
                      ['repeatCooldownMinutes', 'فترة الانتظار بالدقائق']
                    ].map(([field, label]) => (
                      <label key={field}>{label}
                        <input type="number" min="0" max={field.includes('Percent') ? 100 : field.includes('Count') ? 1000 : 10000}
                          value={rule[field]} onChange={(event) => updateGameRewardRule(
                            rule.gameId, field, Number(event.target.value)
                          )} />
                      </label>
                    ))}
                    <label className="admin-reward-inline-toggle">
                      <input type="checkbox" checked={rule.repeatRewardsEnabled}
                        onChange={(event) => updateGameRewardRule(rule.gameId, 'repeatRewardsEnabled', event.target.checked)} />
                      <span>السماح بمكافأة الإعادة</span>
                    </label>
                  </div>
                  <button type="button" className="button button--small button--outline"
                    onClick={() => removeGameRewardRule(rule.gameId)}>استخدام الإعداد العام لهذه اللعبة</button>
                </fieldset>
              ))}
            </form>
          )}
          <section className="admin-dashboard-subpanel">
            <div className="admin-dashboard-panel__heading">
              <div>
                <span className="admin-reward-step">٣</span>
                <h3>الشارات والهدايا</h3>
                <p>أنشئ مكافأة ثم اربطها بمستوى لتُمنح عند إكماله. الصور تُختار من مكتبة الوسائط.</p>
              </div>
              <div className="admin-path-editor-footer">
                <button type="button" className="button button--small button--outline" onClick={() => setRewardEditor(emptyReward('badge'))}>شارة جديدة</button>
                <button type="button" className="button button--small button--primary" onClick={() => setRewardEditor(emptyReward('gift'))}>هدية جديدة</button>
              </div>
            </div>
            <div className="admin-reward-definition-list">
              {rewards.map((reward) => (
                <button type="button" className={`admin-reward-definition${rewardEditor?._id === reward._id ? ' is-selected' : ''}`} key={reward._id}
                  onClick={() => setRewardEditor({ ...reward })}>
                  {reward.imageAssetId
                    ? <img src={getApiUrl(`/api/v1/admin/assets/${reward.imageAssetId}/preview`)} alt="" />
                    : <span className="admin-reward-definition__placeholder" aria-hidden="true">{reward.type === 'badge' ? '🏅' : '🎁'}</span>}
                  <span className="admin-reward-definition__copy">
                    <strong>{reward.name}</strong><small>{reward.type === 'badge' ? 'شارة' : 'هدية افتراضية'} · {reward.category}</small>
                    <small>{reward.active ? '● نشطة' : '○ متوقفة'}{reward.unlockDescription ? ` · ${reward.unlockDescription}` : ''}</small>
                  </span>
                  <span className="admin-reward-definition__edit">تعديل</span>
                </button>
              ))}
              {rewards.length === 0 && <p className="admin-reward-empty">لا توجد مكافآت بعد. ابدأ بإنشاء شارة أو هدية، ثم اربطها بمستوى.</p>}
            </div>
            {rewardEditor && (
              <form className="admin-reward-editor" onSubmit={saveReward}>
                <div className="admin-reward-section-heading">
                  <span className="admin-reward-step">✎</span>
                  <div>
                    <h4>{rewardEditor._id ? 'تعديل المكافأة' : rewardEditor.type === 'badge' ? 'إنشاء شارة جديدة' : 'إنشاء هدية جديدة'}</h4>
                    <p>أدخل التفاصيل وشاهد معاينة مبسطة قبل الحفظ.</p>
                  </div>
                </div>
                <div className="admin-reward-editor-layout">
                <div className="admin-path-form-grid">
                  <label>النوع
                    <select value={rewardEditor.type} disabled={Boolean(rewardEditor._id)}
                      onChange={(event) => setRewardEditor({ ...rewardEditor, type: event.target.value })}>
                      <option value="badge">شارة</option><option value="gift">هدية افتراضية</option>
                    </select>
                  </label>
                  <label>الفئة
                    <input required maxLength={60} value={rewardEditor.category}
                      onChange={(event) => setRewardEditor({ ...rewardEditor, category: event.target.value })} />
                  </label>
                  <label className="admin-path-field--wide">الاسم
                    <input required maxLength={120} value={rewardEditor.name}
                      onChange={(event) => setRewardEditor({ ...rewardEditor, name: event.target.value })} />
                  </label>
                  <label className="admin-path-field--wide">الوصف
                    <textarea required rows={2} maxLength={500} value={rewardEditor.description}
                      onChange={(event) => setRewardEditor({ ...rewardEditor, description: event.target.value })} />
                  </label>
                  <label>الندرة
                    <select value={rewardEditor.rarity}
                      onChange={(event) => setRewardEditor({ ...rewardEditor, rarity: event.target.value })}>
                      <option value="common">عادية</option><option value="rare">نادرة</option>
                      <option value="epic">ملحمية</option><option value="legendary">أسطورية</option>
                    </select>
                  </label>
                  <label>صورة من مكتبة الوسائط
                    <select value={rewardEditor.imageAssetId ?? ''}
                      onChange={(event) => setRewardEditor({ ...rewardEditor, imageAssetId: event.target.value || null })}>
                      <option value="">بدون صورة</option>
                      {mediaAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.displayName}</option>)}
                    </select>
                  </label>
                  <label className="admin-path-field--wide">طريقة الحصول عليها
                    <input maxLength={300} value={rewardEditor.unlockDescription ?? ''}
                      onChange={(event) => setRewardEditor({ ...rewardEditor, unlockDescription: event.target.value })} />
                  </label>
                  <label className="admin-reward-inline-toggle">
                    <input type="checkbox" checked={rewardEditor.active}
                      onChange={(event) => setRewardEditor({ ...rewardEditor, active: event.target.checked })} />
                    <span>المكافأة نشطة</span>
                  </label>
                </div>
                <aside className="admin-reward-preview" aria-label="معاينة المكافأة">
                  <span>معاينة</span>
                  {rewardEditor.imageAssetId
                    ? <img src={getApiUrl(`/api/v1/admin/assets/${rewardEditor.imageAssetId}/preview`)} alt="" />
                    : <strong className="admin-reward-preview__placeholder">{rewardEditor.type === 'badge' ? '🏅' : '🎁'}</strong>}
                  <h5>{rewardEditor.name || 'اسم المكافأة'}</h5>
                  <p>{rewardEditor.description || 'سيظهر وصف المكافأة هنا.'}</p>
                  <small>{rewardEditor.type === 'badge' ? 'شارة' : 'هدية افتراضية'} · {rewardEditor.rarity}</small>
                  {rewardEditor.unlockDescription && <small>طريقة الحصول: {rewardEditor.unlockDescription}</small>}
                </aside>
                </div>
                <div className="admin-path-editor-footer">
                  <button type="button" className="button button--outline" onClick={() => setRewardEditor(null)}>إلغاء</button>
                  {rewardEditor._id && <button type="button" className="button button--outline" disabled={saving} onClick={() => void deleteReward()}>حذف بأمان</button>}
                  <button type="submit" className="button button--primary" disabled={saving}>{saving ? 'جارٍ الحفظ…' : 'حفظ المكافأة'}</button>
                </div>
              </form>
            )}
          </section>
          <section className="admin-dashboard-subpanel">
            <div className="admin-reward-section-heading">
              <span className="admin-reward-step">٤</span>
              <div><h3>أرصدة الأطفال وسجل المكافآت</h3><p>ابحث عن طفل لمراجعة رصيده والمعاملات التي كوّنته.</p></div>
            </div>
            <form className="admin-reward-child-search" onSubmit={searchRewardHistory}>
              <label>البحث باسم الطفل
                <input required minLength={2} maxLength={50} value={rewardSearchText}
                  onChange={(event) => setRewardSearchText(event.target.value)} />
              </label>
              <button type="submit" className="button button--small button--outline">بحث</button>
            </form>
            {rewardChildren.length > 0 && (
              <div className="admin-reward-child-results">
                {rewardChildren.map((child) => (
                  <button type="button" key={child.id}
                    className={selectedRewardChild?.id === child.id ? 'is-selected' : ''}
                    onClick={() => void selectRewardChild(child)}>{child.displayName}</button>
                ))}
              </div>
            )}
            {selectedRewardChild && (
              <>
                <div className="admin-child-star-balance">
                  <strong>{selectedRewardChild.displayName}</strong>
                  <span>{rewardSummary?.totalStars ?? 0} نجمة</span>
                  <small>{rewardSummary?.badges.length ?? 0} شارات · {rewardSummary?.gifts.length ?? 0} هدايا</small>
                </div>
                <label>نوع المعاملة
                  <select value={rewardHistoryType} onChange={(event) => setRewardHistoryType(event.target.value)}>
                    <option value="">كل المكافآت</option><option value="stars">نجوم</option>
                    <option value="badge">شارات</option><option value="gift">هدايا</option>
                  </select>
                </label>
                <button type="button" className="button button--small button--outline"
                  onClick={() => void selectRewardChild(selectedRewardChild)}>تحديث السجل</button>
                <div className="admin-reward-history">
                  {rewardHistory.map((item) => (
                    <article key={item.id}>
                      <strong>{item.rewardName ?? (item.rewardType === 'stars' ? 'نجوم' : item.rewardType === 'badge' ? 'شارة' : 'هدية')}</strong>
                      <span>{item.quantity} · {item.rewardType}</span>
                      <small>المصدر: {item.sourceGameId ?? item.sourceLevelId ?? item.learningPathKey ?? '—'} · {new Date(item.awardedAt).toLocaleString('ar')}</small>
                      <small>رصيد الطفل: {item.totalStars} نجمة · مرجع: {item.transactionReference}</small>
                    </article>
                  ))}
                  {rewardHistory.length === 0 && <p>لا توجد معاملات مكافآت لهذا الطفل.</p>}
                </div>
              </>
            )}
            <p className="dashboard-privacy-note">تعديل الرصيد يدويًا غير متاح؛ الأرصدة تعتمد على سجل معاملات المكافآت غير القابل للاستبدال.</p>
          </section>
        </div>
      )}
      {!loading && tab === 'questionnaire' && questionnaire && (
        <form className="admin-learning-questionnaire" onSubmit={saveQuestionnaire}>
          <div className="admin-questionnaire-intro">
            <div className="admin-questionnaire-intro__icon" aria-hidden="true">؟</div>
            <div>
              <span className="admin-questionnaire-eyebrow">إعداد وليّ الأمر</span>
              <h3>ما الغرض من هذا الاستبيان؟</h3>
              <p>يساعد وليّ الأمر على وصف تفضيلات الطفل وأهداف التعلّم. تربط المهارات المحددة في الإجابات بالمسارات المناسبة؛ لا يُستخدم الاستبيان للتشخيص أو لتقييم الطفل.</p>
            </div>
          </div>

          <section className="admin-questionnaire-settings" aria-labelledby="questionnaire-settings-title">
            <div>
              <span className="admin-questionnaire-step">إعداد ١</span>
              <h3 id="questionnaire-settings-title">إعدادات الاستبيان</h3>
              <p>الإصدار {questionnaire.version} هو المنشور حاليًا. عند النشر ينشأ إصدار جديد وتظل الإجابات السابقة محفوظة كما هي.</p>
            </div>
            <label>
              <span>الحد الأقصى للمسارات المقترحة لوليّ الأمر</span>
              <select value={questionnaire.maxAssignments}
                onChange={(event) => setQuestionnaire((current) => ({ ...current, maxAssignments: Number(event.target.value) }))}>
                {[1, 2, 3, 4, 5].map((count) => <option value={count} key={count}>{count} {count === 1 ? 'مسار' : 'مسارات'}</option>)}
              </select>
              <small>سيعرض النظام هذا العدد كحد أقصى، ويمكن لوليّ الأمر اختيار مسار واحد أو أكثر من النتائج.</small>
            </label>
          </section>

          <div className="admin-questionnaire-workspace">
            <div className="admin-questionnaire-editor">
              <div className="admin-questionnaire-section-heading">
                <div>
                  <span className="admin-questionnaire-step">إعداد ٢</span>
                  <h3>الأسئلة والاختيارات</h3>
                  <p>رتّب الأسئلة كما ستظهر لوليّ الأمر، ثم اربط كل اختيار بمهارة تعليمية واضحة.</p>
                </div>
                <button type="button" className="button button--small button--outline"
                  disabled={questionnaire.questions.length >= 12} onClick={addQuestion}>
                  + إضافة سؤال
                </button>
              </div>

              {questionnaire.questions.map((question, questionIndex) => (
                <article className="admin-question-card" key={question.id}>
                  <div className="admin-question-card__heading">
                    <span className="admin-question-number">{questionIndex + 1}</span>
                    <div className="admin-question-card__title">
                      <strong>{question.text || 'سؤال جديد'}</strong>
                      <span>{question.type === 'multiple' ? 'يسمح بأكثر من إجابة' : 'إجابة واحدة'}</span>
                    </div>
                    <div className="admin-question-card__actions">
                      <button type="button" aria-label={`تحريك السؤال ${questionIndex + 1} لأعلى`}
                        title="تحريك لأعلى" disabled={questionIndex === 0} onClick={() => moveQuestion(questionIndex, -1)}>↑</button>
                      <button type="button" aria-label={`تحريك السؤال ${questionIndex + 1} لأسفل`}
                        title="تحريك لأسفل" disabled={questionIndex === questionnaire.questions.length - 1} onClick={() => moveQuestion(questionIndex, 1)}>↓</button>
                      {questionnaire.questions.length > 1 && (
                        <button type="button" className="is-danger" aria-label={`حذف السؤال ${questionIndex + 1}`}
                          title="حذف السؤال" onClick={() => setQuestionnaire((current) => ({
                            ...current,
                            questions: current.questions.filter(({ id }) => id !== question.id)
                          }))}>×</button>
                      )}
                    </div>
                  </div>

                  <div className="admin-question-card__fields">
                    <label className="admin-question-field--wide">السؤال الذي سيقرأه وليّ الأمر
                      <input value={question.text} required maxLength={240} placeholder="اكتب السؤال بلغة بسيطة ومباشرة"
                        onChange={(event) => updateQuestion(question.id, { text: event.target.value })} />
                    </label>
                    <label className="admin-question-field--wide">توضيح اختياري أسفل السؤال
                      <input value={question.helpText ?? ''} maxLength={240} placeholder="مثال: يمكن اختيار أكثر من إجابة"
                        onChange={(event) => updateQuestion(question.id, { helpText: event.target.value })} />
                    </label>
                    <label>طريقة الإجابة
                      <select value={question.type} onChange={(event) => updateQuestion(question.id, { type: event.target.value })}>
                        <option value="single">اختيار واحد فقط</option>
                        <option value="multiple">اختيار إجابة أو أكثر</option>
                      </select>
                    </label>
                    <label className="admin-learning-checkbox admin-question-required">
                      <input type="checkbox" checked={question.required}
                        onChange={(event) => updateQuestion(question.id, { required: event.target.checked })} />
                      يجب الإجابة عن هذا السؤال
                    </label>
                  </div>

                  <div className="admin-question-options">
                    <div className="admin-question-options__heading">
                      <div>
                        <h4>اختيارات وليّ الأمر</h4>
                        <p>اكتب الاختيار كما سيظهر، ثم حدّد ما المهارات التي يساعد هذا الاختيار على اقتراحها.</p>
                      </div>
                      <span>{question.options.length} خيارات</span>
                    </div>
                    {question.options.map((option, optionIndex) => (
                      <section className="admin-question-option" key={option.id}>
                        <div className="admin-question-option__top">
                          <span className="admin-question-option__number">{optionIndex + 1}</span>
                          <label>نص الاختيار
                            <input value={option.label} required maxLength={160} placeholder="اكتب إجابة واضحة ومختصرة"
                              onChange={(event) => updateQuestion(question.id, {
                                options: question.options.map((item) => item.id === option.id ? { ...item, label: event.target.value } : item)
                              })} />
                          </label>
                          {question.options.length > 2 && (
                            <button type="button" className="admin-question-remove"
                              onClick={() => updateQuestion(question.id, {
                                options: question.options.filter((item) => item.id !== option.id)
                              })}>حذف</button>
                          )}
                        </div>
                        <fieldset className="admin-question-skills">
                          <legend>ما المهارات التي يرتبط بها هذا الاختيار؟</legend>
                          <p>ستُستخدم المهارات المحددة لشرح سبب اقتراح مسار تعلّم.</p>
                          <div className="admin-question-skills__list">
                            {learningSkills.map((skill) => (
                              <label className="admin-question-skill" key={skill.id}>
                                <input
                                  type="checkbox"
                                  checked={(option.skillIds ?? []).includes(skill.id)}
                                  onChange={(event) => updateQuestion(question.id, {
                                    options: question.options.map((item) => {
                                      if (item.id !== option.id) return item;
                                      const selected = new Set(item.skillIds ?? []);
                                      if (event.target.checked) selected.add(skill.id);
                                      else selected.delete(skill.id);
                                      return { ...item, skillIds: [...selected] };
                                    })
                                  })}
                                />
                                <span>{skill.label}</span>
                              </label>
                            ))}
                          </div>
                        </fieldset>
                        <details className="admin-question-technical">
                          <summary>بيانات تقنية متقدمة</summary>
                          <p>المعرّف الداخلي للاختيار: <code>{option.id}</code></p>
                          <p>المهارات المرتبطة: {(option.skillIds ?? []).map(skillLabel).join('، ') || 'لا توجد مهارات مرتبطة'}</p>
                        </details>
                      </section>
                    ))}
                    <button type="button" className="admin-question-add-option" disabled={question.options.length >= 12}
                      onClick={() => addOption(question)}>+ إضافة اختيار</button>
                  </div>
                </article>
              ))}

              <div className="admin-questionnaire-publish">
                <div>
                  <strong>جاهز للمراجعة؟</strong>
                  <span>النشر ينشئ إصدارًا جديدًا، ولا يغيّر إجابات الاستبيانات السابقة.</span>
                </div>
                <button type="submit" className="button button--primary" disabled={saving || !questionnaire.questions.length}>
                  {saving ? 'جارٍ نشر الإصدار…' : 'حفظ ونشر الإصدار الجديد'}
                </button>
              </div>
            </div>

            <aside className="admin-questionnaire-preview" aria-label="معاينة استبيان وليّ الأمر">
              <div className="admin-questionnaire-preview__heading">
                <span>معاينة مباشرة</span>
                <small>كيف سيظهر الاستبيان لوليّ الأمر</small>
              </div>
              <div className="admin-questionnaire-preview__device">
                <div className="admin-questionnaire-preview__brand">
                  {logoUrl !== undefined && (
                    <img
                      src={logoUrl ? getApiUrl(logoUrl) : brandAsset}
                      alt="شعار حرف"
                      onError={(event) => {
                        event.currentTarget.onerror = null;
                        event.currentTarget.src = brandAsset;
                      }}
                    />
                  )}
                  <div><strong>حرف</strong><small>استبيان وليّ الأمر</small></div>
                </div>
                <div className="admin-questionnaire-preview__progress">
                  <span>أسئلة قصيرة لمساعدتنا على اقتراح أنشطة مناسبة</span>
                  <div><i style={{ width: `${Math.max(10, Math.round(100 / Math.max(questionnaire.questions.length, 1)))}%` }} /></div>
                  <small>{questionnaire.questions.length} أسئلة</small>
                </div>
                {questionnaire.questions.slice(0, 3).map((question, index) => (
                  <section className="admin-questionnaire-preview__question" key={question.id}>
                    <span>السؤال {index + 1}</span>
                    <strong>{question.text || 'سيظهر نص السؤال هنا'}</strong>
                    {question.helpText && <p>{question.helpText}</p>}
                    <div>
                      {question.options.slice(0, 4).map((option) => (
                        <span className="admin-questionnaire-preview__choice" key={option.id}>
                          <i className={question.type === 'multiple' ? 'is-checkbox' : 'is-radio'} aria-hidden="true">
                            {question.type === 'multiple' ? '✓' : ''}
                          </i>
                          {option.label || 'نص الاختيار'}
                        </span>
                      ))}
                      {question.options.length > 4 && <small>+ {question.options.length - 4} اختيارات أخرى</small>}
                    </div>
                  </section>
                ))}
                {questionnaire.questions.length > 3 && (
                  <p className="admin-questionnaire-preview__more">ويظهر {questionnaire.questions.length - 3} أسئلة إضافية بالترتيب نفسه.</p>
                )}
                <p className="admin-questionnaire-preview__note">الإجابات تساعد على اقتراح أنشطة تعليمية، ولا تُعد تشخيصًا أو تقييمًا طبيًا.</p>
              </div>
            </aside>
          </div>
        </form>
      )}
      {!loading && tab === 'assignments' && (
        <div className="admin-learning-path__activities">
          <h3>تعيينات المسارات (آخر ٢٠٠ سجل)</h3>
          {assignments.map((assignment) => (
            <article className="admin-dashboard-panel admin-learning-assignment" key={assignment._id}>
              <div>
                <strong>{assignment.pathKey} · {assignment.assignmentType === 'primary' ? 'أساسي' : 'تكميلي'}</strong>
                <p>ملف طفل: {String(assignment.childId).slice(-8)} · {assignment.status}</p>
                <small>{assignment.reason}</small>
              </div>
              <div className="admin-dashboard-account__actions">
                {assignment.status === 'active'
                  ? <button type="button" className="button button--small button--outline" disabled={saving} onClick={() => reviewAssignment(assignment, 'paused')}>إيقاف مؤقت</button>
                  : assignment.status !== 'removed' && <button type="button" className="button button--small button--outline" disabled={saving} onClick={() => reviewAssignment(assignment, 'active')}>إعادة تفعيل</button>}
                {assignment.status !== 'removed' && <button type="button" className="button button--small button--outline" disabled={saving} onClick={() => reviewAssignment(assignment, 'removed')}>إزالة</button>}
              </div>
            </article>
          ))}
          {assignments.length === 0 && <p className="dashboard-empty-state">لا توجد تعيينات حتى الآن.</p>}
        </div>
      )}
      {!loading && tab === 'reviews' && (
        <section className="admin-learning-path__activities" aria-label="حالات التسجيل التي لم تجد مسارًا">
          <h3>أطفال بانتظار مسار تعليمي مناسب</h3>
          <p>حُفظت الإجابات، لكن قواعد المسارات المنشورة لم تنتج توصية. راجع الإجابات، وحدّث إعداد المسار المناسب عند الحاجة؛ لا يُفعّل ملف الطفل قبل تعيين مسار.</p>
          {registrationReviews.map((review) => (
            <article className="admin-dashboard-panel admin-learning-assignment" key={review.childId}>
              <div>
                <strong>{review.displayName} · ملف {review.childId.slice(-8)}</strong>
                <p>إصدار الاستبيان: {review.questionnaireVersion ?? 'غير متاح'}</p>
                {review.answers.map((answer, index) => (
                  <small key={`${answer.question}-${index}`}>{answer.question}: {answer.answer}</small>
                ))}
              </div>
            </article>
          ))}
          {registrationReviews.length === 0 && <p className="dashboard-empty-state">لا توجد حالات بانتظار المراجعة.</p>}
        </section>
      )}
    </section>
  );
}

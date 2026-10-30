import { useEffect, useMemo, useState } from 'react';
import { apiRequest, getApiUrl } from '../lib/api.js';
import AdminSpatialEditor, { createSpatialDraft } from './games/AdminSpatialEditor.jsx';

const events = [
  ['welcome', 'الترحيب'],
  ['idle', 'الاستعداد'],
  ['listening', 'الاستماع'],
  ['thinking', 'التفكير'],
  ['encouragement', 'الإجابة الخاطئة / التشجيع'],
  ['correct', 'الإجابة الصحيحة'],
  ['completion', 'الإكمال'],
  ['result-success', 'نتيجة ٨٠٪ فأكثر'],
  ['result-practice', 'نتيجة أقل من ٨٠٪'],
  ['background', 'خلفية صوتية أثناء اللعب']
];

const assetKinds = [
  ['image', 'صورة'],
  ['audio', 'صوت'],
  ['animation', 'رسوم متحركة'],
  ['video', 'فيديو']
];

const formatBytes = (bytes) => {
  if (bytes < 1024) return `${bytes} بايت`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} كيلوبايت`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} ميجابايت`;
};

function AdminAssetPreview({ asset }) {
  const [failed, setFailed] = useState(asset.available === false);
  if (failed) return <span role="status">الملف غير متاح للمعاينة</span>;
  const previewUrl = getApiUrl(`/api/v1/admin/assets/${asset.id}/preview`);
  if (asset.kind === 'image' || (asset.kind === 'animation' && asset.mimeType === 'image/gif')) {
    return <img src={previewUrl} alt={asset.altText ?? ''} loading="lazy" crossOrigin="use-credentials"
      onError={() => setFailed(true)} />;
  }
  if (asset.kind === 'audio') {
    return <audio controls preload="none" src={previewUrl} aria-label={`معاينة ${asset.displayName}`}
      crossOrigin="use-credentials" onError={() => setFailed(true)} />;
  }
  if (asset.kind === 'video') {
    return <video controls preload="metadata" src={previewUrl} aria-label={`معاينة ${asset.displayName}`}
      crossOrigin="use-credentials" onError={() => setFailed(true)} />;
  }
  return <span aria-label="ملف رسوم متحركة JSON">JSON</span>;
}

function questionText(content) {
  return content.questions.map((question) => [
    question.prompt,
    ...question.options,
    question.correctAnswerIndex
  ].join(' | ')).join('\n');
}

function parseQuestionText(value) {
  const rows = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!rows.length || rows.length > 20) throw new Error('أدخل سؤالًا واحدًا على الأقل وبحد أقصى 20 سؤالًا.');
  return rows.map((row) => {
    const [prompt, ...parts] = row.split('|').map((part) => part.trim());
    const correctAnswerIndex = Number(parts.pop());
    if (!prompt || parts.length < 2 || parts.length > 6
      || !Number.isInteger(correctAnswerIndex)
      || correctAnswerIndex < 0
      || correctAnswerIndex >= parts.length
      || parts.some((part) => !part)) {
      throw new Error('صيغة السؤال: نص السؤال | خيار ١ | خيار ٢ | رقم الإجابة الصحيحة، ويبدأ ترقيم الخيارات من صفر.');
    }
    return { prompt, options: parts, correctAnswerIndex };
  });
}

function contentPayload(content, questions) {
  const baseContent = {
    template: content.template ?? 'multiple-choice',
    title: content.title.trim(),
    description: content.description.trim(),
    companion: content.companion.trim(),
    companionAnimal: content.companionAnimal.trim(),
    instructions: content.instructions.trim(),
    assetAssignments: content.assetAssignments
  };
  if (baseContent.template === 'picture-matching') {
    return {
      ...baseContent,
      pairs: content.pairs ?? [],
      difficulty: content.difficulty ?? 'beginner',
      questions: []
    };
  }
  if (baseContent.template === 'spatial-relationships') {
    return {
      ...baseContent,
      questions: [],
      spatial: content.spatial
    };
  }
  return {
    ...baseContent,
    questions: questions.map((question, index) => {
      const current = content.questions[index] ?? {};
      return {
        ...question,
        promptImageAssetId: current.promptImageAssetId ?? null,
        promptAudioAssetId: current.promptAudioAssetId ?? null,
        difficulty: current.difficulty ?? 'beginner',
        correctFeedback: current.correctFeedback ?? '',
        incorrectFeedback: current.incorrectFeedback ?? '',
        optionImageAssetIds: question.options.map((_, optionIndex) => (
          current.optionImageAssetIds?.[optionIndex] ?? null
        ))
      };
    })
  };
}

function emptyContent() {
  return {
    template: 'multiple-choice',
    title: '',
    description: '',
    companion: '',
    companionAnimal: '🐢',
    instructions: '',
    questions: [{ prompt: 'اختر حرف «م»', options: ['م', 'ب', 'س'], correctAnswerIndex: 0, difficulty: 'beginner' }],
    pairs: [],
    difficulty: 'beginner',
    spatial: null,
    assetAssignments: []
  };
}

function AdminGameLibrary({ user, onSignOut, onReauthenticate, initialView = 'games' }) {
  const normalizeView = (value) => value === 'trialGames' ? 'trials' : value;
  const [view, setView] = useState(() => normalizeView(initialView));
  const [games, setGames] = useState([]);
  const [assets, setAssets] = useState([]);
  const [trialGameIds, setTrialGameIds] = useState([]);
  const [savedTrialGameIds, setSavedTrialGameIds] = useState([]);
  const [selectedGameId, setSelectedGameId] = useState('');
  const [content, setContent] = useState(emptyContent);
  const [questionDraft, setQuestionDraft] = useState(questionText(emptyContent()));
  const [newGameId, setNewGameId] = useState('');
  const [newGameTemplate, setNewGameTemplate] = useState('multiple-choice');
  const [newGameTitle, setNewGameTitle] = useState('');
  const [newGameDescription, setNewGameDescription] = useState('');
  const [uploadName, setUploadName] = useState('');
  const [uploadAltText, setUploadAltText] = useState('');
  const [uploadCategory, setUploadCategory] = useState('');
  const [uploadTags, setUploadTags] = useState('');
  const [uploadKind, setUploadKind] = useState('image');
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadPreview, setUploadPreview] = useState('');
  const [assetSearch, setAssetSearch] = useState('');
  const [assetKindFilter, setAssetKindFilter] = useState('all');
  const [assetCategoryFilter, setAssetCategoryFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const selectedGame = games.find((game) => game.gameId === selectedGameId);

  const assetsOfKind = (kind, selectedId) => assets.filter((asset) => asset.kind === kind
    && ((asset.active && asset.available !== false) || asset.id === selectedId));
  const assetOptionLabel = (asset) => (
    `${asset.displayName}${asset.active ? '' : ' · غير نشط'}${asset.available === false ? ' · الملف مفقود' : ''}`
  );
  const assetCategories = useMemo(
    () => [...new Set(assets.map((asset) => asset.category).filter(Boolean))].sort(),
    [assets]
  );
  const filteredAssets = useMemo(() => assets.filter((asset) => {
    const query = assetSearch.trim().toLocaleLowerCase();
    const searchable = [asset.displayName, asset.altText, asset.category, ...(asset.tags ?? [])]
      .join(' ')
      .toLocaleLowerCase();
    return (!query || searchable.includes(query))
      && (assetKindFilter === 'all' || asset.kind === assetKindFilter)
      && (assetCategoryFilter === 'all' || asset.category === assetCategoryFilter);
  }), [assets, assetCategoryFilter, assetKindFilter, assetSearch]);

  useEffect(() => {
    if (!uploadFile || uploadKind !== 'image') {
      setUploadPreview('');
      return undefined;
    }
    const preview = URL.createObjectURL(uploadFile);
    setUploadPreview(preview);
    return () => URL.revokeObjectURL(preview);
  }, [uploadFile, uploadKind]);

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [library, media] = await Promise.all([
        apiRequest('/api/v1/admin/games'),
        apiRequest('/api/v1/admin/assets')
      ]);
      setGames(library.games);
      setAssets(media.assets);
      const savedTrials = library.trialGameIds ?? [library.trialGameId].filter(Boolean);
      setTrialGameIds(savedTrials);
      setSavedTrialGameIds(savedTrials);
      setSelectedGameId((current) => library.games.some((game) => game.gameId === current)
        ? current
        : library.games[0]?.gameId ?? '');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    setView(normalizeView(initialView));
  }, [initialView]);

  useEffect(() => {
    if (!selectedGame) return;
    setContent(selectedGame.draftContent);
    setQuestionDraft(questionText(selectedGame.draftContent));
  }, [selectedGameId, selectedGame?.updatedAt]);

  const updateContentField = (field, value) => {
    setContent((current) => ({ ...current, [field]: value }));
  };

  const setAssignment = (event, kind, assetId) => {
    setContent((current) => {
      const remaining = current.assetAssignments.filter((assignment) => (
        assignment.event !== event || assignment.kind !== kind
      ));
      if (assetId) remaining.push({ event, kind, assetId });
      return { ...current, assetAssignments: remaining };
    });
  };

  const setQuestionMedia = (questionIndex, field, value, optionIndex = null) => {
    setContent((current) => ({
      ...current,
      questions: current.questions.map((question, index) => {
        if (index !== questionIndex) return question;
        if (field === 'optionImageAssetIds') {
          const optionImageAssetIds = [...(question.optionImageAssetIds ?? question.options.map(() => null))];
          optionImageAssetIds[optionIndex] = value || null;
          return { ...question, optionImageAssetIds };
        }
        if (field === 'promptImageAssetId' || field === 'promptAudioAssetId') {
          return { ...question, [field]: value || null };
        }
        return { ...question, [field]: value };
      })
    }));
  };

  const setGameTemplate = (template) => {
    setContent((current) => {
      if (template === 'spatial-relationships') {
        return {
          ...current,
          template,
          questions: [],
          spatial: current.spatial ?? createSpatialDraft()
        };
      }
      if (template !== 'picture-matching') return { ...current, template };
      const pairs = current.pairs?.length ? current.pairs : current.questions.map((question, index) => ({
        id: `pair-${index + 1}`,
        label: question.options[question.correctAnswerIndex] ?? `صورة ${index + 1}`,
        imageAssetId: question.promptImageAssetId ?? null
      })).slice(0, 8);
      return { ...current, template, pairs };
    });
  };

  const updatePair = (pairIndex, field, value) => {
    setContent((current) => ({
      ...current,
      pairs: current.pairs.map((pair, index) => index === pairIndex
        ? { ...pair, [field]: value }
        : pair)
    }));
  };

  const addPair = () => {
    setContent((current) => current.pairs.length >= 8 ? current : ({
      ...current,
      pairs: [...current.pairs, {
        id: `pair-${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`,
        label: '',
        imageAssetId: null
      }]
    }));
  };

  const removePair = (pairIndex) => {
    setContent((current) => ({
      ...current,
      pairs: current.pairs.filter((_, index) => index !== pairIndex)
    }));
  };

  const movePair = (pairIndex, direction) => {
    setContent((current) => {
      const targetIndex = pairIndex + direction;
      if (targetIndex < 0 || targetIndex >= current.pairs.length) return current;
      const pairs = [...current.pairs];
      [pairs[pairIndex], pairs[targetIndex]] = [pairs[targetIndex], pairs[pairIndex]];
      return { ...current, pairs };
    });
  };

  const updateQuestionDraft = (value) => {
    setQuestionDraft(value);
    try {
      const parsed = parseQuestionText(value);
      setContent((current) => ({
        ...current,
        questions: parsed.map((question, index) => ({
          ...question,
          promptImageAssetId: current.questions[index]?.promptImageAssetId ?? null,
          promptAudioAssetId: current.questions[index]?.promptAudioAssetId ?? null,
          difficulty: current.questions[index]?.difficulty ?? 'beginner',
          correctFeedback: current.questions[index]?.correctFeedback ?? '',
          incorrectFeedback: current.questions[index]?.incorrectFeedback ?? '',
          optionImageAssetIds: question.options.map((_, optionIndex) => (
            current.questions[index]?.optionImageAssetIds?.[optionIndex] ?? null
          ))
        }))
      }));
    } catch {
      // Keep the last valid question media mappings while the text editor is incomplete.
    }
  };

  const persistDraft = async () => {
    const payload = contentPayload(content, ['picture-matching', 'spatial-relationships'].includes(content.template)
      ? []
      : parseQuestionText(questionDraft));
    const result = await apiRequest(`/api/v1/admin/games/${encodeURIComponent(selectedGameId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: payload })
    });
    setGames((current) => current.map((game) => game.gameId === selectedGameId
      ? { ...game, ...result.game, draftContent: payload }
      : game));
    return payload;
  };

  const saveDraft = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await persistDraft();
      setNotice('تم حفظ المسودة. تظل النسخة المنشورة كما هي حتى تنشر التغييرات.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  const createGame = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const initialPairs = content.pairs?.length ? [...content.pairs] : content.questions.slice(0, 8).map((question, index) => ({
        id: `pair-${index + 1}`,
        label: question.options[question.correctAnswerIndex] ?? `صورة ${index + 1}`,
        imageAssetId: question.promptImageAssetId ?? null
      }));
      while (newGameTemplate === 'picture-matching' && initialPairs.length < 2) {
        initialPairs.push({ id: `pair-${initialPairs.length + 1}`, label: `صورة ${initialPairs.length + 1}`, imageAssetId: null });
      }
      const newContent = {
        ...content,
        template: newGameTemplate,
        title: newGameTitle.trim(),
        description: newGameDescription.trim(),
        ...(newGameTemplate === 'picture-matching' ? { pairs: initialPairs } : {}),
        ...(newGameTemplate === 'spatial-relationships'
          ? { questions: [], spatial: createSpatialDraft() }
          : {})
      };
      const questions = ['picture-matching', 'spatial-relationships'].includes(newGameTemplate)
        ? []
        : questionDraft.trim() ? parseQuestionText(questionDraft) : emptyContent().questions;
      const payload = contentPayload(newContent, questions);
      const result = await apiRequest('/api/v1/admin/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: newGameId.trim(), content: payload })
      });
      setGames((current) => [result.game, ...current]);
      setSelectedGameId(result.game.gameId);
      setNewGameId('');
      setNewGameTitle('');
      setNewGameDescription('');
      setNotice('تم إنشاء اللعبة كمسودة. راجع المحتوى ثم انشرها لإتاحتها.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  const publishGame = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await persistDraft();
      const result = await apiRequest(`/api/v1/admin/games/${encodeURIComponent(selectedGameId)}/publish`, {
        method: 'POST'
      });
      setGames((current) => current.map((game) => game.gameId === selectedGameId ? result.game : game));
      setNotice('تم نشر نسخة جديدة؛ تبقى نتائج النسخ السابقة محفوظة.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  const unpublishGame = async (gameId) => {
    if (!window.confirm('إلغاء نشر هذه اللعبة؟ ستبقى المحاولات والنسخ السابقة محفوظة.')) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await apiRequest(`/api/v1/admin/games/${encodeURIComponent(gameId)}/unpublish`, { method: 'POST' });
      setGames((current) => current.map((game) => game.gameId === gameId ? result.game : game));
      setNotice('تم إلغاء النشر مع الاحتفاظ بتاريخ المحاولات.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleTrialGame = (gameId) => {
    setTrialGameIds((current) => current.includes(gameId)
      ? current.filter((id) => id !== gameId)
      : current.length < 4 ? [...current, gameId] : current);
  };

  const saveTrialGames = async () => {
    if (!canSaveTrialGames) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const { trialGameIds: savedIds } = await apiRequest('/api/v1/admin/games/trials', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameIds: trialGameIds })
      });
      setTrialGameIds(savedIds);
      setSavedTrialGameIds(savedIds);
      setGames((current) => current.map((game) => ({ ...game, isTrial: savedIds.includes(game.gameId) })));
      setNotice('تم تحديث الألعاب التجريبية الأربع للزوار.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  const uploadAsset = async (event) => {
    event.preventDefault();
    if (!uploadFile) return;
    const form = event.currentTarget;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const formData = new FormData();
      formData.set('displayName', uploadName);
      formData.set('kind', uploadKind);
      formData.set('altText', uploadAltText);
      formData.set('category', uploadCategory);
      formData.set('tags', uploadTags);
      formData.set('file', uploadFile);
      const result = await apiRequest('/api/v1/admin/assets', { method: 'POST', body: formData });
      setAssets((current) => [result.asset, ...current]);
      setUploadName('');
      setUploadAltText('');
      setUploadCategory('');
      setUploadTags('');
      setUploadFile(null);
      form.reset();
      setNotice('تم رفع الأصل والتحقق من نوعه. عيّنه إلى الحدث المناسب قبل نشر اللعبة.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  const updateAssetMetadata = async (event, asset) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const updates = {
      displayName: String(values.get('displayName') ?? '').trim(),
      altText: String(values.get('altText') ?? '').trim(),
      category: String(values.get('category') ?? '').trim(),
      tags: [...new Set(String(values.get('tags') ?? '').split(',').map((tag) => tag.trim()).filter(Boolean))]
    };
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await apiRequest(`/api/v1/admin/assets/${asset.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      setAssets((current) => current.map((item) => item.id === asset.id
        ? { ...item, ...result.asset, usage: item.usage }
        : item));
      setNotice('تم حفظ بيانات الأصل والنص البديل.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  const replaceAsset = async (asset, file) => {
    if (!file) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const formData = new FormData();
      formData.set('file', file);
      await apiRequest(`/api/v1/admin/assets/${asset.id}/replace`, {
        method: 'POST',
        body: formData
      });
      await loadData();
      setNotice('تم استبدال الملف وإنشاء أصل جديد. تم تحديث المسودات إلى الأصل الجديد مع الاحتفاظ بمراجع النسخ المنشورة القديمة.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  const replaceFromInput = async (event, asset) => {
    const input = event.currentTarget;
    await replaceAsset(asset, input.files?.[0]);
    input.value = '';
  };

  const changeAssetState = async (asset, active) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await apiRequest(`/api/v1/admin/assets/${asset.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active })
      });
      setAssets((current) => current.map((item) => item.id === asset.id ? result.asset : item));
      setNotice(active ? 'تم تفعيل الأصل.' : 'تم تعطيل الأصل؛ ستستخدم الألعاب النسخة الاحتياطية عند الحاجة.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  const deleteAsset = async (asset) => {
    if (!window.confirm(`حذف الأصل «${asset.displayName}» نهائيًا؟`)) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await apiRequest(`/api/v1/admin/assets/${asset.id}`, { method: 'DELETE' });
      setAssets((current) => current.filter((item) => item.id !== asset.id));
      setNotice('تم حذف الأصل غير المرتبط بأي مسودة أو نسخة منشورة.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  const selectedAssignments = content.assetAssignments ?? [];
  const publishedGames = games.filter((game) => game.status === 'published');
  const trialSelectionChanged = trialGameIds.length !== savedTrialGameIds.length
    || trialGameIds.some((gameId, index) => gameId !== savedTrialGameIds[index]);
  const unavailableTrialIds = trialGameIds.filter((gameId) => (
    !publishedGames.some((game) => game.gameId === gameId)
  ));
  const canSaveTrialGames = trialGameIds.length === 4
    && unavailableTrialIds.length === 0
    && publishedGames.length >= 4;

  return (
    <section className="admin-library" aria-label="مكتبة الألعاب والأصول">
      <nav className="admin-library__tabs" aria-label="أقسام مكتبة الألعاب">
        <button type="button" className={view === 'games' ? 'is-active' : ''} onClick={() => setView('games')}>الألعاب والقوالب</button>
        <button type="button" className={view === 'trials' ? 'is-active' : ''} onClick={() => setView('trials')}>الألعاب التجريبية للزوار</button>
        <button type="button" className={view === 'assets' ? 'is-active' : ''} onClick={() => setView('assets')}>مكتبة الوسائط</button>
      </nav>
      <div className="admin-library__intro">
        <div>
          <span className="dashboard-eyebrow">حرف · المحتوى التعليمي</span>
          <h2>{view === 'games' ? 'مكتبة الألعاب' : view === 'trials' ? 'الألعاب التجريبية للزوار' : 'إدارة الأصول والوسائط'}</h2>
          <p>تغييرات المحتوى لا تعدّل نتائج المحاولات السابقة. تتوفر قوالب الاختيار، والتوصيل المصوّر، والتعرّف على الأصوات، والعلاقات المكانية.</p>
        </div>
        <button type="button" className="button button--small button--outline" disabled={loading || busy} onClick={loadData}>تحديث</button>
      </div>
      {notice && <p className="auth-message" role="status">{notice}</p>}
      {error && <p className="auth-error" role="alert">{error}</p>}
      {loading ? <p className="dashboard-loading" role="status">جارٍ تحميل مكتبة المحتوى…</p> : view === 'games' ? (
        <div className="admin-library__layout">
          <div className="admin-library__game-list">
            <section className="admin-library__panel">
              <h3>الألعاب</h3>
              <div className="admin-library__cards">
                {games.map((game) => (
                  <button
                    type="button"
                    className={`admin-library__game${selectedGameId === game.gameId ? ' is-selected' : ''}`}
                    key={game.gameId}
                    onClick={() => setSelectedGameId(game.gameId)}
                  >
                    <span aria-hidden="true">{game.draftContent.companionAnimal}</span>
                    <span><strong>{game.draftContent.title}</strong><small>{game.gameId} · {game.status === 'published' ? `منشورة v${game.publishedVersion}` : game.status === 'unpublished' ? 'غير منشورة' : 'مسودة'}</small></span>
                    {game.isTrial && <b>تجربة</b>}
                  </button>
                ))}
              </div>
              <form className="admin-library__create" onSubmit={createGame}>
                <label>معرّف لعبة جديدة
                  <input value={newGameId} onChange={(event) => setNewGameId(event.target.value)} required pattern="[a-z0-9-]{1,60}" placeholder="sound-bubbles" />
                </label>
                <label>عنوان اللعبة الجديدة
                  <input value={newGameTitle} maxLength="100" onChange={(event) => setNewGameTitle(event.target.value)} required />
                </label>
                <label>وصف موجز
                  <input value={newGameDescription} maxLength="240" onChange={(event) => setNewGameDescription(event.target.value)} required />
                </label>
                <label>نوع النشاط
                  <select value={newGameTemplate} onChange={(event) => {
                    setNewGameTemplate(event.target.value);
                  }}>
                    <option value="multiple-choice">اختيار من متعدد</option>
                    <option value="matching-pairs">توصيل الكلمات بالصور</option>
                    <option value="picture-matching">توصيل الصور</option>
                    <option value="audio-choice">نشاط استماع</option>
                    <option value="spatial-relationships">العلاقات المكانية</option>
                  </select>
                </label>
                <button className="button button--small button--primary" disabled={busy}>إنشاء مسودة</button>
              </form>
            </section>
          </div>

          {selectedGame && (
            <form className="admin-library__panel admin-library__editor" onSubmit={saveDraft}>
              <div className="admin-library__editor-heading">
                <div>
                  <h3>محتوى اللعبة</h3>
                  <p><code>{selectedGame.gameId}</code> · النسخة المنشورة {selectedGame.publishedVersion || 'لا توجد'}</p>
                </div>
                <label>قالب التفاعل
                  <select value={content.template ?? selectedGame.template ?? 'multiple-choice'}
                    onChange={(event) => setGameTemplate(event.target.value)}>
                    <option value="multiple-choice">اختيار من متعدد</option>
                    <option value="matching-pairs">توصيل الكلمات بالصور</option>
                    <option value="picture-matching">وصّل الصورة بمثيلتها</option>
                    <option value="audio-choice">الاستماع لصوت واختيار الصورة</option>
                    <option value="spatial-relationships">العلاقات المكانية · تحريك العناصر</option>
                  </select>
                </label>
                <span className={`admin-library__status admin-library__status--${selectedGame.status}`}>{selectedGame.status === 'published' ? 'منشورة' : selectedGame.status === 'unpublished' ? 'غير منشورة' : 'مسودة'}</span>
              </div>
              <label>عنوان اللعبة
                <input value={content.title} maxLength="100" required onChange={(event) => updateContentField('title', event.target.value)} />
              </label>
              <label>وصف موجز
                <textarea value={content.description} maxLength="240" rows="2" required onChange={(event) => updateContentField('description', event.target.value)} />
              </label>
              <div className="admin-library__field-row">
                <label>اسم الرفيق
                  <input value={content.companion} maxLength="80" required onChange={(event) => updateContentField('companion', event.target.value)} />
                </label>
                <label>رمز الحيوان
                  <input value={content.companionAnimal} maxLength="12" required onChange={(event) => updateContentField('companionAnimal', event.target.value)} />
                </label>
              </div>
              <label>التعليمات
                <textarea value={content.instructions} maxLength="500" rows="2" required onChange={(event) => updateContentField('instructions', event.target.value)} />
              </label>
              {content.template === 'spatial-relationships' ? (
                <AdminSpatialEditor
                  value={content.spatial ?? createSpatialDraft()}
                  assets={assets}
                  onChange={(spatial) => updateContentField('spatial', spatial)}
                  disabled={busy}
                />
              ) : content.template === 'picture-matching' ? (
                <section className="admin-library__question-media admin-picture-matching" aria-label="أزواج الصور">
                  <div className="admin-picture-matching__heading">
                    <div>
                      <h4>أزواج الصور المتطابقة</h4>
                      <p>اختر صورة واحدة فريدة لكل زوج. ستظهر الصور في مجموعتين بترتيب مختلف، ويطابق الطفل كل صورة بمثيلتها.</p>
                    </div>
                    <label>مستوى الصعوبة
                      <select value={content.difficulty ?? 'beginner'}
                        onChange={(event) => updateContentField('difficulty', event.target.value)}>
                        <option value="beginner">مبتدئ</option>
                        <option value="intermediate">متوسط</option>
                        <option value="advanced">متقدم</option>
                      </select>
                    </label>
                  </div>
                  {content.pairs.map((pair, pairIndex) => {
                    const selectedAsset = assets.find((asset) => asset.id === pair.imageAssetId);
                    return (
                      <fieldset className="admin-picture-matching__pair" key={pair.id}>
                        <legend>الزوج {pairIndex + 1}</legend>
                        <label>اسم الصورة للتعريف فقط
                          <input value={pair.label} maxLength="80" required
                            onChange={(event) => updatePair(pairIndex, 'label', event.target.value)} />
                        </label>
                        <label>اختيار الصورة
                          <select value={pair.imageAssetId ?? ''} required
                            onChange={(event) => updatePair(pairIndex, 'imageAssetId', event.target.value || null)}>
                            <option value="">اختر صورة نشطة من مكتبة الوسائط</option>
                            {assetsOfKind('image', pair.imageAssetId).map((asset) => (
                              <option value={asset.id} key={asset.id}>{assetOptionLabel(asset)}</option>
                            ))}
                          </select>
                        </label>
                        <div className="admin-picture-matching__preview">
                          {selectedAsset?.active && selectedAsset.available !== false
                            ? <AdminAssetPreview asset={selectedAsset} />
                            : <span className="game-image-placeholder" role="img" aria-label="الصورة غير متاحة">▧</span>}
                          <span>{selectedAsset?.displayName ?? 'اختر صورة قبل النشر'}</span>
                        </div>
                        {content.pairs.some((item, index) => index !== pairIndex
                          && item.imageAssetId && item.imageAssetId === pair.imageAssetId) && (
                          <p className="admin-library__question-warning" role="alert">يجب اختيار صورة مختلفة لكل زوج.</p>
                        )}
                        <button type="button" className="button button--small button--outline"
                          disabled={content.pairs.length <= 2} onClick={() => removePair(pairIndex)}>
                          حذف الزوج
                        </button>
                        <div className="admin-picture-matching__order">
                          <button type="button" className="button button--small button--outline"
                            aria-label={`تحريك الزوج ${pairIndex + 1} للأعلى`}
                            disabled={pairIndex === 0} onClick={() => movePair(pairIndex, -1)}>↑</button>
                          <button type="button" className="button button--small button--outline"
                            aria-label={`تحريك الزوج ${pairIndex + 1} للأسفل`}
                            disabled={pairIndex === content.pairs.length - 1} onClick={() => movePair(pairIndex, 1)}>↓</button>
                        </div>
                      </fieldset>
                    );
                  })}
                  <button type="button" className="button button--small button--outline"
                    disabled={content.pairs.length >= 8} onClick={addPair}>
                    إضافة زوج صورة ({content.pairs.length}/٨)
                  </button>
                  <div className="admin-picture-matching__activity-preview" aria-label="معاينة نشاط توصيل الصور">
                    <strong>معاينة النشاط</strong>
                    <div>
                      {[content.pairs, [...content.pairs].reverse()].map((group, groupIndex) => (
                        <section key={groupIndex} aria-label={`معاينة المجموعة ${groupIndex + 1}`}>
                          <span>المجموعة {groupIndex + 1}</span>
                          <div>
                            {group.map((pair, index) => {
                              const asset = assets.find((item) => item.id === pair.imageAssetId);
                              return (
                                <span key={`${groupIndex}-${pair.id}-${index}`}>
                                  {asset?.active && asset.available !== false
                                    ? <AdminAssetPreview asset={asset} />
                                    : <span className="game-image-placeholder" role="img" aria-label="الصورة غير متاحة">▧</span>}
                                  <small>{pair.label || 'اسم الصورة'}</small>
                                </span>
                              );
                            })}
                          </div>
                        </section>
                      ))}
                    </div>
                  </div>
                </section>
              ) : (
                <>
                  <label>الأسئلة والاختيارات
                    <textarea className="admin-library__question-editor" value={questionDraft} rows="8" required onChange={(event) => updateQuestionDraft(event.target.value)} />
                    <small>سطر لكل سؤال: السؤال | خيار ١ | خيار ٢ | رقم الإجابة الصحيحة. يبدأ رقم الإجابة من صفر. حتى ٨ اختيارات و٢٠ سؤالًا.</small>
                  </label>
                  <section className="admin-library__question-media" aria-label="وسائط الأسئلة">
                  <h4>صور وأصوات الأسئلة</h4>
                  <p>اربط كل سؤال بالأصل الصحيح من المكتبة. الأصوات والصور غير المعيّنة لا تُخمنها المنصة.</p>
                  {content.questions.map((question, questionIndex) => (
                    <fieldset key={`${questionIndex}-${question.prompt}`}>
                      <legend>السؤال {questionIndex + 1}: {question.prompt}</legend>
                      {((content.template === 'matching-pairs'
                        && (!question.promptImageAssetId
                          || question.optionImageAssetIds?.length !== question.options.length
                          || question.optionImageAssetIds.some((assetId) => !assetId)))
                        || (content.template === 'audio-choice'
                          && (!question.promptAudioAssetId
                            || question.optionImageAssetIds?.length !== question.options.length
                            || question.optionImageAssetIds.some((assetId) => !assetId)))
                        || [question.promptImageAssetId, question.promptAudioAssetId, ...(question.optionImageAssetIds ?? [])]
                          .filter(Boolean)
                          .some((assetId) => {
                            const asset = assets.find((item) => item.id === assetId);
                            return !asset || !asset.active || asset.available === false;
                          })) && (
                        <div className="admin-library__question-warning" role="status">
                          <span>تحتاج هذه المسودة إلى وسائط مفعّلة ومتاحة قبل النشر. الألعاب المرئية تتطلب صورة لكل اختيار، ولعبة التوصيل تتطلب أيضًا صورة السؤال؛ لعبة الأصوات تتطلب ملفًا صوتيًا للسؤال.</span>
                          <button type="button" className="auth-text-button" onClick={() => setView('assets')}>إدارة الصور والوسائط</button>
                        </div>
                      )}
                      <div className="admin-library__field-row">
                        <label>الصورة الرئيسية (اختياري)
                          <select value={question.promptImageAssetId ?? ''}
                            onChange={(event) => setQuestionMedia(questionIndex, 'promptImageAssetId', event.target.value)}>
                            <option value="">بدون صورة رئيسية</option>
                            {assetsOfKind('image', question.promptImageAssetId).map((asset) => (
                              <option value={asset.id} key={asset.id}>{assetOptionLabel(asset)}</option>
                            ))}
                          </select>
                        </label>
                        <label>تعليمات/صوت السؤال (اختياري)
                          <select value={question.promptAudioAssetId ?? ''}
                            onChange={(event) => setQuestionMedia(questionIndex, 'promptAudioAssetId', event.target.value)}>
                            <option value="">بدون ملف صوتي</option>
                            {assetsOfKind('audio', question.promptAudioAssetId).map((asset) => (
                              <option value={asset.id} key={asset.id}>{assetOptionLabel(asset)}</option>
                            ))}
                          </select>
                        </label>
                        <label>مستوى الصعوبة
                          <select value={question.difficulty ?? 'beginner'}
                            onChange={(event) => setQuestionMedia(questionIndex, 'difficulty', event.target.value)}>
                            <option value="beginner">مبتدئ</option>
                            <option value="intermediate">متوسط</option>
                            <option value="advanced">متقدم</option>
                          </select>
                        </label>
                      </div>
                      <div className="admin-library__option-media">
                        {question.options.map((option, optionIndex) => (
                          <label key={`${questionIndex}-${optionIndex}`}>
                            صورة «{option}»
                            <select value={question.optionImageAssetIds?.[optionIndex] ?? ''}
                              onChange={(event) => setQuestionMedia(
                                questionIndex,
                                'optionImageAssetIds',
                                event.target.value,
                                optionIndex
                              )}>
                              <option value="">اختر صورة</option>
                              {assetsOfKind('image', question.optionImageAssetIds?.[optionIndex]).map((asset) => (
                                <option value={asset.id} key={asset.id}>{assetOptionLabel(asset)}</option>
                              ))}
                            </select>
                          </label>
                        ))}
                      </div>
                      {(question.promptImageAssetId || (question.optionImageAssetIds ?? []).some(Boolean)) && (
                        <div className="admin-library__question-preview" aria-label={`معاينة السؤال ${questionIndex + 1}`}>
                          <strong>معاينة الصور</strong>
                          {[question.promptImageAssetId, ...(question.optionImageAssetIds ?? [])]
                            .filter(Boolean)
                            .map((assetId) => {
                              const asset = assets.find((item) => item.id === assetId);
                              return (
                                <span key={assetId}>
                                  {asset?.active && asset.available !== false
                                    ? <AdminAssetPreview asset={asset} />
                                    : <span className="game-image-placeholder" role="img" aria-label="الصورة غير متاحة">▧</span>}
                                  <small>{asset?.displayName ?? 'أصل غير موجود'}{asset?.active && asset.available !== false ? '' : ' · يحتاج إلى استبدال'}</small>
                                </span>
                              );
                            })}
                        </div>
                      )}
                      <div className="admin-library__field-row">
                        <label>تعزيز عند الإجابة الصحيحة (اختياري)
                          <input value={question.correctFeedback ?? ''} maxLength="180"
                            onChange={(event) => setQuestionMedia(questionIndex, 'correctFeedback', event.target.value)} />
                        </label>
                        <label>تشجيع عند الإجابة غير الصحيحة (اختياري)
                          <input value={question.incorrectFeedback ?? ''} maxLength="180"
                            onChange={(event) => setQuestionMedia(questionIndex, 'incorrectFeedback', event.target.value)} />
                        </label>
                      </div>
                    </fieldset>
                  ))}
                </section>
                </>
              )}
              <div className="admin-library__assignments">
                <h4>أصول الأحداث</h4>
                <p>يمكن تخصيص أصوات الإجابة الصحيحة والخاطئة وخلفية صوتية متكررة. الخلفية تعمل أثناء اللعب فقط، وتتوقف عند التغذية الراجعة أو كتم الصوت.</p>
                {events.map(([eventId, eventLabel]) => (
                  <fieldset key={eventId}>
                    <legend>{eventLabel}</legend>
                    {assetKinds.map(([kind, kindLabel]) => {
                      const assignment = selectedAssignments.find((item) => item.event === eventId && item.kind === kind);
                      const candidates = assetsOfKind(kind, assignment?.assetId);
                      return (
                        <label key={kind}>{kindLabel}
                          <select
                            value={assignment?.assetId ?? ''}
                            onChange={(event) => setAssignment(eventId, kind, event.target.value)}
                          >
                            <option value="">استخدام الأصل الافتراضي</option>
                            {candidates.map((asset) => <option value={asset.id} key={asset.id}>{assetOptionLabel(asset)}</option>)}
                          </select>
                        </label>
                      );
                    })}
                  </fieldset>
                ))}
              </div>
              <div className="admin-library__actions">
                <button type="submit" className="button button--outline" disabled={busy}>حفظ المسودة</button>
                <button type="button" className="button button--primary" disabled={busy} onClick={() => void publishGame()}>
                  {selectedGame.status === 'published' ? 'حفظ ونشر إصدار جديد' : 'حفظ ونشر اللعبة'}
                </button>
                {selectedGame.status === 'published' && !selectedGame.isTrial && (
                  <button type="button" className="button button--outline" disabled={busy} onClick={() => void unpublishGame(selectedGame.gameId)}>إلغاء النشر</button>
                )}
              </div>
            </form>
          )}
        </div>
      ) : view === 'trials' ? (
        <div className="admin-library__trial-page">
          <section className="admin-library__trial-hero">
            <span className="admin-library__trial-hero-icon" aria-hidden="true">☆</span>
            <div>
              <span className="admin-library__trial-eyebrow">إعداد تجربة الزائر</span>
              <h3>اختر أربع ألعاب ليجربها الزوار</h3>
              <p>الألعاب المختارة تظهر في سكشن «الألعاب التجريبية للزوار» بالصفحة الرئيسية. يستطيع الزائر لعبها مباشرة دون حساب، ولا تُحفظ محاولاته ضمن بيانات الأطفال.</p>
            </div>
            <span className={`admin-library__trial-save-state${trialSelectionChanged ? ' is-unsaved' : ''}`} role="status">
              <i aria-hidden="true" />{trialSelectionChanged ? 'تغييرات غير محفوظة' : 'الإعدادات محفوظة'}
            </span>
          </section>

          <section className="admin-library__trial-selection" aria-labelledby="trial-selection-title">
            <div className="admin-library__trial-section-heading">
              <div>
                <span>الخطوة ١</span>
                <h3 id="trial-selection-title">الألعاب المختارة</h3>
                <p>هذا هو ترتيب ظهورها في الصفحة الرئيسية.</p>
              </div>
              <strong className={trialGameIds.length === 4 ? 'is-complete' : ''}>{trialGameIds.length} <span>من ٤</span></strong>
            </div>
            <div className="admin-library__trial-slots">
              {[0, 1, 2, 3].map((slotIndex) => {
                const gameId = trialGameIds[slotIndex];
                const game = gameId ? games.find((item) => item.gameId === gameId) : null;
                return (
                  <article className={`admin-library__trial-slot${game ? ' is-filled' : ''}`} key={slotIndex}>
                    <span className="admin-library__trial-slot-number">{slotIndex + 1}</span>
                    {game ? (
                      <>
                        <span className="admin-library__trial-slot-animal" aria-hidden="true">{(game.publishedContent ?? game.draftContent).companionAnimal}</span>
                        <span className="admin-library__trial-slot-copy">
                          <strong>{(game.publishedContent ?? game.draftContent).title}</strong>
                          <small>{game.status === 'published' ? `منشورة · الإصدار ${game.publishedVersion}` : 'لم تعد منشورة — استبدلها'}</small>
                        </span>
                        <button type="button" aria-label={`إزالة ${(game.publishedContent ?? game.draftContent).title} من الألعاب التجريبية`}
                          disabled={busy} onClick={() => toggleTrialGame(gameId)}>×</button>
                      </>
                    ) : (
                      <span className="admin-library__trial-slot-empty">اختر لعبة من القائمة</span>
                    )}
                  </article>
                );
              })}
            </div>
            {unavailableTrialIds.length > 0 && (
              <p className="admin-library__trial-warning" role="alert">
                يوجد ضمن الاختيار لعبة لم تعد منشورة. أزلها واختر لعبة منشورة بدلًا منها قبل الحفظ.
              </p>
            )}
          </section>

          <section className="admin-library__trial-choices" aria-labelledby="trial-choices-title">
            <div className="admin-library__trial-section-heading">
              <div>
                <span>الخطوة ٢</span>
                <h3 id="trial-choices-title">الألعاب المنشورة المتاحة</h3>
                <p>اختر أربع ألعاب. اضغط على سهم الترتيب لتحريك اللعبة ضمن عرض الصفحة الرئيسية.</p>
              </div>
              <span className="admin-library__trial-available">{publishedGames.length} ألعاب منشورة</span>
            </div>
            {publishedGames.length === 0 ? (
              <div className="admin-library__trial-empty">
                <span aria-hidden="true">✦</span>
                <strong>لا توجد ألعاب منشورة للاختيار</strong>
                <p>انشر الألعاب أولًا من تبويب «الألعاب والقوالب»، ثم عد إلى هنا لاختيار أربع منها.</p>
              </div>
            ) : (
              <div className="admin-library__trial-options">
                {publishedGames.map((game) => {
                  const selectedIndex = trialGameIds.indexOf(game.gameId);
                  const selected = selectedIndex !== -1;
                  return (
                    <article className={`admin-library__trial-game${selected ? ' is-selected' : ''}`} key={game.gameId}>
                      <label>
                        <input type="checkbox" checked={selected}
                          disabled={busy || (!selected && trialGameIds.length >= 4)}
                          onChange={() => toggleTrialGame(game.gameId)} />
                        <span className="admin-library__trial-game-animal" aria-hidden="true">{(game.publishedContent ?? game.draftContent).companionAnimal}</span>
                        <span className="admin-library__trial-game-copy">
                          <strong>{(game.publishedContent ?? game.draftContent).title}</strong>
                          <small>{(game.publishedContent ?? game.draftContent).description}</small>
                          <span>{game.publishedQuestionCount} أسئلة · الإصدار المنشور {game.publishedVersion}</span>
                        </span>
                      </label>
                      {selected && (
                        <div className="admin-library__trial-order">
                          <span>الترتيب {selectedIndex + 1}</span>
                          <button type="button" aria-label={`تحريك ${(game.publishedContent ?? game.draftContent).title} للأعلى`}
                            title="تحريك لأعلى" disabled={busy || selectedIndex === 0}
                            onClick={() => setTrialGameIds((current) => {
                              const next = [...current];
                              [next[selectedIndex - 1], next[selectedIndex]] = [next[selectedIndex], next[selectedIndex - 1]];
                              return next;
                            })}>↑</button>
                          <button type="button" aria-label={`تحريك ${(game.publishedContent ?? game.draftContent).title} للأسفل`}
                            title="تحريك لأسفل" disabled={busy || selectedIndex === trialGameIds.length - 1}
                            onClick={() => setTrialGameIds((current) => {
                              const next = [...current];
                              [next[selectedIndex + 1], next[selectedIndex]] = [next[selectedIndex], next[selectedIndex + 1]];
                              return next;
                            })}>↓</button>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <div className="admin-library__trial-footer">
            <p>{trialGameIds.length === 4
              ? 'أصبحت الألعاب الأربع جاهزة. احفظ التغييرات لنشر الاختيار الجديد للزوار.'
              : `اختر ${4 - trialGameIds.length} ألعاب إضافية لإكمال الاختيار.`}</p>
            <div>
              {trialSelectionChanged && (
                <button type="button" className="button button--outline" disabled={busy}
                  onClick={() => setTrialGameIds(savedTrialGameIds)}>تراجع عن التغييرات</button>
              )}
              <button type="button" className="button button--primary"
                disabled={busy || !trialSelectionChanged || !canSaveTrialGames}
                onClick={() => void saveTrialGames()}>
                {busy ? 'جارٍ الحفظ…' : 'حفظ ونشر الاختيار'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="admin-library__assets">
          <form className="admin-library__panel admin-library__upload" onSubmit={uploadAsset}>
            <h3>رفع أصل معتمد</h3>
            <label>اسم الأصل
              <input value={uploadName} maxLength="100" required onChange={(event) => setUploadName(event.target.value)} />
            </label>
            <label>نوع الأصل
              <select value={uploadKind} onChange={(event) => setUploadKind(event.target.value)}>
                <option value="image">صورة ثابتة (PNG، JPEG، WebP) — حتى 5 MB</option>
                <option value="audio">صوت (MP3، WAV، OGG) — حتى 10 MB</option>
                <option value="animation">رسوم متحركة (GIF أو Lottie JSON آمن) — حتى 3 MB</option>
                <option value="video">فيديو (MP4) — حتى 20 MB</option>
              </select>
            </label>
            {uploadKind === 'image' && (
              <>
                <label>النص البديل للصورة
                  <input value={uploadAltText} maxLength="200" onChange={(event) => setUploadAltText(event.target.value)} />
                </label>
                <label>التصنيف
                  <input value={uploadCategory} maxLength="40" placeholder="حيوانات، أشياء..." onChange={(event) => setUploadCategory(event.target.value)} />
                </label>
                <label>وسوم مفصولة بفواصل
                  <input value={uploadTags} maxLength="500" placeholder="قطة، حيوانات، صوت ق" onChange={(event) => setUploadTags(event.target.value)} />
                </label>
              </>
            )}
            <label>الملف
              <input
                type="file"
                required
                accept={uploadKind === 'image' ? 'image/png,image/jpeg,image/webp' : uploadKind === 'audio' ? 'audio/mpeg,audio/wav,audio/ogg' : uploadKind === 'video' ? 'video/mp4,.mp4' : 'image/gif,application/json,.json'}
                onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)}
              />
            </label>
            {uploadPreview && (
              <div className="admin-library__upload-preview">
                <strong>معاينة قبل الرفع</strong>
                <img src={uploadPreview} alt={uploadAltText || 'معاينة الصورة المختارة'} />
              </div>
            )}
            <button type="submit" className="button button--primary" disabled={busy || !uploadFile}>رفع وفحص الملف</button>
            <small>يُفحص المحتوى الفعلي للملف، ولا يُعتمد امتداد الاسم أو نوع MIME المرسل من المتصفح.</small>
          </form>
          <section className="admin-library__panel">
            <h3>الأصول المحفوظة ({filteredAssets.length} من {assets.length})</h3>
            <div className="admin-library__asset-filters">
              <label>بحث بالاسم أو الوصف أو الوسوم
                <input value={assetSearch} onChange={(event) => setAssetSearch(event.target.value)} />
              </label>
              <label>النوع
                <select value={assetKindFilter} onChange={(event) => setAssetKindFilter(event.target.value)}>
                  <option value="all">جميع الأنواع</option>
                  {assetKinds.map(([kind, label]) => <option value={kind} key={kind}>{label}</option>)}
                </select>
              </label>
              <label>التصنيف
                <select value={assetCategoryFilter} onChange={(event) => setAssetCategoryFilter(event.target.value)}>
                  <option value="all">كل التصنيفات</option>
                  {assetCategories.map((category) => <option value={category} key={category}>{category}</option>)}
                </select>
              </label>
            </div>
            {assets.length === 0 ? <p className="dashboard-empty-state">لا توجد أصول بعد. ارفع صورة أو صوتًا أو رسومًا معتمدة لاستخدامها في أحداث اللعبة.</p> : (
              <div className="admin-library__asset-list">
                {filteredAssets.map((asset) => (
                  <article className={`admin-library__asset${asset.active ? '' : ' is-inactive'}`} key={asset.id}>
                    <div className="admin-library__asset-preview">
                      <AdminAssetPreview key={`${asset.id}:${asset.available}`} asset={asset} />
                    </div>
                    <div className="admin-library__asset-meta">
                      <strong>{asset.displayName}</strong>
                      <span>{asset.kind} · {asset.mimeType} · {formatBytes(asset.sizeBytes)}{asset.width ? ` · ${asset.width}×${asset.height}` : ''}</span>
                      {asset.altText && <span>النص البديل: {asset.altText}</span>}
                      {(asset.category || asset.tags?.length > 0) && <span>{[asset.category, ...(asset.tags ?? [])].filter(Boolean).join(' · ')}</span>}
                      <span>{asset.active ? 'نشط' : 'غير نشط'}{asset.available === false ? ' · الملف مفقود' : ''}</span>
                      {asset.usage?.length > 0 && <span>مستخدم في {asset.usage.length} موضعًا</span>}
                    </div>
                    <div className="admin-library__asset-actions">
                      <label className="admin-library__replace">
                        استبدال الملف
                        <input type="file" accept={asset.kind === 'image' ? 'image/png,image/jpeg,image/webp' : asset.kind === 'audio' ? 'audio/mpeg,audio/wav,audio/ogg' : asset.kind === 'video' ? 'video/mp4,.mp4' : 'image/gif,application/json,.json'}
                          disabled={busy} onChange={(event) => void replaceFromInput(event, asset)} />
                      </label>
                      <button type="button" className="button button--small button--outline" disabled={busy} onClick={() => void changeAssetState(asset, !asset.active)}>
                        {asset.active ? 'تعطيل' : 'تفعيل'}
                      </button>
                      <button type="button" className="auth-text-button" disabled={busy} onClick={() => void deleteAsset(asset)}>حذف</button>
                    </div>
                    <details className="admin-library__asset-details">
                      <summary>تعديل البيانات ومعرفة الاستخدام</summary>
                      <form onSubmit={(event) => void updateAssetMetadata(event, asset)}>
                        <label>اسم الأصل
                          <input name="displayName" maxLength="100" required defaultValue={asset.displayName} />
                        </label>
                        {asset.kind === 'image' && <label>النص البديل
                          <input name="altText" maxLength="200" defaultValue={asset.altText ?? ''} />
                        </label>}
                        <label>التصنيف
                          <input name="category" maxLength="40" defaultValue={asset.category ?? ''} />
                        </label>
                        <label>الوسوم، مفصولة بفواصل
                          <input name="tags" maxLength="500" defaultValue={(asset.tags ?? []).join(', ')} />
                        </label>
                        <button type="submit" className="button button--small button--outline" disabled={busy}>حفظ البيانات</button>
                      </form>
                      {asset.usage?.length ? (
                        <ul>
                          {asset.usage.map((usage, index) => (
                            <li key={`${usage.gameId}:${usage.source}:${usage.version}:${usage.location}:${index}`}>
                              {usage.title} · {usage.source}{usage.version ? ` v${usage.version}` : ''} · {usage.location}
                            </li>
                          ))}
                        </ul>
                      ) : <p>لا توجد مراجع في مسودات الألعاب أو نسخها المنشورة.</p>}
                    </details>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
      <footer className="admin-library__footer">
        <span>مسجل الدخول بصفتك {user.email}</span>
        <span>الصيغ المرفوعة لا تنفذ ككود. الملفات غير النشطة أو غير الموجودة تستبدلها عناصر اللعبة الافتراضية.</span>
        <div>
          <button type="button" className="auth-text-button" onClick={onReauthenticate}>تسجيل الدخول مجددًا</button>
          <button type="button" className="auth-text-button" onClick={onSignOut}>تسجيل الخروج</button>
        </div>
      </footer>
    </section>
  );
}

export default AdminGameLibrary;

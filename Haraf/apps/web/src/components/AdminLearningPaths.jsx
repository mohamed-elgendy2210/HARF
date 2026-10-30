import { useEffect, useState } from 'react';
import { apiRequest } from '../lib/api.js';

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

export default function AdminLearningPaths() {
  const [tab, setTab] = useState('paths');
  const [paths, setPaths] = useState([]);
  const [availableGames, setAvailableGames] = useState([]);
  const [editingPath, setEditingPath] = useState(null);
  const [questionnaire, setQuestionnaire] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [pathData, questionnaireData, assignmentData] = await Promise.all([
        apiRequest('/api/v1/admin/learning-paths'),
        apiRequest('/api/v1/admin/learning-questionnaire'),
        apiRequest('/api/v1/admin/learning-assignments')
      ]);
      setPaths(pathData.paths);
      setAvailableGames(pathData.availableGames);
      setQuestionnaire(questionnaireData.questionnaire);
      setAssignments(assignmentData.assignments);
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
      ...editingPath,
      activities: editingPath.activities.map(({ available: _available, ...activity }) => activity)
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

  return (
    <section className="admin-dashboard__content admin-dashboard-panel">
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
        <button type="button" aria-selected={tab === 'questionnaire'} onClick={() => setTab('questionnaire')}>استبيان وليّ الأمر</button>
        <button type="button" aria-selected={tab === 'assignments'} onClick={() => setTab('assignments')}>تعيينات الأطفال</button>
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
                  <span aria-hidden="true">ح</span>
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
    </section>
  );
}

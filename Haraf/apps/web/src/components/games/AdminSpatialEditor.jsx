import { useEffect, useRef, useState } from 'react';
import SpatialScene, { initialSpatialPositions } from './SpatialScene.jsx';

const relations = [
  ['inside', 'داخل'],
  ['outside', 'خارج'],
  ['above', 'فوق'],
  ['below', 'تحت'],
  ['front', 'أمام'],
  ['behind', 'خلف'],
  ['next-to', 'بجانب'],
  ['between', 'بين']
];

const ids = (prefix) => `${prefix}-${crypto.randomUUID().replaceAll('-', '').slice(0, 10)}`;

export function createSpatialDraft() {
  const first = ids('step');
  return {
    level: 1,
    difficulty: 'beginner',
    scene: {
      backgroundAssetId: null,
      aspectRatio: 1.6,
      objects: [
        { id: 'ball', label: 'الكرة', assetId: null, movable: true, x: 100, y: 390, width: 140, height: 140, layer: 2 },
        { id: 'box', label: 'الصندوق', assetId: null, movable: false, x: 660, y: 330, width: 230, height: 290, layer: 1 }
      ]
    },
    steps: [{
      id: first,
      instruction: 'ضع الكرة داخل الصندوق.',
      instructionAudioAssetId: null,
      movableObjectId: 'ball',
      relationship: 'inside',
      targetObjectId: 'box',
      secondTargetObjectId: null,
      targetRegion: { x: 715, y: 435, width: 120, height: 110 },
      tolerance: 20
    }],
    assistance: { enabled: true, visualHintAfter: 3, demonstrationAfter: 5 }
  };
}

function MediaSelect({ label, assets, kind, value, onChange, required = false }) {
  const options = assets.filter((asset) => asset.kind === kind
    && asset.active && asset.available !== false);
  return (
    <label>{label}
      <select value={value ?? ''} required={required} onChange={(event) => onChange(event.target.value || null)}>
        <option value="">بدون اختيار</option>
        {options.map((asset) => <option key={asset.id} value={asset.id}>{asset.displayName}</option>)}
      </select>
    </label>
  );
}

export default function AdminSpatialEditor({ value, assets, onChange, disabled = false }) {
  const [selectedId, setSelectedId] = useState(value.scene.objects.find(({ movable }) => movable)?.id ?? '');
  const [previewPositions, setPreviewPositions] = useState(() => initialSpatialPositions(value));
  const [previewMode, setPreviewMode] = useState(false);
  const sceneRef = useRef(null);
  const dragRef = useRef(null);
  useEffect(() => {
    setPreviewPositions(initialSpatialPositions(value));
  }, [value.scene.objects]);
  const currentStep = value.steps[0];
  const movableObjects = value.scene.objects.filter(({ movable }) => movable);
  const staticObjects = value.scene.objects.filter(({ movable }) => !movable);
  const images = assets.filter((asset) => asset.kind === 'image' && asset.active && asset.available !== false);
  const update = (patch) => onChange({ ...value, ...patch });

  const updateObject = (index, key, nextValue) => {
    const objects = value.scene.objects.map((item, current) => current === index
      ? { ...item, [key]: ['x', 'y', 'width', 'height', 'layer'].includes(key) ? Number(nextValue) : nextValue }
      : item);
    update({ scene: { ...value.scene, objects } });
  };

  const addObject = (movable = false) => {
    const next = {
      id: ids('object'),
      label: movable ? 'عنصر جديد' : 'عنصر ثابت',
      assetId: null,
      movable,
      x: movable ? 80 : 520,
      y: movable ? 100 : 480,
      width: 140,
      height: 140,
      layer: movable ? 2 : 1
    };
    update({ scene: { ...value.scene, objects: [...value.scene.objects, next] } });
    if (movable) setSelectedId(next.id);
  };

  const removeObject = (id) => {
    if (value.steps.some((step) => step.movableObjectId === id
      || step.targetObjectId === id || step.secondTargetObjectId === id)) return;
    update({ scene: { ...value.scene, objects: value.scene.objects.filter((item) => item.id !== id) } });
  };

  const addStep = () => {
    if (value.steps.length >= 20 || movableObjects.length === 0 || staticObjects.length === 0) return;
    const movable = movableObjects[0];
    const target = staticObjects[0];
    update({
      steps: [...value.steps, {
        id: ids('step'),
        instruction: `ضع ${movable.label} بجانب ${target.label}.`,
        instructionAudioAssetId: null,
        movableObjectId: movable.id,
        relationship: 'next-to',
        targetObjectId: target.id,
        secondTargetObjectId: null,
        targetRegion: { x: 400, y: 500, width: 150, height: 170 },
        tolerance: 60
      }]
    });
  };

  const updateStep = (index, key, nextValue) => {
    const steps = value.steps.map((item, current) => current === index
      ? { ...item, [key]: key === 'tolerance' ? Number(nextValue) : nextValue }
      : item);
    update({ steps });
  };

  const updateRegion = (index, key, nextValue) => {
    const steps = value.steps.map((item, current) => current === index
      ? { ...item, targetRegion: { ...item.targetRegion, [key]: Number(nextValue) } }
      : item);
    update({ steps });
  };

  const moveStep = (index, offset) => {
    const target = index + offset;
    if (target < 0 || target >= value.steps.length) return;
    const steps = [...value.steps];
    [steps[index], steps[target]] = [steps[target], steps[index]];
    update({ steps });
  };

  const pointerToScene = (event) => {
    const rect = sceneRef.current?.getBoundingClientRect();
    if (!rect?.width || !rect?.height) return null;
    return {
      x: (event.clientX - rect.left) / rect.width * 1000,
      y: (event.clientY - rect.top) / rect.height * 1000
    };
  };

  const handlePointerDown = (event, item) => {
    if (disabled) return;
    event.preventDefault();
    const point = pointerToScene(event);
    if (!point) return;
    const position = previewMode ? previewPositions[item.id] ?? item : item;
    dragRef.current = {
      id: item.id,
      pointerId: event.pointerId,
      offsetX: point.x - position.x,
      offsetY: point.y - position.y
    };
    setSelectedId(item.id);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const point = pointerToScene(event);
    if (!point) return;
    const object = value.scene.objects.find(({ id }) => id === drag.id);
    const nextPosition = {
      x: Math.max(0, Math.min(1000 - object.width, point.x - drag.offsetX)),
      y: Math.max(0, Math.min(1000 - object.height, point.y - drag.offsetY))
    };
    if (previewMode) {
      setPreviewPositions((current) => ({ ...current, [drag.id]: nextPosition }));
      return;
    }
    update({
      scene: {
        ...value.scene,
        objects: value.scene.objects.map((item) => item.id === drag.id ? { ...item, ...nextPosition } : item)
      }
    });
  };

  const handlePointerUp = (event) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };

  const displaySpatial = {
    ...value,
    scene: {
      ...value.scene,
      backgroundUrl: value.scene.backgroundAssetId
        ? `/api/v1/admin/assets/${value.scene.backgroundAssetId}/preview`
        : null,
      objects: value.scene.objects.map((item) => ({
        ...item,
        imageUrl: item.assetId ? `/api/v1/admin/assets/${item.assetId}/preview` : null,
        altText: item.label
      }))
    }
  };

  return (
    <section className="admin-spatial-editor" aria-label="محرر مشهد العلاقات المكانية">
      <div className="admin-spatial-editor__toolbar">
        <div><h4>محرر المشهد المكاني</h4><p>اسحب العناصر مباشرة داخل المشهد، واضبط الأبعاد والعلاقة المستهدفة.</p></div>
        <button type="button" className="button button--small button--outline"
          aria-pressed={previewMode} onClick={() => setPreviewMode((current) => !current)}>
          {previewMode ? 'تحرير المشهد' : 'معاينة المشهد'}
        </button>
      </div>
      <div className="admin-spatial-editor__settings">
        <label>المستوى
          <select value={value.level} onChange={(event) => update({ level: Number(event.target.value) })}>
            {[1, 2, 3, 4, 5].map((level) => <option key={level} value={level}>المستوى {level}</option>)}
          </select>
        </label>
        <label>الصعوبة
          <select value={value.difficulty} onChange={(event) => update({ difficulty: event.target.value })}>
            <option value="beginner">مبتدئ</option><option value="intermediate">متوسط</option><option value="advanced">متقدم</option>
          </select>
        </label>
        <label>نسبة أبعاد المشهد
          <input type="number" min="0.5" max="2.5" step="0.1" value={value.scene.aspectRatio}
            onChange={(event) => update({ scene: { ...value.scene, aspectRatio: Number(event.target.value) } })} />
        </label>
        <MediaSelect label="خلفية المشهد" assets={assets} kind="image" value={value.scene.backgroundAssetId}
          onChange={(backgroundAssetId) => update({ scene: { ...value.scene, backgroundAssetId } })} />
      </div>
      <div className="admin-spatial-editor__scene-wrap">
        <div ref={sceneRef}>
          <SpatialScene
            spatial={displaySpatial}
            positions={previewMode ? previewPositions : null}
            activeObjectId={{ objectId: selectedId, stepIndex: 0 }}
            selectedObjectId={selectedId}
            targetRegion={currentStep?.targetRegion}
            showTarget={!previewMode}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onObjectClick={(_event, item) => setSelectedId(item.id)}
            onSceneClick={() => {}}
          />
        </div>
      </div>
      {!images.length && <p className="admin-library__question-warning" role="alert">ارفع صورًا نشطة إلى مكتبة الوسائط أولًا لإضافتها إلى المشهد.</p>}
      <div className="admin-spatial-editor__objects">
        <h5>عناصر المشهد ({value.scene.objects.length}/٢٠)</h5>
        {value.scene.objects.map((item, index) => (
          <fieldset key={item.id}>
            <legend>{item.movable ? 'عنصر قابل للتحريك' : 'عنصر مرجعي ثابت'}</legend>
            <div className="admin-library__field-row">
              <label>الاسم
                <input value={item.label} maxLength="80" onChange={(event) => updateObject(index, 'label', event.target.value)} />
              </label>
              <MediaSelect label="الصورة" assets={assets} kind="image" value={item.assetId} required
                onChange={(assetId) => updateObject(index, 'assetId', assetId)} />
            </div>
            <label className="admin-spatial-editor__check">
              <input type="checkbox" checked={item.movable}
                onChange={(event) => updateObject(index, 'movable', event.target.checked)} />
              يمكن للطفل تحريكه
            </label>
            <div className="admin-spatial-editor__numbers">
              {[
                ['x', 'الموضع الأفقي'], ['y', 'الموضع الرأسي'],
                ['width', 'العرض'], ['height', 'الارتفاع'], ['layer', 'الطبقة']
              ].map(([key, label]) => (
                <label key={key}>{label}
                  <input type="number" min={key === 'layer' ? 0 : key === 'width' || key === 'height' ? 20 : 0}
                    max={key === 'layer' ? 20 : 1000} value={item[key]}
                    onChange={(event) => updateObject(index, key, event.target.value)} />
                </label>
              ))}
            </div>
            <button type="button" className="button button--small button--outline"
              disabled={value.scene.objects.length <= 2 || value.steps.some((step) => step.movableObjectId === item.id
                || step.targetObjectId === item.id || step.secondTargetObjectId === item.id)}
              onClick={() => removeObject(item.id)}>حذف العنصر</button>
          </fieldset>
        ))}
        <div className="admin-spatial-editor__actions">
          <button type="button" className="button button--small button--outline"
            disabled={value.scene.objects.length >= 20 || !images.length} onClick={() => addObject(true)}>إضافة عنصر متحرك</button>
          <button type="button" className="button button--small button--outline"
            disabled={value.scene.objects.length >= 20 || !images.length} onClick={() => addObject(false)}>إضافة عنصر مرجعي</button>
        </div>
      </div>
      <div className="admin-spatial-editor__steps">
        <div className="admin-spatial-editor__toolbar"><h5>تعليمات النشاط ({value.steps.length}/٢٠)</h5>
          <button type="button" className="button button--small button--outline"
            disabled={value.steps.length >= 20 || movableObjects.length === 0 || staticObjects.length === 0}
            onClick={addStep}>إضافة خطوة</button></div>
        {value.steps.map((step, index) => (
          <fieldset key={step.id}>
            <legend>الخطوة {index + 1}</legend>
            <label>التعليمة العربية
              <textarea value={step.instruction} maxLength="240" rows="2"
                onChange={(event) => updateStep(index, 'instruction', event.target.value)} />
            </label>
            <div className="admin-library__field-row">
              <label>العنصر المتحرك
                <select value={step.movableObjectId} onChange={(event) => updateStep(index, 'movableObjectId', event.target.value)}>
                  {movableObjects.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              </label>
              <label>العلاقة المكانية
                <select value={step.relationship} onChange={(event) => updateStep(index, 'relationship', event.target.value)}>
                  {relations.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </select>
              </label>
            </div>
            <div className="admin-library__field-row">
              <label>العنصر المرجعي
                <select value={step.targetObjectId ?? ''} onChange={(event) => updateStep(index, 'targetObjectId', event.target.value || null)}>
                  {staticObjects.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              </label>
              {step.relationship === 'between' && <label>العنصر المرجعي الثاني
                <select value={step.secondTargetObjectId ?? ''} onChange={(event) => updateStep(index, 'secondTargetObjectId', event.target.value || null)}>
                  <option value="">اختر عنصرًا ثانيًا</option>
                  {staticObjects.filter(({ id }) => id !== step.targetObjectId)
                    .map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              </label>}
              <MediaSelect label="تسجيل صوتي (اختياري)" assets={assets} kind="audio" value={step.instructionAudioAssetId}
                onChange={(audioId) => updateStep(index, 'instructionAudioAssetId', audioId)} />
            </div>
            <div className="admin-spatial-editor__numbers">
              {Object.entries({ x: 'منطقة الهدف أفقيًا', y: 'منطقة الهدف رأسيًا', width: 'عرض المنطقة', height: 'ارتفاع المنطقة' })
                .map(([key, label]) => (
                  <label key={key}>{label}
                    <input type="number" min="0" max="1000" value={step.targetRegion[key]}
                      onChange={(event) => updateRegion(index, key, event.target.value)} />
                  </label>
                ))}
              <label>التسامح
                <input type="number" min="0" max="250" value={step.tolerance}
                  onChange={(event) => updateStep(index, 'tolerance', event.target.value)} />
              </label>
            </div>
            <div className="admin-spatial-editor__actions">
              <button type="button" className="button button--small button--outline"
                disabled={index === 0} onClick={() => moveStep(index, -1)}>تحريك لأعلى</button>
              <button type="button" className="button button--small button--outline"
                disabled={index === value.steps.length - 1} onClick={() => moveStep(index, 1)}>تحريك لأسفل</button>
              <button type="button" className="button button--small button--outline"
                disabled={value.steps.length <= 1} onClick={() => update({ steps: value.steps.filter((_, current) => current !== index) })}>حذف الخطوة</button>
            </div>
          </fieldset>
        ))}
      </div>
      <fieldset className="admin-spatial-editor__assistance">
        <legend>المساعدة المتدرجة</legend>
        <label className="admin-spatial-editor__check">
          <input type="checkbox" checked={value.assistance.enabled}
            onChange={(event) => update({ assistance: { ...value.assistance, enabled: event.target.checked } })} />
          تفعيل التلميحات التدريجية
        </label>
        <div className="admin-library__field-row">
          <label>إظهار المنطقة بعد عدد المحاولات غير الصحيحة
            <input type="number" min="1" max="10" value={value.assistance.visualHintAfter}
              onChange={(event) => update({ assistance: { ...value.assistance, visualHintAfter: Number(event.target.value) } })} />
          </label>
          <label>إظهار المثال بعد عدد المحاولات غير الصحيحة
            <input type="number" min="2" max="15" value={value.assistance.demonstrationAfter}
              onChange={(event) => update({ assistance: { ...value.assistance, demonstrationAfter: Number(event.target.value) } })} />
          </label>
        </div>
      </fieldset>
      <p className="admin-spatial-editor__coordinates">إحداثيات المشهد نسبية من ٠ إلى ١٠٠٠؛ تظل الأبعاد ومناطق الإجابة متناسبة عند تغيير حجم الشاشة.</p>
    </section>
  );
}

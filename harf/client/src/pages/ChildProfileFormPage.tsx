import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ApiRequestError,
  childrenApi,
  type ChildProfile,
  getApiErrorMessage,
} from "../api/client";
import { BrandMark } from "../components/AuthLayout";
import { FormField } from "../components/FormField";

function shiftUtcMonths(date: Date, months: number): Date {
  const target = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1),
  );
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();

  return new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(date.getUTCDate(), lastDay)),
  );
}

function dateInputBounds() {
  const now = new Date();
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const youngest = shiftUtcMonths(today, -18);
  const oldestExclusive = shiftUtcMonths(today, -72);
  const oldestAllowed = new Date(oldestExclusive);
  oldestAllowed.setUTCDate(oldestAllowed.getUTCDate() + 1);

  return {
    min: oldestAllowed.toISOString().slice(0, 10),
    max: youngest.toISOString().slice(0, 10),
  };
}

function isDateInAgeRange(value: string): boolean {
  const bounds = dateInputBounds();
  return value >= bounds.min && value <= bounds.max;
}

function childRequestError(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 401) {
      return "انتهت جلسة الدخول. سجّل الدخول مجددًا للمتابعة.";
    }
    if (error.status === 404) {
      return "لم نتمكن من العثور على ملف الطفل.";
    }
    if (error.status === 400) {
      return "تحقّق من الاسم وتاريخ الميلاد. العمر المقبول من 18 شهرًا إلى أقل من 6 سنوات.";
    }
  }
  return getApiErrorMessage(error);
}

export function ChildProfileFormPage() {
  const { id } = useParams();
  const isEditing = Boolean(id);
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;

    let cancelled = false;
    setLoading(true);
    setLoadError("");
    void childrenApi
      .get(id)
      .then(({ child }: { child: ChildProfile }) => {
        if (cancelled) return;
        setName(child.name);
        setDateOfBirth(child.dateOfBirth);
      })
      .catch((requestError: unknown) => {
        if (!cancelled) setLoadError(childRequestError(requestError));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const normalizedName = name.trim();
    if (!normalizedName || normalizedName.length > 100) {
      setError("أدخل اسمًا صحيحًا لا يتجاوز 100 حرف.");
      return;
    }
    if (!isDateInAgeRange(dateOfBirth)) {
      setError("يجب أن يكون عمر الطفل من 18 شهرًا إلى أقل من 6 سنوات.");
      return;
    }

    setSaving(true);
    try {
      if (id) {
        await childrenApi.update(id, {
          name: normalizedName,
          dateOfBirth,
        });
      } else {
        await childrenApi.create({
          name: normalizedName,
          dateOfBirth,
        });
      }
      navigate("/dashboard", { replace: true });
    } catch (requestError) {
      setError(childRequestError(requestError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="dashboard-page" dir="rtl">
      <header className="dashboard-header">
        <Link className="dashboard-brand" to="/dashboard">
          <BrandMark small />
          <span>حَرْف</span>
        </Link>
        <Link className="button button-quiet" to="/dashboard">
          العودة إلى المساحة
        </Link>
      </header>

      <section className="child-form-panel">
        <p className="eyebrow">مساحة العائلة</p>
        <h1>{isEditing ? "تعديل ملف الطفل" : "إضافة طفل"}</h1>
        <p className="child-form-intro">
          أدخل المعلومات الأساسية فقط. يمكنك تعديلها لاحقًا.
        </p>

        {loading ? (
          <div className="child-form-status" role="status">
            جارٍ تحميل الملف…
          </div>
        ) : loadError ? (
          <div className="child-form-status">
            <p className="form-message error-message" role="alert">
              {loadError}
            </p>
            <Link className="button button-primary" to="/dashboard">
              العودة إلى لوحة وليّ الأمر
            </Link>
          </div>
        ) : (
          <form className="child-form" onSubmit={handleSubmit}>
            <FormField
              label="اسم الطفل"
              name="name"
              type="text"
              autoComplete="off"
              maxLength={100}
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="اسم الطفل"
            />
            <FormField
              label="تاريخ الميلاد"
              name="dateOfBirth"
              type="date"
              required
              min={dateInputBounds().min}
              max={dateInputBounds().max}
              value={dateOfBirth}
              onChange={(event) => setDateOfBirth(event.target.value)}
              hint="العمر المقبول من 18 شهرًا إلى أقل من 6 سنوات."
            />
            <p className="child-privacy-note">
              نطلب الاسم وتاريخ الميلاد فقط لإدارة ملف الطفل. لا تضف معلومات
              صحية أو تفاصيل خاصة أخرى.
            </p>
            {error && (
              <p className="form-message error-message" role="alert">
                {error}
              </p>
            )}
            <div className="child-form-actions">
              <button
                className="button button-primary"
                type="submit"
                disabled={saving}
              >
                {saving
                  ? "جارٍ الحفظ…"
                  : isEditing
                    ? "حفظ التعديلات"
                    : "إضافة إلى مساحة العائلة"}
              </button>
              <Link className="button button-secondary" to="/dashboard">
                إلغاء
              </Link>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}

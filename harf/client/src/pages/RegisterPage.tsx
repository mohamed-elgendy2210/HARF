import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getApiErrorMessage } from "../api/client";
import { FormField } from "../components/FormField";
import { useAuth } from "../auth/AuthProvider";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    const normalizedEmail = email.trim().toLowerCase();
    const passwordBytes = new TextEncoder().encode(password).length;
    if (!name.trim() || name.trim().length > 100) {
      setError("أدخل اسمًا صحيحًا لا يتجاوز 100 حرف.");
      return;
    }
    if (!emailPattern.test(normalizedEmail) || normalizedEmail.length > 254) {
      setError("أدخل بريدًا إلكترونيًا صحيحًا.");
      return;
    }
    if (password.length < 12 || passwordBytes > 72) {
      setError("يجب أن تتكون كلمة المرور من 12 حرفًا على الأقل، وألا تتجاوز 72 بايتًا.");
      return;
    }
    if (password !== confirmation) {
      setError("كلمتا المرور غير متطابقتين.");
      return;
    }
    if (!consent) {
      setError("يرجى تأكيد اطلاعك على تنبيه الخصوصية للمتابعة.");
      return;
    }

    setBusy(true);
    try {
      await register({ name: name.trim(), email: normalizedEmail, password });
      setSuccess("تم إنشاء حساب وليّ الأمر. يمكنك تسجيل الدخول الآن.");
      window.setTimeout(() => navigate("/login", { replace: true }), 900);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-card register-card">
      <p className="eyebrow">بداية رحلتكم</p>
      <h2>إنشاء حساب وليّ أمر</h2>
      <p className="card-description">أنشئ حسابك لتبدأ مساحة عائلتك في حَرْف.</p>
      <form onSubmit={handleSubmit} className="auth-form">
        <FormField
          label="اسم وليّ الأمر"
          name="name"
          type="text"
          autoComplete="name"
          placeholder="الاسم الكامل"
          maxLength={100}
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <FormField
          label="البريد الإلكتروني"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          dir="ltr"
          placeholder="name@example.com"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <FormField
          label="كلمة المرور"
          name="password"
          type="password"
          autoComplete="new-password"
          placeholder="12 حرفًا على الأقل"
          minLength={12}
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <FormField
          label="تأكيد كلمة المرور"
          name="passwordConfirmation"
          type="password"
          autoComplete="new-password"
          placeholder="أعد كتابة كلمة المرور"
          minLength={12}
          required
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
        />
        <div className="privacy-note">
          <span className="privacy-icon" aria-hidden="true">✓</span>
          <p>
            نستخدم بياناتك لإنشاء حساب وليّ الأمر وتسجيل دخولك. لا تضف معلومات
            عن طفلك هنا؛ ستظهر لك تفاصيل إضافية قبل إدخالها في خطوات لاحقة.
          </p>
        </div>
        <label className="consent-control">
          <input
            type="checkbox"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
          />
          <span>اطلعت على تنبيه الخصوصية وأرغب في إنشاء حساب.</span>
        </label>
        {error && <p className="form-message error-message" role="alert">{error}</p>}
        {success && <p className="form-message success-message" role="status">{success}</p>}
        <button className="button button-primary button-wide" type="submit" disabled={busy}>
          {busy ? "جارٍ إنشاء الحساب…" : "إنشاء حساب"}
        </button>
      </form>
      <p className="switch-auth">
        لديك حساب بالفعل؟ <Link to="/login">سجّل الدخول</Link>
      </p>
    </div>
  );
}

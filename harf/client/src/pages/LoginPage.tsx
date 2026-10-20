import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getApiErrorMessage } from "../api/client";
import { FormField } from "../components/FormField";
import { useAuth } from "../auth/AuthProvider";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError("أدخل بريدًا إلكترونيًا صحيحًا.");
      return;
    }
    if (!password || new TextEncoder().encode(password).length > 72) {
      setError("أدخل كلمة المرور المستخدمة عند إنشاء الحساب.");
      return;
    }

    setBusy(true);
    try {
      const user = await login({ email: normalizedEmail, password });
      if (user.role !== "parent") {
        setError("هذه المساحة مخصّصة لحسابات أولياء الأمور.");
        return;
      }
      navigate("/dashboard", { replace: true });
    } catch (requestError) {
      setError(getApiErrorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-card">
      <p className="eyebrow">أهلًا بعودتك</p>
      <h2>تسجيل الدخول</h2>
      <p className="card-description">سجّل الدخول لمتابعة مساحة عائلتك.</p>
      <form onSubmit={handleSubmit} className="auth-form">
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
          autoComplete="current-password"
          placeholder="أدخل كلمة المرور"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {error && <p className="form-message error-message" role="alert">{error}</p>}
        <button className="button button-primary button-wide" type="submit" disabled={busy}>
          {busy ? "جارٍ تسجيل الدخول…" : "دخول إلى حسابي"}
        </button>
      </form>
      <p className="switch-auth">
        ليس لديك حساب؟ <Link to="/register">أنشئ حساب وليّ أمر</Link>
      </p>
    </div>
  );
}

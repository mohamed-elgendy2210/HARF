import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthProvider";
import { AuthLayout } from "./components/AuthLayout";
import { LoadingScreen } from "./components/LoadingScreen";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ChildPlaceholderPage } from "./pages/ChildPlaceholderPage";

function HomeRoute() {
  const { status, user } = useAuth();

  if (status === "loading") {
    return <LoadingScreen />;
  }

  return <Navigate to={user?.role === "parent" ? "/dashboard" : "/login"} replace />;
}

function ProtectedParentRoute({ children }: { children: ReactNode }) {
  const { status, user, retrySessionCheck } = useAuth();

  if (status === "loading") {
    return <LoadingScreen />;
  }

  if (status === "error") {
    return (
      <main className="status-screen" dir="rtl">
        <section className="status-card">
          <span className="status-mark" aria-hidden="true">!</span>
          <h1>تعذّر التحقق من الجلسة</h1>
          <p>تحقّق من اتصال الخادم ثم حاول مرة أخرى.</p>
          <button className="button button-primary" onClick={() => void retrySessionCheck()}>
            إعادة المحاولة
          </button>
        </section>
      </main>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role !== "parent") {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();

  if (status === "loading") {
    return <LoadingScreen />;
  }

  if (user?.role === "parent") {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeRoute />} />
      <Route
        path="/login"
        element={
          <PublicOnlyRoute>
            <AuthLayout>
              <LoginPage />
            </AuthLayout>
          </PublicOnlyRoute>
        }
      />
      <Route
        path="/register"
        element={
          <PublicOnlyRoute>
            <AuthLayout>
              <RegisterPage />
            </AuthLayout>
          </PublicOnlyRoute>
        }
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedParentRoute>
            <DashboardPage />
          </ProtectedParentRoute>
        }
      />
      <Route
        path="/dashboard/children/new"
        element={
          <ProtectedParentRoute>
            <ChildPlaceholderPage />
          </ProtectedParentRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

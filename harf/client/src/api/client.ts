export interface SafeUser {
  id: string;
  name: string;
  email: string;
  role: "parent" | "specialist" | "admin";
}

interface UserResponse {
  user: SafeUser;
}

interface ApiErrorResponse {
  error?: string;
}

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000")
  .trim()
  .replace(/\/+$/, "");

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiRequestError(0, "تعذّر الاتصال بالخادم.");
  }

  if (!response.ok) {
    let payload: ApiErrorResponse = {};
    try {
      payload = (await response.json()) as ApiErrorResponse;
    } catch {
      // A server may return a non-JSON error response.
    }
    throw new ApiRequestError(response.status, payload.error ?? "");
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export const authApi = {
  register(input: { name: string; email: string; password: string }) {
    return request<UserResponse>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  login(input: { email: string; password: string }) {
    return request<UserResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  me() {
    return request<UserResponse>("/api/auth/me");
  },
  logout() {
    return request<void>("/api/auth/logout", { method: "POST" });
  },
};

export function getApiErrorMessage(error: unknown): string {
  if (!(error instanceof ApiRequestError)) {
    return "حدث خطأ غير متوقع. حاول مرة أخرى.";
  }

  if (error.status === 0) {
    return "تعذّر الاتصال بالخادم. تحقّق من تشغيل الخادم واتصالك بالإنترنت.";
  }

  switch (error.status) {
    case 400:
      return "يرجى مراجعة البيانات المدخلة والمحاولة مرة أخرى.";
    case 401:
      return "البريد الإلكتروني أو كلمة المرور غير صحيحة.";
    case 403:
      return "تعذّر إتمام الطلب من هذا المصدر.";
    case 409:
      return "يوجد حساب مسجّل بهذا البريد الإلكتروني بالفعل.";
    case 503:
      return "الخدمة غير متاحة الآن. تحقّق من اتصال قاعدة البيانات وحاول لاحقًا.";
    default:
      return error.status >= 500
        ? "حدثت مشكلة في الخادم. حاول مرة أخرى بعد قليل."
        : "تعذّر إتمام الطلب. حاول مرة أخرى.";
  }
}

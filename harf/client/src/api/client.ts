export interface SafeUser {
  id: string;
  name: string;
  email: string;
  role: "parent" | "specialist" | "admin";
}

export interface ChildProfile {
  id: string;
  name: string;
  dateOfBirth: string;
  createdAt: string;
  updatedAt: string;
}

export type ActivityType =
  | "picture-cards-audio"
  | "sound-to-image"
  | "scene-completion";

export interface ActivityItem {
  id: string;
  label: string;
  sceneAsset?: string;
  prompt?: string;
  imageAsset?: string;
  audioAsset?: string;
  spokenWord?: string;
  choices?: ActivityChoice[];
  correctChoiceId?: string;
}

export interface ActivityChoice {
  id: string;
  label: string;
  imageAsset?: string;
}

export interface Activity {
  id: string;
  title: string;
  activityType: ActivityType;
  description: string;
  ageSuitability: {
    minMonths: number;
    maxMonths: number;
  };
  availability: "available" | "unavailable";
  publicationStatus: "demo_pending_review";
  assets: {
    image?: string;
    audio?: string;
  };
  instructions: string[];
  items: ActivityItem[];
  mascot?: {
    id: string;
    expressions: string[];
    animationStates: string[];
  };
}

export interface ActivitySession {
  id: string;
  childId: string;
  activityId: string;
  activityType: ActivityType;
  status: "in_progress" | "completed" | "abandoned";
  startedAt: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

interface UserResponse {
  user: SafeUser;
}

interface ChildResponse {
  child: ChildProfile;
}

interface ChildrenResponse {
  children: ChildProfile[];
}

interface ActivitiesResponse {
  activities: Activity[];
}

interface ActivitySessionResponse {
  session: ActivitySession;
}

interface ActivitySessionsResponse {
  sessions: ActivitySession[];
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

export const childrenApi = {
  list() {
    return request<ChildrenResponse>("/api/children");
  },
  get(id: string) {
    return request<ChildResponse>(`/api/children/${encodeURIComponent(id)}`);
  },
  create(input: { name: string; dateOfBirth: string }) {
    return request<ChildResponse>("/api/children", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  update(id: string, input: { name: string; dateOfBirth: string }) {
    return request<ChildResponse>(`/api/children/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },
  delete(id: string) {
    return request<void>(`/api/children/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  },
};

export const activitiesApi = {
  list(type?: ActivityType) {
    const query = type ? `?type=${encodeURIComponent(type)}` : "";
    return request<ActivitiesResponse>(`/api/activities${query}`);
  },
  startSession(childId: string, activityId: string) {
    return request<ActivitySessionResponse>(
      `/api/children/${encodeURIComponent(childId)}/activity-sessions`,
      {
        method: "POST",
        body: JSON.stringify({ activityId }),
      },
    );
  },
  listSessions(childId: string) {
    return request<ActivitySessionsResponse>(
      `/api/children/${encodeURIComponent(childId)}/activity-sessions`,
    );
  },
  completeSession(childId: string, sessionId: string) {
    return request<ActivitySessionResponse>(
      `/api/children/${encodeURIComponent(childId)}/activity-sessions/${encodeURIComponent(sessionId)}`,
      {
        method: "PATCH",
        body: JSON.stringify({ status: "completed" }),
      },
    );
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

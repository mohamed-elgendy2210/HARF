import { Link } from "react-router-dom";
import type { ChildProfile } from "../api/client";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ar-EG", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

interface ChildCardProps {
  child: ChildProfile;
  deleting: boolean;
  onDelete: (child: ChildProfile) => void;
}

export function ChildCard({ child, deleting, onDelete }: ChildCardProps) {
  const spacePath = `/dashboard/children/${encodeURIComponent(child.id)}/space`;

  return (
    <li className="child-card">
      <span className="child-avatar" aria-hidden="true">ح</span>
      <div className="child-card-details">
        <h3>{child.name}</h3>
        <p>تاريخ الميلاد: {formatDate(child.dateOfBirth)}</p>
      </div>
      <div className="child-card-actions">
        <Link
          className="button button-primary child-action-button"
          to={spacePath}
        >
          ابدأ الأنشطة
        </Link>
        <Link
          className="button button-secondary child-action-button"
          to={spacePath}
          aria-label={`عرض مساحة ${child.name}`}
        >
          عرض المساحة
        </Link>
        <Link
          className="button button-secondary child-action-button"
          to={`/dashboard/children/${encodeURIComponent(child.id)}/edit`}
          aria-label={`تعديل ملف ${child.name}`}
        >
          تعديل
        </Link>
        <button
          className="button button-danger child-action-button"
          onClick={() => onDelete(child)}
          disabled={deleting}
          aria-label={`حذف ملف ${child.name}`}
        >
          {deleting ? "جارٍ الحذف…" : "حذف"}
        </button>
      </div>
    </li>
  );
}

import { getApiUrl } from '../lib/api.js';
import { displayNameOrFallback } from '../lib/displayName.js';

export default function SpecialistCard({ specialist }) {
  const displayName = displayNameOrFallback(specialist.displayName);
  return (
    <article className="specialist-card">
      <span className="specialist-card__portrait-wrap">
        <span className="specialist-card__icon" aria-hidden="true">✦</span>
        {specialist.profilePhotoUrl && (
          <img
            className="specialist-card__portrait specialist-card__portrait--landscape"
            src={getApiUrl(specialist.profilePhotoUrl)}
            alt={`الصورة الشخصية لـ${displayName}`}
            onError={(event) => { event.currentTarget.hidden = true; }}
          />
        )}
      </span>
      <h3>{displayName}</h3>
      <strong>{specialist.specialty}</strong>
      <p>{specialist.credentials}</p>
      <p>{specialist.bio}</p>
      {specialist.appointmentAvailable ? (
        <>
          <p className="specialist-card__price">
            {new Intl.NumberFormat('ar-EG', {
              style: 'currency',
              currency: specialist.appointmentCurrency
            }).format(specialist.appointmentPriceMinor / 100)}
            {' · '}{specialist.appointmentDurationMinutes} دقيقة
          </p>
          <a className="button button--small button--primary specialist-card__booking" href="/dashboard?section=specialists">
            عرض المواعيد والحجز
          </a>
        </>
      ) : <p>لا تتوفر مواعيد للحجز حاليًا.</p>}
    </article>
  );
}

import brandAsset from '../../../../Branding/Colors with logo.png';
import { getApiUrl } from '../lib/api.js';

export default function BrandLogo({ compact = false, homeHref = '#home', logoUrl = null }) {
  return (
    <a
      className={`brand${compact ? ' brand--compact' : ''}`}
      href={homeHref}
      aria-label="حرف — الصفحة الرئيسية"
    >
      <span className={`brand__image${logoUrl ? ' brand__image--custom' : ''}`} aria-hidden="true">
        <img
          src={logoUrl ? getApiUrl(logoUrl) : brandAsset}
          alt=""
          onError={(event) => {
            event.currentTarget.onerror = null;
            event.currentTarget.parentElement?.classList.remove('brand__image--custom');
            event.currentTarget.src = brandAsset;
          }}
        />
      </span>
      {!compact && (
        <span className="brand__copy">
          <span className="brand__name">حرف</span>
          <span className="brand__tagline">معًا ننطق المستقبل</span>
        </span>
      )}
    </a>
  );
}

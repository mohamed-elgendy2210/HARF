import { AppError } from '../middleware/errors.js';

const DEFAULT_SETTINGS = Object.freeze({
  logoAssetId: null,
  logoUrl: null,
  heroImageAssetIds: [],
  heroImages: [],
  colors: {
    primary: '#3B4CCA',
    teal: '#22C7A7',
    purple: '#8B6CF6',
    yellow: '#FFC857',
    coral: '#FF7B7B',
    ink: '#273DA8',
    muted: '#7884B5'
  },
  homepage: {
    eyebrow: 'منصة تفاعلية لتنمية مهارات التخاطب واللغة',
    title: 'معًا .. ننطق\nالمستقبل',
    description: 'ألعاب وقصص صغيرة تساعد طفلك على نطق الحروف والكلمات بثقة، خطوة بخطوة، في كل مرة بداية لقصة أجمل.',
    primaryAction: 'جرّب اللعبة المجانية',
    secondaryAction: 'شوف الفكرة'
  }
});

function serialize(settings, heroImages = [], logoAvailable = true) {
  if (!settings) return DEFAULT_SETTINGS;
  const logoAssetId = settings.logoAssetId ? String(settings.logoAssetId) : null;
  return {
    logoAssetId,
    logoUrl: logoAssetId && logoAvailable ? `/api/v1/platform/logo/${logoAssetId}` : null,
    heroImageAssetIds: heroImages.map(({ id }) => String(id)),
    heroImages,
    colors: { ...DEFAULT_SETTINGS.colors, ...(settings.colors ?? {}) },
    homepage: settings.homepage,
    updatedAt: settings.updatedAt ?? null
  };
}

export class PlatformSettingsService {
  constructor({ repository, authService, mediaAssetService }) {
    this.repository = repository;
    this.authService = authService;
    this.mediaAssetService = mediaAssetService;
  }

  async getPublicSettings() {
    const settings = await this.repository.getSettings();
    const [heroImages, logoAvailable] = await Promise.all([
      this.getAvailableHeroImages(settings),
      this.isLogoAvailable(settings)
    ]);
    return serialize(settings, heroImages, logoAvailable);
  }

  async getAdminSettings() {
    const settings = await this.repository.getSettings();
    const [heroImages, logoAvailable] = await Promise.all([
      this.getAvailableHeroImages(settings),
      this.isLogoAvailable(settings)
    ]);
    return serialize(settings, heroImages, logoAvailable);
  }

  async getAvailableHeroImages(settings) {
    const assetIds = (settings?.heroImageAssetIds ?? []).map(String);
    const assets = await Promise.all(assetIds.map((assetId) => this.repository.findActiveImageAsset(assetId)));
    const availableAssets = await Promise.all(assets.map(async (asset) => (
      asset && await this.mediaAssetService.isAvailable(asset) ? asset : null
    )));
    return availableAssets.filter(Boolean).map((asset) => ({
      id: String(asset._id ?? asset.id),
      url: `/api/v1/platform/hero-image/${String(asset._id ?? asset.id)}`,
      altText: asset.altText ?? asset.displayName,
      category: asset.category ?? ''
    }));
  }

  async isLogoAvailable(settings) {
    if (!settings?.logoAssetId) return false;
    const asset = await this.repository.findActiveImageAsset(settings.logoAssetId);
    return Boolean(asset && await this.mediaAssetService.isAvailable(asset));
  }

  async readPublicLogo(assetId) {
    const settings = await this.repository.getSettings();
    if (!settings?.logoAssetId || String(settings.logoAssetId) !== String(assetId)) return null;
    const asset = await this.repository.findActiveImageAsset(assetId);
    if (!asset) return null;
    return this.mediaAssetService.readAssetFile(asset);
  }

  async readPublicHeroImage(assetId) {
    const settings = await this.repository.getSettings();
    const configuredIds = (settings?.heroImageAssetIds ?? []).map(String);
    if (!configuredIds.includes(String(assetId))) return null;
    const asset = await this.repository.findActiveImageAsset(assetId);
    if (!asset) return null;
    return this.mediaAssetService.readAssetFile(asset);
  }

  async updateSettings(actor, input) {
    if (input.logoAssetId) {
      const asset = await this.repository.findActiveImageAsset(input.logoAssetId);
      if (!asset || !(await this.mediaAssetService.isAvailable(asset))) {
        throw new AppError(400, 'PLATFORM_LOGO_INVALID', 'اختر صورة نشطة ومتاحة من مكتبة الوسائط لتكون شعار المنصة.');
      }
    }
    for (const assetId of input.heroImageAssetIds ?? []) {
      const asset = await this.repository.findActiveImageAsset(assetId);
      if (!asset || !(await this.mediaAssetService.isAvailable(asset))) {
        throw new AppError(400, 'PLATFORM_HERO_IMAGE_INVALID', 'اختر صورًا نشطة ومتاحة من مكتبة الوسائط لعرضها في الصفحة الرئيسية.');
      }
    }
    const updates = {
      logoAssetId: input.logoAssetId,
      heroImageAssetIds: input.heroImageAssetIds ?? [],
      colors: input.colors,
      homepage: input.homepage
    };
    const settings = await this.repository.updateSettings(updates, actor._id ?? actor.id);
    if (this.authService?.recordAudit) {
      await this.authService.recordAudit('admin.platform_settings_updated', {
        actorUserId: actor._id ?? actor.id,
        metadata: {
          changedFields: [
            'logoAssetId',
            'heroImageAssetIds',
            'colors',
            'homepage'
          ]
        }
      });
    }
    const [heroImages, logoAvailable] = await Promise.all([
      this.getAvailableHeroImages(settings),
      this.isLogoAvailable(settings)
    ]);
    return serialize(settings, heroImages, logoAvailable);
  }
}

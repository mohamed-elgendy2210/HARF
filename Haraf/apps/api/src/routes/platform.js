import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { assetIdSchema } from '../validation/gameLibrary.js';
import { sendAsset } from './media.js';

export function createPlatformRouter({ platformSettingsService }) {
  const router = Router();
  router.get('/settings', async (_request, response) => {
    response.json({ settings: await platformSettingsService.getPublicSettings() });
  });
  router.get('/logo/:assetId', validate(assetIdSchema, 'params'), async (request, response, next) => {
    try {
      const logo = await platformSettingsService.readPublicLogo(request.params.assetId);
      if (!logo) {
        response.status(404).json({ error: { code: 'PLATFORM_LOGO_NOT_FOUND', message: 'The platform logo is not available.' } });
        return;
      }
      sendAsset(request, response, logo);
    } catch (error) {
      next(error);
    }
  });
  router.get('/hero-image/:assetId', validate(assetIdSchema, 'params'), async (request, response, next) => {
    try {
      const image = await platformSettingsService.readPublicHeroImage(request.params.assetId);
      if (!image) {
        response.status(404).json({ error: { code: 'PLATFORM_HERO_IMAGE_NOT_FOUND', message: 'The homepage image is not available.' } });
        return;
      }
      sendAsset(request, response, image);
    } catch (error) {
      next(error);
    }
  });
  return router;
}

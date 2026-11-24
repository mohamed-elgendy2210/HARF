import { MediaAsset } from '../models/MediaAsset.js';
import { PlatformSettings } from '../models/PlatformSettings.js';

export async function ensurePlatformSettingsIndexes() {
  await Promise.all([PlatformSettings.createIndexes(), MediaAsset.createIndexes()]);
}

export function createPlatformSettingsRepository() {
  return {
    getSettings() {
      return PlatformSettings.findOne({ key: 'platform' }).lean();
    },
    updateSettings(updates, updatedBy) {
      return PlatformSettings.findOneAndUpdate(
        { key: 'platform' },
        { $set: { ...updates, updatedBy }, $unset: { textColors: 1 } },
        { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
      ).lean();
    },
    findActiveImageAsset(assetId) {
      return MediaAsset.findOne({ _id: assetId, kind: 'image', active: true }).lean();
    }
  };
}

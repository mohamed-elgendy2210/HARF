import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { createGameLibraryRepository } from '../src/db/gameLibraryRepository.js';
import { GameDefinition } from '../src/models/GameDefinition.js';
import { GameVersion } from '../src/models/GameVersion.js';
import { PlatformSettings } from '../src/models/PlatformSettings.js';

test('platform logos and hero images count as media asset references', async (t) => {
  const assetId = '6ae1ea54ca58aee3fa8e4e6b';
  t.mock.method(GameDefinition, 'exists', async () => null);
  t.mock.method(GameVersion, 'exists', async () => null);
  const platformReference = t.mock.method(PlatformSettings, 'exists', async (query) => {
    assert.deepEqual(query, {
      $or: [{ logoAssetId: assetId }, { heroImageAssetIds: assetId }]
    });
    return { _id: 'platform-settings' };
  });

  const isReferenced = await createGameLibraryRepository().isAssetReferenced(assetId);

  assert.equal(isReferenced, true);
  assert.equal(platformReference.mock.calls.length, 1);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GameLibraryService } from '../src/services/gameLibraryService.js';
import { GameService } from '../src/services/gameService.js';

test('admin game preview reads a draft and points its assets to authenticated previews', async () => {
  const service = new GameLibraryService({
    repository: {
      async findDefinition(gameId) {
        return {
          gameId,
          publishedVersion: 0,
          draftContent: {
            template: 'multiple-choice',
            title: 'Draft',
            description: 'Draft game',
            companion: 'Harf',
            companionAnimal: '🐢',
            companionAnimalImageAssetId: 'image-id',
            instructions: 'Choose an answer.',
            questions: [],
            assetAssignments: [{ event: 'welcome', kind: 'image', assetId: 'image-id' }]
          }
        };
      }
    },
    mediaAssetService: {
      async listAssets() {
        return [{
          id: 'image-id',
          kind: 'image',
          active: true,
          altText: 'Companion'
        }];
      }
    },
    authService: null
  });

  const game = await service.getDraftPreview('draft-game');

  assert.equal(game.id, 'draft-game');
  assert.equal(game.access, 'trial');
  assert.equal(game.companionAnimalImageUrl, '/api/v1/admin/assets/image-id/preview');
  assert.equal(game.assets.welcome.imageUrl, '/api/v1/admin/assets/image-id/preview');
});

test('admin game preview scores the saved draft without recording parent data', async () => {
  const gameLibraryService = new GameLibraryService({
    repository: {
      async findDefinition(gameId) {
        return {
          gameId,
          publishedVersion: 0,
          draftContent: {
            template: 'multiple-choice',
            questions: [{
              prompt: 'Choose the right answer.',
              options: ['Wrong', 'Right'],
              correctAnswerIndex: 1
            }]
          }
        };
      }
    },
    mediaAssetService: null,
    authService: null
  });
  const gameService = new GameService({ gameLibraryService });

  assert.deepEqual(await gameService.checkPreviewAnswer('draft-game', {
    questionIndex: 0,
    answerIndex: 1
  }), { correct: true });
});

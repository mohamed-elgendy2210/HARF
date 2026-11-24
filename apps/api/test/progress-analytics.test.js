import test from 'node:test';
import assert from 'node:assert/strict';
import { GameService } from '../src/services/gameService.js';

const parentUserId = '64b000000000000000000001';
const childId = '64b000000000000000000002';

test('weekly analytics use a seven-day UTC range and daily buckets', async () => {
  const calls = [];
  const service = new GameService({
    childService: {
      async getOwnedChild(parentId, requestedChildId) {
        assert.equal(parentId, parentUserId);
        assert.equal(requestedChildId, childId);
      }
    },
    repository: {
      async getChildProgressAnalytics(...args) {
        calls.push(args);
        return {
          totalAttempts: 2,
          activeDays: 2,
          games: [{ gameId: 'word-match', attempts: 2 }],
          series: [{ gameId: 'word-match', date: new Date('2026-11-21T00:00:00.000Z'), attempts: 2, averageScore: 75 }]
        };
      }
    },
    now: () => new Date('2026-11-22T13:00:00.000Z')
  });

  const result = await service.getChildProgressAnalytics(parentUserId, childId, 'weekly', 'word-match');
  assert.equal(result.from.toISOString(), '2026-11-16T00:00:00.000Z');
  assert.equal(result.to.toISOString(), '2026-11-23T00:00:00.000Z');
  assert.equal(calls[0][2].bucketUnit, 'day');
  assert.equal(result.totalAttempts, 2);
  assert.equal(result.activeDays, 2);
  assert.equal(result.buckets[0].averageScore, 75);
});

test('monthly analytics use a thirty-day UTC range and weekly buckets', async () => {
  let query;
  const service = new GameService({
    childService: { async getOwnedChild() {} },
    repository: {
      async getChildProgressAnalytics(_parentId, _childId, input) {
        query = input;
        return { totalAttempts: 0, activeDays: 0, games: [], series: [] };
      }
    },
    now: () => new Date('2026-11-22T13:00:00.000Z')
  });

  const result = await service.getChildProgressAnalytics(parentUserId, childId, 'monthly');
  assert.equal(result.from.toISOString(), '2026-10-24T00:00:00.000Z');
  assert.equal(result.to.toISOString(), '2026-11-23T00:00:00.000Z');
  assert.equal(query.bucketUnit, 'week');
  assert.deepEqual(result.buckets, []);
});

test('progress analytics do not combine performance from different games', async () => {
  const service = new GameService({
    childService: { async getOwnedChild() {} },
    repository: {
      async getChildProgressAnalytics() {
        return {
          totalAttempts: 3,
          activeDays: 2,
          games: [
            { gameId: 'word-match', attempts: 2 },
            { gameId: 'spatial-relationships', attempts: 1 }
          ],
          series: [
            { gameId: 'word-match', date: new Date('2026-11-21T00:00:00.000Z'), attempts: 2, averageScore: 80 },
            { gameId: 'spatial-relationships', date: new Date('2026-11-21T00:00:00.000Z'), attempts: 1, averageScore: 100 }
          ]
        };
      }
    },
    now: () => new Date('2026-11-22T13:00:00.000Z')
  });

  const noSelection = await service.getChildProgressAnalytics(parentUserId, childId, 'weekly');
  const selectedGame = await service.getChildProgressAnalytics(parentUserId, childId, 'weekly', 'word-match');
  assert.deepEqual(noSelection.buckets, []);
  assert.equal(noSelection.games.length, 2);
  assert.equal(selectedGame.buckets.length, 1);
  assert.equal(selectedGame.buckets[0].averageScore, 80);
});

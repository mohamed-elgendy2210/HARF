import { Router } from 'express';
import { AppError } from '../middleware/errors.js';
import { requireApprovedAccount, requireAuthentication, requireCsrf, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  gameAttemptSchema,
  gameChildQuerySchema,
  gameIdSchema,
  gameInteractionSchema
} from '../validation/games.js';

export function createGamesRouter({
  gameService,
  authenticationMiddleware,
  databaseMiddleware,
  subscriptionService,
  learningPathService
}) {
  const router = Router();

  function authorizeGameAccess(request, response, next) {
    gameService.getGame(request.params.gameId)
      .then((game) => {
        if (game.access === 'trial') {
          request.game = game;
          next();
          return;
        }
        databaseMiddleware(request, response, (databaseError) => {
          if (databaseError) {
            next(databaseError);
            return;
          }
          authenticationMiddleware(request, response, (authenticationError) => {
            if (authenticationError) {
              next(authenticationError);
              return;
            }
            requireAuthentication(request, response, (requiredAuthenticationError) => {
              if (requiredAuthenticationError) {
                next(requiredAuthenticationError);
                return;
              }
              requireApprovedAccount(request, response, (approvalError) => {
                if (approvalError) {
                  next(approvalError);
                  return;
                }
                requireRole('parent')(request, response, (roleError) => {
                  if (roleError) {
                    next(roleError);
                    return;
                  }
                  requireCsrf(request, response, (csrfError) => {
                    if (csrfError) {
                      next(csrfError);
                      return;
                    }
                    const childId = request.validatedQuery?.childId ?? request.body?.childId;
                    if (request.path.endsWith('/answer') && !childId) {
                      next(new AppError(400, 'LEARNING_CHILD_REQUIRED', 'اختر ملف الطفل قبل متابعة هذا النشاط.'));
                      return;
                    }
                    Promise.all([
                      subscriptionService.requireActive(request.authenticated.user._id),
                      learningPathService.assertActivityConfigured(game.id),
                      childId
                        ? learningPathService.assertActivityPlayable(
                          request.authenticated.user._id,
                          childId,
                          game.id
                        )
                        : Promise.resolve()
                    ]).then(() => {
                      request.game = game;
                      next();
                    }).catch(next);
                  });
                });
              });
            });
          });
        });
      })
      .catch(next);
  }

  router.get('/', async (_request, response) => {
    response.json({ games: await gameService.listGames() });
  });

  router.get('/:gameId', validate(gameIdSchema, 'params'), validate(gameChildQuerySchema, 'query'), authorizeGameAccess, (request, response) => {
    response.json({ game: request.game });
  });

  router.post('/:gameId/answer', validate(gameIdSchema, 'params'), validate(gameInteractionSchema), authorizeGameAccess, async (request, response) => {
    response.json({
      answer: await gameService.checkAnswer(request.params.gameId, {
        ...request.body,
        parentUserId: request.authenticated?.user._id
      })
    });
  });

  router.post('/:gameId/attempts', databaseMiddleware, authenticationMiddleware, requireAuthentication, requireApprovedAccount, requireRole('parent'), requireCsrf, validate(gameIdSchema, 'params'), validate(gameAttemptSchema), async (request, response) => {
    const attempt = await gameService.recordChildAttempt(
      request.authenticated.user._id,
      request.params.gameId,
      request.body
    );
    response.status(201).json({ attempt });
  });

  return router;
}

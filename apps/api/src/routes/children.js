import { Router } from 'express';
import {
  requireApprovedAccount,
  requireAuthentication,
  requireCsrf,
  requireRole
} from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  childConsentSchema,
  childIdSchema,
  childRegistrationDraftSchema,
  createChildSchema,
  completeChildRegistrationSchema,
  updateChildSchema
} from '../validation/children.js';
import { childAttemptsQuerySchema } from '../validation/games.js';
import {
  confirmPathAssignmentsSchema,
  questionnaireSubmissionSchema
} from '../validation/learningPath.js';
import { serializeChild } from '../services/childService.js';

export function createChildrenRouter({ childService, gameService, learningPathService, authenticationMiddleware }) {
  const router = Router();
  router.use(
    authenticationMiddleware,
    requireAuthentication,
    requireApprovedAccount,
    requireRole('parent')
  );

  router.get('/', async (request, response) => {
    const children = await childService.listChildren(request.authenticated.user._id);
    response.json({ children });
  });

  router.get('/registrations/pending', async (request, response) => {
    response.set('Cache-Control', 'private, no-store');
    response.json({
      registrations: await childService.listPendingRegistrations(request.authenticated.user._id)
    });
  });

  router.post('/', requireCsrf, validate(createChildSchema), async (request, response) => {
    const child = await childService.createChild(request.authenticated.user._id, request.body, {
      pendingRegistration: true
    });
    response.status(201).json({ child, registrationRequired: true });
  });

  router.get('/:childId/consents', validate(childIdSchema, 'params'), async (request, response) => {
    const consents = await childService.listConsents(
      request.authenticated.user._id,
      request.params.childId
    );
    response.json({ consents });
  });

  router.post('/:childId/consents', requireCsrf, validate(childIdSchema, 'params'), validate(childConsentSchema), async (request, response) => {
    const consent = await childService.recordConsent(
      request.authenticated.user._id,
      request.params.childId,
      request.body
    );
    response.status(201).json({ consent });
  });

  router.get('/:childId/game-attempts', validate(childIdSchema, 'params'), validate(childAttemptsQuerySchema, 'query'), async (request, response) => {
    const history = await gameService.listChildAttempts(
      request.authenticated.user._id,
      request.params.childId,
      request.validatedQuery
    );
    response.json(history);
  });

  if (learningPathService) {
    router.get('/:childId/learning-progress', validate(childIdSchema, 'params'), async (request, response) => {
      const progress = await learningPathService.getChildLearningOverview(
        request.authenticated.user._id,
        request.params.childId
      );
      response.json({ progress });
    });
    router.get('/:childId/learning-activities', validate(childIdSchema, 'params'), async (request, response) => {
      response.set('Cache-Control', 'private, no-store');
      const progress = await learningPathService.getChildLearningOverview(
        request.authenticated.user._id,
        request.params.childId
      );
      const paths = progress.paths.filter(({ status }) => status === 'active' || status === 'completed');
      const activitiesById = new Map();
      for (const path of paths) {
        for (const activity of path.activities) {
          const existing = activitiesById.get(activity.gameId);
          if (existing) {
            existing.pathTitles.push(path.title);
            if (activity.status === 'available') existing.status = 'available';
            else if (activity.status === 'completed' && existing.status !== 'available') {
              existing.status = 'completed';
            }
          } else {
            activitiesById.set(activity.gameId, {
              ...activity,
              pathTitles: [path.title]
            });
          }
        }
      }
      const games = await gameService.listGamesByIds([...activitiesById.keys()]);
      const gamesById = new Map(games
        .filter(({ access }) => access !== 'trial')
        .map((game) => [game.id, game]));
      const activities = [...activitiesById.values()].flatMap((activity) => {
        const game = gamesById.get(activity.gameId);
        return game ? [{ ...game, ...activity, activityStatus: activity.status }] : [];
      });
      response.json({
        paths: paths.map(({ key, title }) => ({ key, title })),
        activities
      });
    });
    router.get('/:childId/learning-questionnaire', validate(childIdSchema, 'params'), async (_request, response) => {
      await childService.getOwnedChild(_request.authenticated.user._id, _request.params.childId);
      response.json({ questionnaire: await learningPathService.getQuestionnaire() });
    });
    router.get('/:childId/learning-questionnaire-response', validate(childIdSchema, 'params'), async (request, response) => {
      response.set('Cache-Control', 'private, no-store');
      response.json({
        response: await learningPathService.getLatestQuestionnaireResponse(
          request.authenticated.user._id,
          request.params.childId
        )
      });
    });
    router.patch('/:childId/registration-draft', requireCsrf, validate(childIdSchema, 'params'), validate(childRegistrationDraftSchema), async (request, response) => {
      response.json({
        registration: await learningPathService.saveRegistrationDraft(
          request.authenticated.user._id,
          request.params.childId,
          request.body
        )
      });
    });
    router.post('/:childId/learning-recommendations', requireCsrf, validate(childIdSchema, 'params'), validate(questionnaireSubmissionSchema), async (request, response) => {
      const recommendations = await learningPathService.previewRecommendations(
        request.authenticated.user._id,
        request.params.childId,
        request.body
      );
      response.json(recommendations);
    });
    router.post('/:childId/learning-path-assignments', requireCsrf, validate(childIdSchema, 'params'), validate(confirmPathAssignmentsSchema), async (request, response) => {
      const result = await learningPathService.confirmPathAssignments(
        request.authenticated.user._id,
        request.params.childId,
        request.body
      );
      response.status(201).json(result);
    });
    router.post('/:childId/complete-registration', requireCsrf, validate(childIdSchema, 'params'), validate(completeChildRegistrationSchema), async (request, response) => {
      response.json(await learningPathService.completeChildRegistration(
        request.authenticated.user._id,
        request.params.childId,
        request.body
      ));
    });
  }

  router.get('/:childId', validate(childIdSchema, 'params'), async (request, response) => {
    const child = await childService.getOwnedChild(
      request.authenticated.user._id,
      request.params.childId
    );
    response.json({ child: serializeChild(child) });
  });

  router.patch('/:childId', requireCsrf, validate(childIdSchema, 'params'), validate(updateChildSchema), async (request, response) => {
    const child = await childService.updateChild(
      request.authenticated.user._id,
      request.params.childId,
      request.body
    );
    response.json({ child });
  });

  return router;
}

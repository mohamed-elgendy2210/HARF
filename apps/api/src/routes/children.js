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
  createChildSchema,
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

  router.post('/', requireCsrf, validate(createChildSchema), async (request, response) => {
    const child = await childService.createChild(request.authenticated.user._id, request.body);
    response.status(201).json({ child });
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
    router.get('/:childId/learning-questionnaire', validate(childIdSchema, 'params'), async (_request, response) => {
      response.json({ questionnaire: await learningPathService.getQuestionnaire() });
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

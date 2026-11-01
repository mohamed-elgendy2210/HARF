import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import multer from 'multer';
import { requireApprovedAccount, requireAuthentication, requireCsrf, requireRole } from '../middleware/auth.js';
import { AppError } from '../middleware/errors.js';
import { validate } from '../middleware/validate.js';
import { accountIdSchema, accountStatusSchema, administratorCreateSchema, approvalSchema } from '../validation/auth.js';
import {
  assetIdSchema,
  createGameSchema,
  gameLibraryParamsSchema,
  trialGameSchema,
  trialGamesSchema,
  updateAssetSchema,
  updateGameSchema,
  uploadAssetMetadataSchema
} from '../validation/gameLibrary.js';
import {
  learningAssignmentQuerySchema,
  learningPathCreateSchema,
  learningAssignmentReviewSchema,
  learningPathParamsSchema,
  learningPathSchema,
  questionnaireSchema,
} from '../validation/learningPath.js';
import {
  paymentDecisionSchema,
  paymentRequestParamsSchema,
  subscriptionSettingsSchema
} from '../validation/payments.js';
import { sendAsset } from './media.js';
import { sendPrivateReceipt } from './receipt.js';
import { reportRangeSchema } from '../validation/reports.js';
import { reportCsvRows } from '../services/reportService.js';
import { platformSettingsSchema } from '../validation/platformSettings.js';
import { testimonialDecisionSchema, testimonialIdSchema } from '../validation/testimonial.js';
import {
  adminAppointmentParamsSchema,
  adminAppointmentQuerySchema,
  adminSecondParticipantSchema,
  adminVideoTestHistoryQuerySchema,
  adminVideoTestParamsSchema,
  adminVideoTestResultsSchema
} from '../validation/adminVideo.js';

const mediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024,
    files: 1,
    fields: 5,
    fieldNameSize: 100,
    fieldSize: 1024,
    parts: 6
  }
});
const mediaUploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler(_request, _response, next) {
    next(new AppError(429, 'MEDIA_UPLOAD_RATE_LIMITED', 'Too many media uploads. Please wait before trying again.'));
  }
});

function parseUpload(request, response, next) {
  mediaUpload.single('file')(request, response, (error) => {
    if (!error) {
      next();
      return;
    }
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      next(new AppError(413, 'MEDIA_TOO_LARGE', 'Uploaded media cannot exceed 20 MB.'));
      return;
    }
    if (error instanceof multer.MulterError) {
      next(new AppError(400, 'INVALID_UPLOAD', 'The upload must contain one file and supported metadata fields.'));
      return;
    }
    next(error);
  });
}

export function createAdminRouter({
  authService,
  authenticationMiddleware,
  gameLibraryService,
  learningPathService,
  subscriptionService,
  reportService,
  notificationService,
  specialistDocumentService,
  platformSettingsService,
  testimonialService,
  appointmentService,
  adminVideoTestService
}) {
  const router = Router();
  router.use(authenticationMiddleware, requireAuthentication, requireApprovedAccount, requireRole('admin'), requireCsrf);

  if (appointmentService) {
    router.get('/appointments', validate(adminAppointmentQuerySchema, 'query'), async (request, response) => {
      response.set('Cache-Control', 'private, no-store');
      response.json(await appointmentService.listAdminAppointments(request.validatedQuery));
    });
    router.post('/appointments/:appointmentId/meeting/retry', validate(adminAppointmentParamsSchema, 'params'), async (request, response) => {
      response.status(201).json({
        meeting: await appointmentService.retryAdminMeeting(request.authenticated.user, request.params.appointmentId)
      });
    });
  }

  if (adminVideoTestService) {
    const videoTestLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 5,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler(_request, _response, next) {
        next(new AppError(429, 'VIDEO_TEST_RATE_LIMITED', 'Too many video tests. Please wait before trying again.'));
      }
    });
    router.post('/video-tests', videoTestLimiter, async (request, response) => {
      response.set('Cache-Control', 'private, no-store');
      response.status(201).json(await adminVideoTestService.create(request.authenticated.user));
    });
    router.get('/video-tests', validate(adminVideoTestHistoryQuerySchema, 'query'), async (request, response) => {
      response.set('Cache-Control', 'private, no-store');
      response.json(await adminVideoTestService.list(request.validatedQuery));
    });
    router.post('/video-tests/:testId/second-participant/access', validate(adminVideoTestParamsSchema, 'params'), validate(adminSecondParticipantSchema), async (request, response) => {
      response.set('Cache-Control', 'private, no-store');
      response.json(await adminVideoTestService.secondParticipantAccess(
        request.authenticated.user,
        request.params.testId,
        request.body.token
      ));
    });
    router.patch('/video-tests/:testId/results', validate(adminVideoTestParamsSchema, 'params'), validate(adminVideoTestResultsSchema), async (request, response) => {
      response.json({
        test: await adminVideoTestService.recordResults(
          request.authenticated.user,
          request.params.testId,
          request.body
        )
      });
    });
    router.post('/video-tests/:testId/end', validate(adminVideoTestParamsSchema, 'params'), async (request, response) => {
      response.json({
        test: await adminVideoTestService.end(request.authenticated.user, request.params.testId)
      });
    });
  }

  router.get('/accounts', async (request, response) => {
    const accounts = await authService.listPendingAccounts(request.authenticated.user);
    response.json({ accounts });
  });

  router.get('/administrators', async (request, response) => {
    response.json({ administrators: await authService.listAdministrators(request.authenticated.user) });
  });

  router.post('/administrators', validate(administratorCreateSchema), async (request, response) => {
    const administrator = await authService.createAdministrator(request.authenticated.user, request.body);
    response.status(201).json({ administrator });
  });

  router.delete('/administrators/:accountId', validate(accountIdSchema, 'params'), async (request, response) => {
    await authService.deleteAdministrator(request.authenticated.user, request.params.accountId);
    response.status(204).end();
  });

  if (platformSettingsService) {
    router.get('/platform-settings', async (_request, response) => {
      response.json({ settings: await platformSettingsService.getAdminSettings() });
    });
    router.put('/platform-settings', validate(platformSettingsSchema), async (request, response) => {
      response.json({
        settings: await platformSettingsService.updateSettings(request.authenticated.user, request.body)
      });
    });
  }

  if (specialistDocumentService) {
    router.get('/accounts/:accountId/verification/:documentType', async (request, response) => {
      const file = await authService.getSpecialistVerificationDocument(
        request.authenticated.user,
        request.params.accountId,
        request.params.documentType
      );
      response.set({
        'Content-Type': file.mimeType,
        'Content-Length': file.buffer.length,
        'Content-Disposition': 'inline',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff'
      });
      response.send(file.buffer);
    });
  }

  if (notificationService) {
    router.get('/notifications', async (request, response) => {
      const notifications = await notificationService.list(request.authenticated.user._id);
      response.json({
        notifications,
        unreadCount: notifications.filter(({ readAt }) => !readAt).length
      });
    });
  }

  if (testimonialService) {
    router.get('/testimonials', async (_request, response) => {
      response.json({ testimonials: await testimonialService.listForAdmin() });
    });
    router.post('/testimonials/:testimonialId/review', validate(testimonialIdSchema, 'params'), validate(testimonialDecisionSchema), async (request, response) => {
      const testimonial = await testimonialService.review(
        request.authenticated.user,
        request.params.testimonialId,
        request.body.decision
      );
      response.json({ testimonial });
    });
  }

  if (reportService) {
    router.get('/reports', validate(reportRangeSchema, 'query'), async (request, response) => {
      response.json(await reportService.getAdminReport(request.validatedQuery));
    });
    router.get('/reports/export.csv', validate(reportRangeSchema, 'query'), async (request, response) => {
      const report = await reportService.getAdminReport(request.validatedQuery);
      response.set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="harf-admin-report.csv"',
        'Cache-Control': 'private, no-store'
      });
      response.send(`\uFEFF${reportCsvRows(report)}`);
    });
  }

  router.patch('/accounts/:accountId/approval', validate(approvalSchema), async (request, response) => {
    const user = await authService.setApprovalStatus(
      request.authenticated.user,
      request.params.accountId,
      request.body.approvalStatus
    );
    response.json({ user });
  });

  router.delete('/accounts/:accountId', validate(accountIdSchema, 'params'), async (request, response) => {
    const result = await authService.deletePendingAccount(
      request.authenticated.user,
      request.params.accountId
    );
    response.json(result);
  });

  router.patch('/accounts/:accountId/status', validate(accountStatusSchema), async (request, response) => {
    const user = await authService.setAccountStatus(
      request.authenticated.user,
      request.params.accountId,
      request.body.accountStatus
    );
    response.json({ user });
  });

  if (subscriptionService) {
    router.get('/subscription/settings', async (_request, response) => {
      response.json({ settings: await subscriptionService.getAdminSettings() });
    });
    router.put('/subscription/settings', validate(subscriptionSettingsSchema), async (request, response) => {
      const settings = await subscriptionService.updateSettings(request.authenticated.user, request.body);
      response.json({ settings });
    });
    router.get('/payments', async (_request, response) => {
      response.json({ payments: await subscriptionService.listAdminPayments() });
    });
    router.post('/payments/:paymentId/review', validate(paymentRequestParamsSchema, 'params'), validate(paymentDecisionSchema), async (request, response) => {
      response.json(await subscriptionService.reviewPayment(
        request.authenticated.user,
        request.params.paymentId,
        request.body
      ));
    });
    router.get('/payments/:paymentId/receipt', validate(paymentRequestParamsSchema, 'params'), async (request, response, next) => {
      try {
        const receipt = await subscriptionService.readAdminReceipt(request.params.paymentId);
        sendPrivateReceipt(response, receipt);
      } catch (error) {
        next(error);
      }
    });
  }

  if (learningPathService) {
    router.get('/learning-path', async (_request, response) => {
      response.json(await learningPathService.getAdminPath());
    });
    router.put('/learning-path', validate(learningPathSchema), async (request, response) => {
      response.json({ path: await learningPathService.updatePath(request.authenticated.user, request.body) });
    });
    router.get('/learning-paths', async (_request, response) => {
      response.json(await learningPathService.listAdminPaths());
    });
    router.post('/learning-paths', validate(learningPathCreateSchema), async (request, response) => {
      const path = await learningPathService.createPath(request.authenticated.user, request.body);
      response.status(201).json({ path });
    });
    router.put('/learning-paths/:pathKey', validate(learningPathParamsSchema, 'params'), validate(learningPathSchema), async (request, response) => {
      response.json({
        path: await learningPathService.updatePathByKey(
          request.authenticated.user,
          request.params.pathKey,
          request.body
        )
      });
    });
    router.get('/learning-questionnaire', async (_request, response) => {
      response.json({ questionnaire: await learningPathService.getAdminQuestionnaire() });
    });
    router.put('/learning-questionnaire', validate(questionnaireSchema), async (request, response) => {
      response.json({ questionnaire: await learningPathService.updateQuestionnaire(request.authenticated.user, request.body) });
    });
    router.get('/learning-assignments', validate(learningAssignmentQuerySchema, 'query'), async (request, response) => {
      response.json({
        assignments: await learningPathService.listAdminAssignments(request.validatedQuery.childId)
      });
    });
    router.patch('/learning-assignments/review', validate(learningAssignmentReviewSchema), async (request, response) => {
      const { parentUserId, childId, pathKey, status, reason } = request.body;
      response.json({
        assignment: await learningPathService.reviewAssignment(
          request.authenticated.user,
          parentUserId,
          childId,
          pathKey,
          status,
          reason
        )
      });
    });
  }

  if (gameLibraryService) {
    router.get('/games', async (_request, response) => {
      response.json(await gameLibraryService.listGames());
    });

    router.post('/games', validate(createGameSchema), async (request, response) => {
      const game = await gameLibraryService.createGame(request.authenticated.user, request.body);
      response.status(201).json({ game });
    });

    router.patch('/games/:gameId', validate(gameLibraryParamsSchema, 'params'), validate(updateGameSchema), async (request, response) => {
      const game = await gameLibraryService.updateDraft(
        request.authenticated.user,
        request.params.gameId,
        request.body.content
      );
      response.json({ game });
    });

    router.post('/games/:gameId/publish', validate(gameLibraryParamsSchema, 'params'), async (request, response) => {
      const game = await gameLibraryService.publish(request.authenticated.user, request.params.gameId);
      response.json({ game });
    });

    router.post('/games/:gameId/unpublish', validate(gameLibraryParamsSchema, 'params'), async (request, response) => {
      const game = await gameLibraryService.unpublish(request.authenticated.user, request.params.gameId);
      response.json({ game });
    });

    router.put('/games/trials', validate(trialGamesSchema), async (request, response) => {
      await gameLibraryService.validateTrialGames(request.body.gameIds);
      if (learningPathService) {
        await learningPathService.assertCanSelectTrials(request.body.gameIds);
        for (const gameId of request.body.gameIds) {
          if (await gameLibraryService.getPlayableGame(gameId)) {
            await learningPathService.removeActivityForTrial(request.authenticated.user, gameId);
          }
        }
      }
      const setting = await gameLibraryService.selectTrials(request.authenticated.user, request.body.gameIds);
      response.json({ trialGameIds: setting.value, trialGameId: setting.value[0] });
    });

    router.put('/games/trial', validate(trialGameSchema), async (request, response) => {
      const { gameId } = request.body;
      if (learningPathService && await gameLibraryService.getPlayableGame(gameId)) {
        await learningPathService.removeActivityForTrial(request.authenticated.user, gameId);
      }
      const setting = await gameLibraryService.selectTrial(request.authenticated.user, gameId);
      response.json({ trialGameId: setting.value, trialGameIds: setting.gameIds });
    });

    router.get('/assets', async (_request, response) => {
      response.json({ assets: await gameLibraryService.listAssets() });
    });

    router.get('/assets/:assetId/preview', validate(assetIdSchema, 'params'), async (request, response, next) => {
      try {
        const result = await gameLibraryService.readAdminAsset(request.params.assetId);
        if (!result) {
          response.status(404).json({ error: { code: 'ASSET_NOT_FOUND', message: 'The media asset was not found.' } });
          return;
        }
        sendAsset(request, response, result);
      } catch (error) {
        next(error);
      }
    });

    router.post('/assets', mediaUploadLimiter, parseUpload, validate(uploadAssetMetadataSchema), async (request, response) => {
      const asset = await gameLibraryService.uploadAsset(request.authenticated.user, {
        file: request.file,
        ...request.body
      });
      response.status(201).json({ asset });
    });

    router.post('/assets/:assetId/replace', mediaUploadLimiter, parseUpload, validate(assetIdSchema, 'params'), async (request, response) => {
      const asset = await gameLibraryService.replaceAsset(
        request.authenticated.user,
        request.params.assetId,
        request.file
      );
      response.json({ asset });
    });

    router.patch('/assets/:assetId', validate(assetIdSchema, 'params'), validate(updateAssetSchema), async (request, response) => {
      const asset = request.body.active !== undefined
        && Object.keys(request.body).length === 1
        ? await gameLibraryService.setAssetActive(request.authenticated.user, request.params.assetId, request.body.active)
        : await gameLibraryService.updateAsset(request.authenticated.user, request.params.assetId, request.body);
      response.json({ asset });
    });

    router.delete('/assets/:assetId', validate(assetIdSchema, 'params'), async (request, response) => {
      await gameLibraryService.deleteAsset(request.authenticated.user, request.params.assetId);
      response.status(204).end();
    });
  }

  return router;
}

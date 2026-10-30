import path from 'node:path';
import { config } from './config/env.js';
import { createApp } from './app.js';
import { connectMongo, disconnectMongo, getDatabaseState } from './db/mongo.js';
import { createAuthRepository, ensureAuthIndexes } from './db/authRepository.js';
import { createChildRepository, ensureChildIndexes } from './db/childRepository.js';
import { createLogger, safeError } from './lib/logger.js';
import { AuthService } from './services/authService.js';
import { createEmailService } from './services/emailService.js';
import { ChildService } from './services/childService.js';
import { createGameRepository, ensureGameIndexes } from './db/gameRepository.js';
import { GameService } from './services/gameService.js';
import { GameLibraryService } from './services/gameLibraryService.js';
import { MediaAssetService } from './services/mediaAssetService.js';
import { createGameLibraryRepository, ensureGameLibraryIndexes, seedGameLibrary } from './db/gameLibraryRepository.js';
import { createLearningPathRepository, ensureLearningPathIndexes, seedLearningPath } from './db/learningPathRepository.js';
import { createSubscriptionRepository, ensureSubscriptionIndexes } from './db/subscriptionRepository.js';
import { createPaymentRepository, ensurePaymentIndexes } from './db/paymentRepository.js';
import { LearningPathService } from './services/learningPathService.js';
import { SubscriptionService } from './services/subscriptionService.js';
import { PaymentReceiptService } from './services/paymentReceiptService.js';
import { createAppointmentRepository, ensureAppointmentIndexes } from './db/appointmentRepository.js';
import { AppointmentService } from './services/appointmentService.js';
import { JitsiIframeAdapter, VideoProviderService } from './services/videoProviderService.js';
import { createNotificationRepository, ensureNotificationIndexes } from './db/notificationRepository.js';
import { NotificationService } from './services/notificationService.js';
import { createReportRepository } from './db/reportRepository.js';
import { ReportService } from './services/reportService.js';
import { SpecialistDocumentService } from './services/specialistDocumentService.js';
import { createPlatformSettingsRepository, ensurePlatformSettingsIndexes } from './db/platformSettingsRepository.js';
import { PlatformSettingsService } from './services/platformSettingsService.js';
import { createTestimonialRepository, ensureTestimonialIndexes } from './db/testimonialRepository.js';
import { TestimonialService } from './services/testimonialService.js';
import { createAdminVideoTestRepository, ensureAdminVideoTestIndexes } from './db/adminVideoTestRepository.js';
import { AdminVideoTestService } from './services/adminVideoTestService.js';

const logger = createLogger({ level: config.logLevel, isProduction: config.isProduction });

async function start() {
  const databaseConnected = await connectMongo(config.mongodbUri, { isProduction: config.isProduction, logger });
  if (databaseConnected) {
    await Promise.all([
      ensureAuthIndexes(),
      ensureChildIndexes(),
      ensureGameIndexes(),
      ensureSubscriptionIndexes(),
      ensurePaymentIndexes(),
      ensureLearningPathIndexes(),
      ensureAppointmentIndexes(),
      ensureNotificationIndexes(),
      ensurePlatformSettingsIndexes(),
      ensureTestimonialIndexes(),
      ensureAdminVideoTestIndexes()
    ]);
    await seedGameLibrary();
    await seedLearningPath();
  }

  const repository = createAuthRepository();
  const specialistDocumentService = new SpecialistDocumentService({
    storageDirectory: path.join(config.mediaStorageDir, 'specialist-verification')
  });
  await specialistDocumentService.initialize();
  const childService = new ChildService({ repository: createChildRepository() });
  const emailService = createEmailService(config.smtp);
  const notificationService = new NotificationService({
    repository: createNotificationRepository(),
    authRepository: repository,
    emailService,
    logger
  });
  const testimonialService = new TestimonialService({
    repository: createTestimonialRepository(),
    authRepository: repository,
    notificationService,
    logger
  });
  const reportService = new ReportService({ repository: createReportRepository() });
  const videoProviderService = new VideoProviderService({
    adapter: new JitsiIframeAdapter({ domain: config.jitsi.domain })
  });
  const appointmentService = new AppointmentService({
    repository: createAppointmentRepository(),
    authRepository: repository,
    childService,
    videoProviderService,
    notificationService,
    logger,
    specialistDocumentService,
    meetingRules: config.jitsi
  });
  const adminVideoTestService = new AdminVideoTestService({
    repository: createAdminVideoTestRepository(),
    videoProviderService,
    authRepository: repository,
    lifetimeMinutes: config.videoTestLifetimeMinutes
  });
  if (databaseConnected) appointmentService.startExpiryWorker();
  const gameLibraryRepository = createGameLibraryRepository();
  const mediaAssetService = new MediaAssetService({
    repository: gameLibraryRepository,
    storageDirectory: config.mediaStorageDir
  });
  await mediaAssetService.initialize();
  const authService = new AuthService({
    repository,
    emailService,
    notificationService,
    logger,
    appOrigin: config.appOrigin,
    specialistDocumentService
  });
  const platformSettingsService = new PlatformSettingsService({
    repository: createPlatformSettingsRepository(),
    authService,
    mediaAssetService
  });
  const subscriptionService = new SubscriptionService({
    repository: createSubscriptionRepository(),
    paymentRepository: createPaymentRepository(),
    authRepository: repository,
    notificationService,
    logger,
    receiptService: new PaymentReceiptService({
      storageDirectory: path.join(config.mediaStorageDir, 'payment-receipts')
    })
  });
  await subscriptionService.receiptService.initialize();
  const gameRepository = createGameRepository();
  const learningPathService = new LearningPathService({
    repository: createLearningPathRepository(),
    gameRepository,
    childService,
    subscriptionService,
    authService
  });
  const gameLibraryService = new GameLibraryService({
    repository: gameLibraryRepository,
    mediaAssetService,
    authService
  });
  const gameService = new GameService({
    repository: gameRepository,
    childService,
    gameLibraryService: databaseConnected ? gameLibraryService : null,
    learningPathService: databaseConnected ? learningPathService : null,
    subscriptionService: databaseConnected ? subscriptionService : null,
    appointmentService: databaseConnected ? appointmentService : null
  });
  const app = createApp({
    config,
    logger,
    getDatabaseState,
    authService,
    repository,
    notificationService,
    reportService,
    testimonialService: databaseConnected ? testimonialService : null,
    childService,
    gameService,
    gameLibraryService: databaseConnected ? gameLibraryService : null,
    learningPathService: databaseConnected ? learningPathService : null,
    subscriptionService: databaseConnected ? subscriptionService : null,
    appointmentService: databaseConnected ? appointmentService : null,
    specialistDocumentService,
    platformSettingsService: databaseConnected ? platformSettingsService : null,
    adminVideoTestService: databaseConnected ? adminVideoTestService : null
  });
  const server = app.listen(config.port, config.host, () => {
    logger.info({ host: config.host, port: config.port }, 'Harf API listening.');
  });

  const shutdown = async (signal) => {
    logger.info({ signal }, 'Shutting down Harf API.');
    appointmentService.stopExpiryWorker();
    server.close(async (error) => {
      if (error) {
        logger.error({ error: safeError(error) }, 'HTTP server failed to close cleanly.');
        process.exitCode = 1;
      }
      try {
        await disconnectMongo();
      } catch (disconnectError) {
        logger.error({ error: safeError(disconnectError) }, 'MongoDB failed to disconnect cleanly.');
        process.exitCode = 1;
      }
    });
  };

  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

void start().catch((error) => {
  logger.fatal({ error: safeError(error) }, 'Harf API failed to start.');
  process.exitCode = 1;
});

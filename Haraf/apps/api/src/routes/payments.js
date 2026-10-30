import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import multer from 'multer';
import { requireApprovedAccount, requireAuthentication, requireCsrf, requireRole } from '../middleware/auth.js';
import { AppError } from '../middleware/errors.js';
import { validate } from '../middleware/validate.js';
import { paymentRequestParamsSchema, paymentRequestSchema } from '../validation/payments.js';
import { sendPrivateReceipt } from './receipt.js';

const paymentUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
    fields: 3,
    fieldNameSize: 100,
    fieldSize: 512,
    parts: 4
  }
});

const paymentRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler(_request, _response, next) {
    next(new AppError(429, 'PAYMENT_REQUEST_RATE_LIMITED', 'طلبات الدفع كثيرة جدًا. يرجى الانتظار قبل المحاولة مجددًا.'));
  }
});

function parsePaymentUpload(request, response, next) {
  paymentUpload.single('receipt')(request, response, (error) => {
    if (!error) {
      next();
      return;
    }
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      next(new AppError(413, 'RECEIPT_TOO_LARGE', 'الحد الأقصى لحجم الإيصال 5 ميجابايت.'));
      return;
    }
    if (error instanceof multer.MulterError) {
      next(new AppError(400, 'INVALID_RECEIPT_UPLOAD', 'يمكن رفع إيصال واحد مع بيانات الدفع المطلوبة فقط.'));
      return;
    }
    next(error);
  });
}

export function createPaymentsRouter({ authenticationMiddleware, subscriptionService }) {
  const router = Router();

  router.get('/plan', async (_request, response) => {
    response.json({ plan: await subscriptionService.getPublicPlan() });
  });

  router.use(authenticationMiddleware, requireAuthentication, requireApprovedAccount, requireRole('parent'));
  router.get('/', async (request, response) => {
    response.json({
      payments: await subscriptionService.listParentPayments(request.authenticated.user._id)
    });
  });

  router.post('/', requireCsrf, paymentRequestLimiter, parsePaymentUpload, validate(paymentRequestSchema), async (request, response) => {
    const payment = await subscriptionService.createPaymentRequest(
      request.authenticated.user,
      request.body,
      request.file
    );
    response.status(201).json({ payment });
  });

  router.get('/:paymentId/receipt', validate(paymentRequestParamsSchema, 'params'), async (request, response, next) => {
    try {
      const receipt = await subscriptionService.readParentReceipt(
        request.params.paymentId,
        request.authenticated.user._id
      );
      sendPrivateReceipt(response, receipt);
    } catch (error) {
      next(error);
    }
  });

  return router;
}

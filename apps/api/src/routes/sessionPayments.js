import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import multer from 'multer';
import { requireApprovedAccount, requireAuthentication, requireCsrf, requireRole } from '../middleware/auth.js';
import { AppError } from '../middleware/errors.js';
import { validate } from '../middleware/validate.js';
import { sessionPaymentParamsSchema, sessionPaymentSubmissionSchema } from '../validation/payments.js';
import { sendPrivateReceipt } from './receipt.js';

const receiptUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 1, parts: 2, fieldNameSize: 80, fieldSize: 40 }
});

const submissionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 6,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler(_request, _response, next) {
    next(new AppError(429, 'SESSION_PAYMENT_RATE_LIMITED', 'طلبات الدفع كثيرة جدًا. يرجى الانتظار قبل المحاولة مجددًا.'));
  }
});

function parseReceipt(request, response, next) {
  receiptUpload.single('receipt')(request, response, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return next(new AppError(413, 'RECEIPT_TOO_LARGE', 'الحد الأقصى لحجم صورة الإيصال 5 ميجابايت.'));
    }
    if (error instanceof multer.MulterError) {
      return next(new AppError(400, 'INVALID_RECEIPT_UPLOAD', 'ارفع صورة إيصال واحدة مع طريقة الدفع فقط.'));
    }
    return next(error);
  });
}

export function createSessionPaymentsRouter({ authenticationMiddleware, sessionPaymentService }) {
  const router = Router();
  router.use(authenticationMiddleware, requireAuthentication, requireApprovedAccount, requireRole('parent'));

  router.get('/:appointmentId/payment', validate(sessionPaymentParamsSchema, 'params'), async (request, response) => {
    response.set('Cache-Control', 'private, no-store');
    response.json({
      paymentDetails: await sessionPaymentService.getParentPayment(
        request.authenticated.user,
        request.params.appointmentId
      )
    });
  });

  router.post('/:appointmentId/payment', requireCsrf, submissionLimiter, parseReceipt,
    validate(sessionPaymentParamsSchema, 'params'), validate(sessionPaymentSubmissionSchema),
    async (request, response) => {
      const payment = await sessionPaymentService.submitReceipt(
        request.authenticated.user,
        request.params.appointmentId,
        request.body,
        request.file
      );
      response.status(201).json({ payment });
    });

  router.get('/:appointmentId/payment/receipt', validate(sessionPaymentParamsSchema, 'params'), async (request, response, next) => {
    try {
      const receipt = await sessionPaymentService.readParentReceipt(
        request.authenticated.user,
        request.params.appointmentId
      );
      sendPrivateReceipt(response, receipt);
    } catch (error) {
      next(error);
    }
  });

  return router;
}

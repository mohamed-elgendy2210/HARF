import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { assetIdSchema } from '../validation/gameLibrary.js';

function sendAsset(request, response, result) {
  const { buffer } = result;
  const range = request.headers.range;
  response
    .set('X-Content-Type-Options', 'nosniff')
    .set('Content-Security-Policy', "default-src 'none'; sandbox")
    .set('Cache-Control', 'private, no-store')
    .set('Accept-Ranges', 'bytes')
    .type(result.asset.mimeType);
  if (!range) {
    response.set('Content-Length', buffer.length).send(buffer);
    return;
  }
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match || (!match[1] && !match[2])) {
    response.set('Content-Range', `bytes */${buffer.length}`).status(416).end();
    return;
  }
  const suffixLength = match[1] ? null : Number(match[2]);
  const start = suffixLength === null ? Number(match[1]) : Math.max(0, buffer.length - suffixLength);
  const end = match[2] && match[1] ? Math.min(Number(match[2]), buffer.length - 1) : buffer.length - 1;
  if (start >= buffer.length || end < start || suffixLength === 0) {
    response.set('Content-Range', `bytes */${buffer.length}`).status(416).end();
    return;
  }
  const chunk = buffer.subarray(start, end + 1);
  response
    .status(206)
    .set('Content-Range', `bytes ${start}-${end}/${buffer.length}`)
    .set('Content-Length', chunk.length)
    .send(chunk);
}

export function createMediaRouter({ gameLibraryService }) {
  const router = Router();
  router.get('/:assetId', validate(assetIdSchema, 'params'), async (request, response, next) => {
    try {
      const result = await gameLibraryService.readPublicAsset(request.params.assetId);
      if (!result) {
        response.status(404).json({ error: { code: 'ASSET_NOT_FOUND', message: 'The media asset was not found.' } });
        return;
      }
      sendAsset(request, response, result);
    } catch (error) {
      next(error);
    }
  });
  return router;
}

export { sendAsset };

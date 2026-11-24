import { AppError } from './errors.js';

export function validate(schema, property = 'body') {
  return (request, _response, next) => {
    const result = schema.safeParse(request[property]);
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message
      }));
      return next(new AppError(400, 'VALIDATION_ERROR', 'The request contains invalid data.', details));
    }
    if (property === 'query') {
      request.validatedQuery = result.data;
    } else {
      request[property] = result.data;
    }
    return next();
  };
}

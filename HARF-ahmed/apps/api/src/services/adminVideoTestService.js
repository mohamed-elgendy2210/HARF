import { createHash, randomBytes } from 'node:crypto';
import { AppError } from '../middleware/errors.js';

const RATE_WINDOW_MS = 60 * 60 * 1000;
const MAX_TESTS_PER_HOUR = 5;

function idOf(record) {
  return String(record?._id ?? record?.id ?? record);
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function calculateOutcome(results) {
  const values = Object.values(results);
  if (values.includes('failed')) return 'failed';
  if (values.every((value) => ['passed', 'manual_passed'].includes(value))) return 'succeeded';
  if (values.some((value) => ['passed', 'manual_passed'].includes(value))) return 'partial';
  return 'incomplete';
}

function serializeTest(test) {
  const administrator = test.administratorId && typeof test.administratorId === 'object'
    ? test.administratorId : null;
  return {
    id: idOf(test),
    administratorId: idOf(administrator?._id ?? test.administratorId),
    administratorEmail: administrator?.email ?? null,
    provider: test.provider,
    domain: test.domain,
    status: test.status,
    results: test.results,
    failureReason: test.failureReason ?? '',
    createdAt: test.createdAt,
    startedAt: test.startedAt,
    endedAt: test.endedAt,
    expiresAt: test.expiresAt
  };
}

export class AdminVideoTestService {
  constructor({ repository, videoProviderService, authRepository, lifetimeMinutes = 30, now = () => new Date() }) {
    this.repository = repository;
    this.videoProviderService = videoProviderService;
    this.authRepository = authRepository;
    this.lifetimeMs = lifetimeMinutes * 60 * 1000;
    this.now = now;
  }

  async create(administrator) {
    const now = this.now();
    const administratorId = idOf(administrator);
    const recent = await this.repository.countRecentForAdministrator(
      administratorId,
      new Date(now.getTime() - RATE_WINDOW_MS)
    );
    if (recent >= MAX_TESTS_PER_HOUR) {
      throw new AppError(429, 'VIDEO_TEST_RATE_LIMITED', 'Too many video tests. Please try again later.');
    }
    if (!this.videoProviderService?.isConfigured()) {
      throw new AppError(503, 'VIDEO_PROVIDER_NOT_CONFIGURED', 'Video consultations are not configured.');
    }
    const roomName = randomBytes(32).toString('hex');
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(now.getTime() + this.lifetimeMs);
    const meeting = await this.videoProviderService.createMeetingRecord({
      appointment: { id: 'admin-test', startsAt: now, endsAt: expiresAt },
      roomName
    });
    const test = await this.repository.create({
      administratorId,
      provider: meeting.provider,
      domain: meeting.domain,
      roomName: meeting.roomName,
      secondParticipantTokenHash: hashToken(token),
      status: 'in_progress',
      results: {},
      startedAt: null,
      expiresAt
    });
    await this.audit('admin.video_test.created', administrator, { testId: idOf(test) });
    const access = await this.videoProviderService.createRoomAccess({ appointment: { meeting }, participant: administrator });
    return {
      test: serializeTest(test),
      access,
      secondParticipantToken: token
    };
  }

  async secondParticipantAccess(administrator, testId, token) {
    const now = this.now();
    const test = await this.repository.consumeSecondParticipantToken(testId, hashToken(token), now);
    if (!test) throw new AppError(404, 'VIDEO_TEST_LINK_INVALID', 'This second-participant link is invalid, expired, or already used.');
    const meeting = { provider: test.provider, domain: test.domain, roomName: test.roomName, status: 'scheduled' };
    const access = await this.videoProviderService.createRoomAccess({ appointment: { meeting }, participant: administrator });
    await this.audit('admin.video_test.second_participant_joined', administrator, { testId });
    return { access, test: serializeTest(test) };
  }

  async recordResults(administrator, testId, input) {
    const current = await this.repository.findById(testId);
    if (!current) throw new AppError(404, 'VIDEO_TEST_NOT_FOUND', 'The video test was not found.');
    if (current.status !== 'in_progress' || current.expiresAt <= this.now()) {
      throw new AppError(409, 'VIDEO_TEST_NOT_ACTIVE', 'This video test is no longer active.');
    }
    const now = this.now();
    const updates = Object.fromEntries(Object.entries(input)
      .filter(([key]) => key !== 'failureReason')
      .map(([key, value]) => [`results.${key}`, value]));
    if (input.failureReason) updates.failureReason = input.failureReason;
    if (!current.startedAt && input.connection === 'passed') updates.startedAt = now;
    const updated = await this.repository.recordResults(testId, updates, now);
    if (!updated) throw new AppError(409, 'VIDEO_TEST_NOT_ACTIVE', 'This video test is no longer active.');
    await this.audit('admin.video_test.result_recorded', administrator, {
      testId,
      checks: Object.keys(input).filter((key) => key !== 'failureReason')
    });
    return serializeTest(updated);
  }

  async end(administrator, testId) {
    const now = this.now();
    await this.repository.expireInProgress(now);
    const current = await this.repository.findById(testId);
    if (!current) throw new AppError(404, 'VIDEO_TEST_NOT_FOUND', 'The video test was not found.');
    if (current.status !== 'in_progress') return serializeTest(current);
    const status = current.expiresAt <= now ? 'incomplete' : calculateOutcome(current.results);
    const updated = await this.repository.update(testId, {
      status,
      endedAt: now,
      secondParticipantTokenHash: null,
      ...(status === 'succeeded' ? { failureReason: '' } : {})
    });
    await this.audit('admin.video_test.ended', administrator, { testId, status });
    return serializeTest(updated);
  }

  async list(query) {
    await this.repository.expireInProgress(this.now());
    const [tests, total] = await this.repository.list(query);
    return {
      tests: tests.map((test) => serializeTest(test)),
      page: query.page,
      limit: query.limit,
      total,
      pages: Math.ceil(total / query.limit)
    };
  }

  async audit(action, administrator, metadata) {
    await this.authRepository.createAuditEvent({
      action,
      actorUserId: idOf(administrator),
      targetUserId: null,
      success: true,
      metadata
    });
  }
}

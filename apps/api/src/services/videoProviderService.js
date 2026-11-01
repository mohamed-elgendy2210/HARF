import { AppError } from '../middleware/errors.js';
import { z } from 'zod';

const MAX_CREDENTIAL_LIFETIME_MS = 5 * 60 * 1000;
const roomAccessSchema = z.object({
  joinUrl: z.string().url(),
  domain: z.string().min(1).max(253).optional(),
  roomName: z.string().min(1).max(128).optional(),
  token: z.string().min(1).max(8192).optional(),
  expiresAt: z.coerce.date().optional()
}).strict();
const meetingSchema = z.object({
  provider: z.literal('jitsi'),
  domain: z.string().min(1).max(253),
  roomName: z.string().regex(/^[a-f\d]{64}$/i),
  status: z.literal('scheduled'),
  createdAt: z.date(),
  startedAt: z.null(),
  endedAt: z.null()
}).strict();

export class VideoProviderService {
  constructor({ adapter = null, now = () => new Date() } = {}) {
    this.adapter = adapter;
    this.now = now;
  }

  isConfigured() {
    return Boolean(this.adapter?.createMeetingRecord && this.adapter?.createRoomAccess);
  }

  async createMeetingRecord({ appointment, roomName }) {
    if (!this.adapter?.createMeetingRecord) {
      throw new AppError(503, 'VIDEO_PROVIDER_NOT_CONFIGURED', 'Video consultations are not configured.');
    }
    const result = await this.adapter.createMeetingRecord({ appointment, roomName, now: this.now() });
    const parsed = meetingSchema.safeParse(result);
    if (!parsed.success || parsed.data.roomName !== roomName || parsed.data.domain !== this.adapter.domain) {
      throw new AppError(502, 'VIDEO_PROVIDER_INVALID_MEETING', 'The video provider returned invalid meeting details.');
    }
    return parsed.data;
  }

  async createRoomAccess({ appointment, participant }) {
    if (!this.adapter?.createRoomAccess) {
      throw new AppError(503, 'VIDEO_PROVIDER_NOT_CONFIGURED', 'Video consultations are not configured.');
    }

    const result = await this.adapter.createRoomAccess({ appointment, participant });
    const parsed = roomAccessSchema.safeParse(result);
    const joinUrl = parsed.success ? new URL(parsed.data.joinUrl) : null;
    if (!parsed.success || joinUrl.protocol !== 'https:' || joinUrl.username || joinUrl.password
      || (parsed.data.domain && joinUrl.hostname !== parsed.data.domain)
      || (parsed.data.domain && parsed.data.domain !== this.adapter.domain)
      || (parsed.data.roomName && parsed.data.roomName !== appointment.meeting?.roomName)) {
      throw new AppError(502, 'VIDEO_PROVIDER_INVALID_RESPONSE', 'The video provider returned an invalid room credential.');
    }
    if (parsed.data.expiresAt) {
      const lifetime = parsed.data.expiresAt.getTime() - this.now().getTime();
      if (lifetime <= 0 || lifetime > MAX_CREDENTIAL_LIFETIME_MS) {
        throw new AppError(502, 'VIDEO_PROVIDER_INVALID_EXPIRY', 'The video provider returned an invalid credential expiry.');
      }
    }
    return {
      ...(parsed.data.domain ? { domain: parsed.data.domain } : {}),
      ...(parsed.data.roomName ? { roomName: parsed.data.roomName } : {}),
      ...(parsed.data.token ? { token: parsed.data.token } : {}),
      ...(parsed.data.expiresAt ? { expiresAt: parsed.data.expiresAt.toISOString() } : {})
    };
  }
}

export class JitsiIframeAdapter {
  constructor({ domain = 'meet.jit.si' } = {}) {
    this.domain = domain.toLowerCase();
  }

  createMeetingRecord({ roomName, now }) {
    return {
      provider: 'jitsi',
      domain: this.domain,
      roomName,
      status: 'scheduled',
      createdAt: now,
      startedAt: null,
      endedAt: null
    };
  }

  createRoomAccess({ appointment }) {
    const { domain, roomName } = appointment.meeting;
    return {
      joinUrl: `https://${domain}/${roomName}`,
      domain,
      roomName
    };
  }
}

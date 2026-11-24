import { User } from '../models/User.js';
import { GameAttempt } from '../models/GameAttempt.js';
import { LearningProgress } from '../models/LearningProgress.js';
import { Subscription } from '../models/Subscription.js';
import { PaymentRequest } from '../models/PaymentRequest.js';
import { Appointment } from '../models/Appointment.js';
import { AuditEvent } from '../models/AuditEvent.js';

function groupByStatus(match, role) {
  return User.aggregate([
    { $match: { ...match, role: role ?? { $in: ['parent', 'specialist'] } } },
    { $group: { _id: { role: '$role', approval: '$approvalStatus' }, count: { $sum: 1 } } }
  ]);
}

export function createReportRepository() {
  return {
    async registrationSummary(match) {
      const [total, grouped] = await Promise.all([
        User.countDocuments({ ...match, role: { $in: ['parent', 'specialist'] } }),
        groupByStatus(match)
      ]);
      return {
        total,
        byRoleAndApproval: Object.fromEntries(grouped.map(({ _id, count }) => [`${_id.role}:${_id.approval}`, count]))
      };
    },
    specialistCategories(match) {
      return User.aggregate([
        { $match: { ...match, role: 'specialist' } },
        { $group: { _id: { $ifNull: ['$professionalProfile.specialty', 'غير مصنف'] }, count: { $sum: 1 } } },
        { $project: { _id: 0, category: '$_id', count: 1 } },
        { $sort: { count: -1, category: 1 } }
      ]);
    },
    gameUsage(match) {
      return GameAttempt.aggregate([
        { $match: match },
        {
          $group: {
            _id: '$gameId',
            attemptCount: { $sum: 1 },
            totalDurationSeconds: { $sum: '$durationSeconds' },
            correctAnswers: { $sum: '$correctCount' },
            answeredQuestions: { $sum: '$totalQuestions' }
          }
        },
        { $project: { _id: 0, gameId: '$_id', attemptCount: 1, totalDurationSeconds: 1, correctAnswers: 1, answeredQuestions: 1 } },
        { $sort: { attemptCount: -1, gameId: 1 } }
      ]);
    },
    async learningProgressSummary(match, from, to) {
      const completionDateConditions = [
        ...(from ? [{ $gte: ['$$activity.completedAt', from] }] : []),
        ...(to ? [{ $lte: ['$$activity.completedAt', to] }] : [])
      ];
      const pipeline = [
        { $match: match },
        {
          $project: {
            parentUserId: 1,
            childId: 1,
            completedActivities: {
              $filter: {
                input: '$completedActivities',
                as: 'activity',
                cond: completionDateConditions.length ? { $and: completionDateConditions } : true
              }
            }
          }
        },
        { $match: { $expr: { $gt: [{ $size: '$completedActivities' }, 0] } } },
        {
          $group: {
            _id: null,
            childIds: { $addToSet: '$childId' },
            completedActivities: { $sum: { $size: '$completedActivities' } }
          }
        },
        { $project: { _id: 0, childrenWithProgress: { $size: '$childIds' }, completedActivities: 1 } }
      ];
      const [summary] = await LearningProgress.aggregate(pipeline);
      return summary ?? { childrenWithProgress: 0, completedActivities: 0 };
    },
    subscriptionRecords(match, now) {
      return Subscription.aggregate([
        { $match: match },
        {
          $project: {
            status: {
              $cond: [
                { $gt: ['$expiresAt', now] },
                { $cond: [{ $lte: ['$startsAt', now] }, 'active', 'scheduled'] },
                'expired'
              ]
            }
          }
        }
      ]);
    },
    paymentSummary(match) {
      return PaymentRequest.aggregate([
        { $match: match },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            amountMinor: { $sum: '$amountMinor' }
          }
        }
      ]).then((groups) => {
        const byStatus = new Map(groups.map(({ _id, count, amountMinor }) => [_id, { count, amountMinor }]));
        const group = (...statuses) => statuses.reduce((total, status) => {
          const item = byStatus.get(status);
          return {
            count: total.count + (item?.count ?? 0),
            amountMinor: total.amountMinor + (item?.amountMinor ?? 0)
          };
        }, { count: 0, amountMinor: 0 });
        return [
          { status: 'all', requestedCount: [...byStatus.values()].reduce((sum, item) => sum + item.count, 0), requestedAmountMinor: group('pending', 'reviewing', 'approved', 'rejected').amountMinor },
          { status: 'submitted', submittedCount: group('pending', 'reviewing').count, submittedAmountMinor: group('pending', 'reviewing').amountMinor },
          { status: 'confirmed', confirmedCount: group('approved').count, confirmedAmountMinor: group('approved').amountMinor },
          { status: 'rejected', rejectedCount: group('rejected').count, rejectedAmountMinor: group('rejected').amountMinor }
        ];
      });
    },
    appointmentSummary(match) {
      return Appointment.aggregate([
        { $match: match },
        {
          $group: {
            _id: { status: '$status', sessionStatus: { $ifNull: ['$sessionStatus', 'not_started'] } },
            count: { $sum: 1 }
          }
        },
        { $project: { _id: 0, status: '$_id.status', sessionStatus: '$_id.sessionStatus', count: 1, sessionCount: '$count' } },
        { $sort: { status: 1, sessionStatus: 1 } }
      ]);
    },
    auditSummary(match) {
      return AuditEvent.aggregate([
        { $match: match },
        { $group: { _id: '$action', count: { $sum: 1 } } },
        { $project: { _id: 0, action: '$_id', count: 1 } },
        { $sort: { count: -1, action: 1 } },
        { $limit: 100 }
      ]);
    }
  };
}

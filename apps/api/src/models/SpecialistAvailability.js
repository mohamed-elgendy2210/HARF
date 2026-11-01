import mongoose from 'mongoose';

const windowSchema = new mongoose.Schema({
  start: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
  end: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ }
}, { _id: false, strict: 'throw' });

const weeklyDaySchema = new mongoose.Schema({
  dayOfWeek: { type: Number, required: true, min: 0, max: 6 },
  windows: { type: [windowSchema], required: true, default: [] }
}, { _id: false, strict: 'throw' });

const exceptionSchema = new mongoose.Schema({
  date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  windows: { type: [windowSchema], required: true, default: [] }
}, { _id: false, strict: 'throw' });

const specialistAvailabilitySchema = new mongoose.Schema({
  specialistUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  timeZone: { type: String, required: true, maxlength: 80 },
  appointmentPriceMinor: { type: Number, required: true, min: 100, max: 100000000 },
  appointmentCurrency: { type: String, enum: ['EGP'], required: true, default: 'EGP' },
  appointmentDurationMinutes: { type: Number, required: true, min: 15, max: 240 },
  weeklySchedule: { type: [weeklyDaySchema], required: true, default: [] },
  exceptions: { type: [exceptionSchema], required: true, default: [] }
}, { timestamps: true, versionKey: false, strict: 'throw' });

specialistAvailabilitySchema.index({ specialistUserId:  1 }, { unique: true, name: 'availability_by_specialist' });

export const SpecialistAvailability = mongoose.models.SpecialistAvailability
  ?? mongoose.model('SpecialistAvailability', specialistAvailabilitySchema);

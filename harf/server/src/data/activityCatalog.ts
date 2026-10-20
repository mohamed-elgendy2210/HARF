export const activityTypes = [
  "picture-cards-audio",
  "sound-to-image",
  "scene-completion",
] as const;

export type ActivityType = (typeof activityTypes)[number];

export interface ActivityItem {
  id: string;
  label: string;
  imageAsset?: string;
  audioAsset?: string;
}

export interface ActivityMascot {
  id: string;
  expressions: string[];
  animationStates: string[];
}

export interface ActivityDefinition {
  id: string;
  title: string;
  activityType: ActivityType;
  description: string;
  ageSuitability: {
    minMonths: number;
    maxMonths: number;
  };
  availability: "available" | "unavailable";
  publicationStatus: "demo_pending_review";
  assets: {
    image?: string;
    audio?: string;
  };
  instructions: string[];
  items: ActivityItem[];
  mascot?: ActivityMascot;
}

export const activityCatalog: ActivityDefinition[] = [
  {
    id: "demo-picture-cards-audio",
    title: "بطاقات الصور والصوت",
    activityType: "picture-cards-audio",
    description: "نموذج تجريبي لعرض بطاقات صور مع إمكانية إضافة صوت لاحقًا.",
    ageSuitability: { minMonths: 18, maxMonths: 71 },
    availability: "available",
    publicationStatus: "demo_pending_review",
    assets: {},
    instructions: [],
    items: [],
  },
  {
    id: "demo-sound-to-image",
    title: "الصوت والصورة",
    activityType: "sound-to-image",
    description: "نموذج تجريبي لبنية مطابقة الصوت بالصورة.",
    ageSuitability: { minMonths: 18, maxMonths: 71 },
    availability: "available",
    publicationStatus: "demo_pending_review",
    assets: {},
    instructions: [],
    items: [],
  },
  {
    id: "demo-scene-completion",
    title: "إكمال المشهد",
    activityType: "scene-completion",
    description: "نموذج تجريبي لبنية اختيار عنصر مناسب لإكمال مشهد.",
    ageSuitability: { minMonths: 18, maxMonths: 71 },
    availability: "available",
    publicationStatus: "demo_pending_review",
    assets: {},
    instructions: [],
    items: [],
  },
];

export function findAvailableActivity(id: string): ActivityDefinition | undefined {
  return activityCatalog.find(
    (activity) => activity.id === id && activity.availability === "available",
  );
}

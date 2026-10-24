export const activityTypes = [
  "picture-cards-audio",
  "sound-to-image",
  "scene-completion",
] as const;

export type ActivityType = (typeof activityTypes)[number];

export interface ActivityItem {
  id: string;
  label: string;
  sceneAsset?: string;
  prompt?: string;
  imageAsset?: string;
  audioAsset?: string;
  spokenWord?: string;
  choices?: ActivityChoice[];
  correctChoiceId?: string;
}

export interface ActivityChoice {
  id: string;
  label: string;
  imageAsset?: string;
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
    description: "بطاقات مصورة تجريبية، والتسجيلات الصوتية قيد التجهيز.",
    ageSuitability: { minMonths: 18, maxMonths: 71 },
    availability: "available",
    publicationStatus: "demo_pending_review",
    assets: {},
    instructions: ["انظر إلى الصورة، ثم استمع إلى الكلمة."],
    items: [
      {
        id: "ball",
        label: "كُرَة",
        imageAsset: "/activities/picture-cards-audio/images/ball.svg",
      },
      {
        id: "apple",
        label: "تُفَّاحَة",
        imageAsset: "/activities/picture-cards-audio/images/apple.svg",
      },
      {
        id: "sun",
        label: "شَمْس",
        imageAsset: "/activities/picture-cards-audio/images/sun.svg",
      },
    ],
  },
  {
    id: "demo-sound-to-image",
    title: "الصوت والصورة",
    activityType: "sound-to-image",
    description: "استمع إلى كلمة واختر الصورة المناسبة لها.",
    ageSuitability: { minMonths: 18, maxMonths: 71 },
    availability: "available",
    publicationStatus: "demo_pending_review",
    assets: {},
    instructions: ["اسمع الكلمة واختار الصورة."],
    items: [
      {
        id: "sound-ball",
        label: "كُرَة",
        spokenWord: "كُرَة",
        audioAsset: "/activities/sound-to-image/audio/ball.mp3",
        correctChoiceId: "ball",
        choices: [
          { id: "ball", label: "كُرَة", imageAsset: "/activities/picture-cards-audio/images/ball.svg" },
          { id: "apple", label: "تُفَّاحَة", imageAsset: "/activities/picture-cards-audio/images/apple.svg" },
          { id: "sun", label: "شَمْس", imageAsset: "/activities/picture-cards-audio/images/sun.svg" },
        ],
      },
      {
        id: "sound-apple",
        label: "تُفَّاحَة",
        spokenWord: "تُفَّاحَة",
        audioAsset: "/activities/sound-to-image/audio/apple.mp3",
        correctChoiceId: "apple",
        choices: [
          { id: "sun", label: "شَمْس", imageAsset: "/activities/picture-cards-audio/images/sun.svg" },
          { id: "apple", label: "تُفَّاحَة", imageAsset: "/activities/picture-cards-audio/images/apple.svg" },
          { id: "ball", label: "كُرَة", imageAsset: "/activities/picture-cards-audio/images/ball.svg" },
        ],
      },
      {
        id: "sound-sun",
        label: "شَمْس",
        spokenWord: "شَمْس",
        audioAsset: "/activities/sound-to-image/audio/sun.mp3",
        correctChoiceId: "sun",
        choices: [
          { id: "apple", label: "تُفَّاحَة", imageAsset: "/activities/picture-cards-audio/images/apple.svg" },
          { id: "sun", label: "شَمْس", imageAsset: "/activities/picture-cards-audio/images/sun.svg" },
          { id: "ball", label: "كُرَة", imageAsset: "/activities/picture-cards-audio/images/ball.svg" },
        ],
      },
    ],
  },
  {
    id: "demo-scene-completion",
    title: "إكمال المشهد",
    activityType: "scene-completion",
    description: "اختر الصورة التي تساعد على إكمال المشهد.",
    ageSuitability: { minMonths: 18, maxMonths: 71 },
    availability: "available",
    publicationStatus: "demo_pending_review",
    assets: {},
    instructions: ["انظر إلى المشهد، واختر الشيء الذي يكمله."],
    items: [
      {
        id: "garden-flower",
        label: "زهرة الحديقة",
        sceneAsset: "/activities/scene-completion/scenes/garden.svg",
        prompt: "ماذا نزرع في الحديقة؟",
        correctChoiceId: "flower",
        choices: [
          {
            id: "flower",
            label: "زهرة",
            imageAsset: "/activities/scene-completion/objects/flower.svg",
          },
          {
            id: "ball",
            label: "كُرَة",
            imageAsset: "/activities/picture-cards-audio/images/ball.svg",
          },
          {
            id: "pillow",
            label: "وسادة",
            imageAsset: "/activities/scene-completion/objects/pillow.svg",
          },
        ],
      },
      {
        id: "bedroom-pillow",
        label: "وسادة السرير",
        sceneAsset: "/activities/scene-completion/scenes/bedroom.svg",
        prompt: "ماذا نضع على السرير لنرتاح؟",
        correctChoiceId: "pillow",
        choices: [
          {
            id: "sun",
            label: "شَمْس",
            imageAsset: "/activities/picture-cards-audio/images/sun.svg",
          },
          {
            id: "pillow",
            label: "وسادة",
            imageAsset: "/activities/scene-completion/objects/pillow.svg",
          },
          {
            id: "flower",
            label: "زهرة",
            imageAsset: "/activities/scene-completion/objects/flower.svg",
          },
        ],
      },
    ],
  },
];

export function findAvailableActivity(id: string): ActivityDefinition | undefined {
  return activityCatalog.find(
    (activity) => activity.id === id && activity.availability === "available",
  );
}

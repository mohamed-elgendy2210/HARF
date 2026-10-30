const games = [
  {
    id: 'first-letter-trial',
    template: 'multiple-choice',
    title: 'رحلة الحرف الأول',
    description: 'اختر الصوت الذي تبدأ به كل كلمة.',
    companion: 'لولو السلحفاة',
    companionAnimal: '🐢',
    access: 'trial',
    version: '1',
    instructions: 'استمع إلى الكلمة، ثم اختر الحرف الذي تسمعه في بدايتها.',
    questions: [
      { prompt: 'بأي حرف تبدأ كلمة «قمر»؟', options: ['ق', 'م', 'س'], correctAnswerIndex: 0 },
      { prompt: 'بأي حرف تبدأ كلمة «باب»؟', options: ['ن', 'ب', 'ت'], correctAnswerIndex: 1 },
      { prompt: 'بأي حرف تبدأ كلمة «تفاحة»؟', options: ['ف', 'ل', 'ت'], correctAnswerIndex: 2 }
    ]
  },
  {
    id: 'word-sounds',
    template: 'multiple-choice',
    title: 'فقاعات الأصوات',
    description: 'ميّز الحروف في كلمات مألوفة خطوة بخطوة.',
    companion: 'فلفول الثعلب',
    companionAnimal: '🦊',
    access: 'parent',
    version: '1',
    instructions: 'اقرأ الكلمة واختر الحرف الذي تسمعه في أولها.',
    questions: [
      { prompt: 'ما أول حرف في «موز»؟', options: ['م', 'و', 'ز'], correctAnswerIndex: 0 },
      { prompt: 'ما أول حرف في «أسد»؟', options: ['د', 'أ', 'س'], correctAnswerIndex: 1 },
      { prompt: 'ما أول حرف في «سمكة»؟', options: ['ك', 'م', 'س'], correctAnswerIndex: 2 },
      { prompt: 'ما أول حرف في «ورد»؟', options: ['و', 'ر', 'د'], correctAnswerIndex: 0 }
    ]
  },
  {
    id: 'word-match',
    template: 'multiple-choice',
    title: 'صندوق الكلمات',
    description: 'ابحث عن الكلمة التي تبدأ بالحرف المطلوب.',
    companion: 'بندق الباندا',
    companionAnimal: '🐼',
    access: 'parent',
    version: '1',
    instructions: 'شاهد الحرف في السؤال، ثم اختر الكلمة التي تبدأ به.',
    questions: [
      { prompt: 'اختر الكلمة التي تبدأ بحرف «ج».', options: ['جمل', 'قلم', 'بيت'], correctAnswerIndex: 0 },
      { prompt: 'اختر الكلمة التي تبدأ بحرف «س».', options: ['تمر', 'سمكة', 'موز'], correctAnswerIndex: 1 },
      { prompt: 'اختر الكلمة التي تبدأ بحرف «ن».', options: ['ورد', 'باب', 'نجم'], correctAnswerIndex: 2 },
      { prompt: 'اختر الكلمة التي تبدأ بحرف «ك».', options: ['كتاب', 'تفاح', 'قمر'], correctAnswerIndex: 0 }
    ]
  },
  {
    id: 'matching-pairs',
    template: 'matching-pairs',
    title: 'لعبة توصيل الصور',
    description: 'اختر الصورة التي تطابق الكلمة، وتدرّب على الربط بين الكلمات والصور.',
    companion: 'لوزة القطة',
    companionAnimal: '🐱',
    access: 'parent',
    version: '1',
    instructions: 'اختر الصورة المناسبة للكلمة. يمكنك المحاولة بهدوء، وكل جولة فرصة جديدة.',
    questions: [
      { prompt: 'أين صورة القطة؟', options: ['قطة', 'كلب', 'سمكة'], correctAnswerIndex: 0 },
      { prompt: 'أين صورة التفاحة؟', options: ['موزة', 'تفاحة', 'برتقالة'], correctAnswerIndex: 1 },
      { prompt: 'أين صورة السيارة؟', options: ['طائرة', 'قطار', 'سيارة'], correctAnswerIndex: 2 },
      { prompt: 'أين صورة الكرة؟', options: ['كرة', 'كتاب', 'كوب'], correctAnswerIndex: 0 }
    ]
  },
  {
    id: 'animal-sounds',
    template: 'audio-choice',
    title: 'اسمع صوت الحيوان',
    description: 'استمع إلى صوت الحيوان، ثم اختر صورته من بين الاختيارات.',
    companion: 'لولو السلحفاة',
    companionAnimal: '🐢',
    access: 'parent',
    version: '1',
    instructions: 'اضغط زر الاستماع، ثم اختر صورة الحيوان الذي سمعت صوته. يمكنك إعادة الصوت.',
    questions: [
      { prompt: 'من صاحب هذا الصوت؟', options: ['قطة', 'كلب', 'بطة'], correctAnswerIndex: 0 },
      { prompt: 'من صاحب هذا الصوت؟', options: ['حصان', 'بقرة', 'خروف'], correctAnswerIndex: 1 },
      { prompt: 'من صاحب هذا الصوت؟', options: ['عصفور', 'أسد', 'بطة'], correctAnswerIndex: 2 },
      { prompt: 'من صاحب هذا الصوت؟', options: ['أسد', 'قطة', 'حصان'], correctAnswerIndex: 0 }
    ]
  }
];

export function listGames() {
  return games.map(({ id, template, title, description, companion, companionAnimal, access, version, questions }) => ({
    id,
    template,
    title,
    description,
    companion,
    companionAnimal,
    access,
    version,
    questionCount: questions.length
  }));
}

export function getGame(gameId) {
  return games.find((game) => game.id === gameId) ?? null;
}

export function getPlayableGame(gameId) {
  const game = getGame(gameId);
  if (!game) return null;
  return {
    ...listGames().find(({ id }) => id === game.id),
    template: game.template ?? 'multiple-choice',
    instructions: game.instructions,
    questions: game.questions.map(({ prompt, options }) => ({ prompt, options }))
  };
}

export function scoreGame(game, answers) {
  const matchedItems = new Set();
  return game.questions.reduce((correctCount, question, index) => {
    if (answers[index] !== question.correctAnswerIndex) return correctCount;
    if (game.template !== 'matching-pairs') return correctCount + 1;
    const matchedItem = question.options[answers[index]];
    if (matchedItems.has(matchedItem)) return correctCount;
    matchedItems.add(matchedItem);
    return correctCount + 1;
  }, 0);
}

export const initialQuestionnaire = {
  maxAssignments: 2,
  questions: [
    {
      id: 'communication-preference',
      text: 'كيف يتواصل طفلك غالبًا؟',
      helpText: 'اختيارك يساعدنا على اقتراح أنشطة مناسبة، وليس تقييمًا لمستوى الطفل.',
      type: 'single',
      required: true,
      options: [
        { id: 'communication-sounds-words', label: 'إشارات أو أصوات أو كلمات قليلة', skillIds: ['communication', 'vocabulary'] },
        { id: 'communication-words', label: 'كلمات منفردة', skillIds: ['communication', 'vocabulary'] },
        { id: 'communication-sentences', label: 'جمل قصيرة أو كاملة', skillIds: ['communication', 'expression'] },
        { id: 'communication-varies', label: 'يختلف حسب الموقف', skillIds: ['communication'] },
        { id: 'communication-unsure', label: 'غير متأكد', skillIds: [] }
      ]
    },
    {
      id: 'instruction-preference',
      text: 'كيف يتعامل طفلك مع التعليمات البسيطة؟',
      helpText: '',
      type: 'single',
      required: true,
      options: [
        { id: 'instructions-visual', label: 'يستفيد من التعليمات القصيرة المصحوبة بالصور أو الإشارات', skillIds: ['listening', 'visual-recognition'] },
        { id: 'instructions-simple', label: 'يتبع تعليمات بسيطة غالبًا', skillIds: ['listening'] },
        { id: 'instructions-two-steps', label: 'يستطيع اتباع تعليمات من خطوتين', skillIds: ['listening', 'attention'] },
        { id: 'instructions-unsure', label: 'غير متأكد', skillIds: [] }
      ]
    },
    {
      id: 'learning-goals',
      text: 'ما المهارات التي ترغب في تنميتها؟',
      helpText: 'يمكن اختيار أكثر من هدف.',
      type: 'multiple',
      required: true,
      options: [
        { id: 'goal-listening', label: 'الاستماع وفهم التعليمات', skillIds: ['listening'] },
        { id: 'goal-vocabulary', label: 'التعرف على الأشياء وزيادة المفردات', skillIds: ['vocabulary', 'visual-recognition'] },
        { id: 'goal-expression', label: 'التعبير عن الاحتياجات والأفكار', skillIds: ['expression', 'communication'] },
        { id: 'goal-sounds', label: 'الوعي بالأصوات والكلمات', skillIds: ['sound-awareness'] },
        { id: 'goal-attention', label: 'الانتباه والتفاعل', skillIds: ['attention'] }
      ]
    },
    {
      id: 'interaction-preference',
      text: 'ما أسلوب التعلّم الذي يفضله طفلك؟',
      helpText: 'التفضيل يساعد على اختيار أنشطة مناسبة ولا يدل على القدرة أو عدمها.',
      type: 'single',
      required: true,
      options: [
        { id: 'style-visual', label: 'الصور والتعرف البصري', skillIds: ['visual-recognition'] },
        { id: 'style-audio', label: 'الأصوات والاستماع', skillIds: ['listening', 'sound-awareness'] },
        { id: 'style-interactive', label: 'الألعاب التفاعلية', skillIds: ['attention'] },
        { id: 'style-mixed', label: 'مزيج من الأساليب', skillIds: ['visual-recognition', 'listening', 'attention'] }
      ]
    }
  ]
};

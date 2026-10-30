import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import BrandLogo from './components/BrandLogo.jsx';
import AuthPanel from './components/AuthPanel.jsx';
import { apiRequest, getApiUrl } from './lib/api.js';
import SpecialistCard from './components/SpecialistCard.jsx';

const GamesPage = lazy(() => import('./components/games/GamesPage.jsx'));
const defaultPlatformSettings = {
  logoUrl: null,
  colors: {
    primary: '#3B4CCA',
    teal: '#22C7A7',
    purple: '#8B6CF6',
    yellow: '#FFC857',
    coral: '#FF7B7B',
    ink: '#273DA8',
    muted: '#7884B5'
  },
  homepage: {
    eyebrow: 'منصة تفاعلية لتنمية مهارات التخاطب واللغة',
    title: 'معًا .. ننطق\nالمستقبل',
    description: 'ألعاب وقصص صغيرة تساعد طفلك على نطق الحروف والكلمات بثقة، خطوة بخطوة، في كل مرة بداية لقصة أجمل.',
    primaryAction: 'جرّب اللعبة المجانية',
    secondaryAction: 'شوف الفكرة'
  },
  heroImages: []
};

function platformBrandStyle(settings) {
  return {
    '--blue': settings.colors.primary,
    '--teal': settings.colors.teal,
    '--purple': settings.colors.purple,
    '--yellow': settings.colors.yellow,
    '--coral': settings.colors.coral,
    '--ink': settings.colors.ink ?? '#273DA8',
    '--muted': settings.colors.muted ?? '#7884B5'
  };
}

const steps = [
  {
    number: '١',
    title: 'اختار الحروف',
    description: 'يبدأ حرف بحرف واحد واضح من غير استعجال.'
  },
  {
    number: '٢',
    title: 'اسمع وانطق',
    description: 'يسمع الطفل النطق الصحيح ويجرب بنفسه مع التشجيع.'
  },
  {
    number: '٣',
    title: 'اكسب نجمة',
    description: 'كل محاولة تستحق التشجيع والنجوم تجمعها مع التقدم.'
  }
];

const skills = [
  { letter: 'ا', title: 'نطق الحروف', description: 'تمييز مرئي بين الحروف التي نلعبها كل يوم.' },
  { letter: 'م', title: 'مفردات جديدة', description: 'كلمات من حياة الطفل اليومية بالحروف والصور.' },
  { letter: 'ج', title: 'تكوين الجمل', description: 'ينتقل من الكلمات المفردة لجمل بسيطة.' },
  { letter: 'ق', title: 'قصص تفاعلية', description: 'قصص قصيرة يشارك فيها الطفل بنفسه.' },
  { letter: 'س', title: 'استماع وانتباه', description: 'ألعاب تساعد الطفل على التركيز والاستماع.' },
  { letter: 'ت', title: 'متابعة التقدم', description: 'نرى خطوات الطفل التي أنجزها يومًا بعد يوم.' }
];

const questions = [
  {
    question: 'هل حرف معناه جلسات؟',
    answer: 'مناسب للطفل من خلال الألعاب التفاعلية، والمحتوى يتدرج حسب مستوى الطفل.'
  },
  {
    question: 'هل لازم يكون عندي أخصائي تخاطب؟',
    answer: 'لا، الألعاب التعليمية متاحة كمساحة للتدريب المنزلي، وحجز الأخصائي اختياري.'
  },
  {
    question: 'كم يستغرق الطفل في اليوم؟',
    answer: 'اختاروا وقتًا قصيرًا ومريحًا للطفل، ويمكنكم الرجوع للأنشطة وقتما تحبون.'
  },
  {
    question: 'أحتاج جهاز معين؟',
    answer: 'يمكن فتح المنصة من متصفح حديث على الهاتف أو الكمبيوتر.'
  },
  {
    question: 'إزاي أتابع تقدم طفلي؟',
    answer: 'حرف يساعد الأسرة على متابعة الأنشطة التي أكملها الطفل خطوة بخطوة.'
  }
];

function SectionHeading({ eyebrow, title, description }) {
  return (
    <div className="section-heading">
      {eyebrow && <span className="section-heading__eyebrow">{eyebrow}</span>}
      <h2>{title}</h2>
      {description && <p>{description}</p>}
    </div>
  );
}

function Header({ specialistPage = false, settings }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuToggleRef = useRef(null);
  const homeAnchor = (id) => specialistPage ? `/#${id}` : `#${id}`;
  useEffect(() => {
    if (!menuOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        menuToggleRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [menuOpen]);
  return (
    <header className={`site-header${menuOpen ? ' is-menu-open' : ''}`}>
      <BrandLogo compact logoUrl={settings.logoUrl} />
      <div className="header-actions">
        <a className="button button--small button--primary header-cta" href={homeAnchor('plans')}>
          ابدأ دلوقتي
        </a>
        <AuthPanel />
      </div>
      <button
        ref={menuToggleRef}
        type="button"
        className="site-header__menu-toggle"
        aria-label={menuOpen ? 'إغلاق قائمة التنقل' : 'فتح قائمة التنقل'}
        aria-expanded={menuOpen}
        aria-controls="primary-navigation"
        onClick={() => setMenuOpen((open) => !open)}
      >
        <span />
        <span />
        <span />
      </button>
      <nav className="main-nav" id="primary-navigation" aria-label="التنقل الرئيسي">
        <a href={homeAnchor('faq')} onClick={() => setMenuOpen(false)}>أسئلة شائعة</a>
        <a href={homeAnchor('plans')} onClick={() => setMenuOpen(false)}>الأسعار</a>
        <a href={homeAnchor('journey')} onClick={() => setMenuOpen(false)}>ولي الأمر</a>
        <a href={homeAnchor('skills')} onClick={() => setMenuOpen(false)}>المميزات</a>
        <a href={homeAnchor('trial-games')} onClick={() => setMenuOpen(false)}>الألعاب التجريبية</a>
        <a href="/specialists" onClick={() => setMenuOpen(false)}>الأخصائيون</a>
        <a href={homeAnchor('steps')} onClick={() => setMenuOpen(false)}>كيف نشتغل</a>
      </nav>
    </header>
  );
}

function TrialGames() {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    apiRequest('/api/v1/games')
      .then(({ games: catalog }) => {
        if (active) setGames(catalog.filter((game) => game.access === 'trial').slice(0, 4));
      })
      .catch((requestError) => {
        if (active) setError(requestError.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [reloadKey]);

  return (
    <section className="section trial-games-section" id="trial-games">
      <SectionHeading
        eyebrow="ابدأوا مجانًا"
        title="الألعاب التجريبية للزوار"
        description="جرّبوا أربع ألعاب تعليمية قصيرة مجانًا، دون إنشاء حساب أو حجز موعد."
      />
      {loading && <p className="directory-message" role="status">جارٍ تحميل الألعاب…</p>}
      {error && (
        <div className="trial-games-error" role="alert">
          <p>تعذر تحميل الألعاب التجريبية الآن.</p>
          <button type="button" className="button button--small button--outline" onClick={() => {
            setLoading(true);
            setError('');
            setReloadKey((key) => key + 1);
          }}>إعادة المحاولة</button>
        </div>
      )}
      {!loading && !error && games.length > 0 && (
        <div className="trial-games-grid" aria-label="ألعاب تجريبية مجانية">
          {games.map((game) => (
            <article className="game-card game-card--trial" key={game.id}>
              <span className="game-card__animal" aria-hidden="true">{game.companionAnimal}</span>
              <span className="game-card__tag">مجانية للزوار</span>
              <h3>{game.title}</h3>
              <p>{game.description}</p>
              <span className="game-card__meta">{game.questionCount} أسئلة قصيرة · {game.companion}</span>
              <a className="button button--primary" href={`/games/${encodeURIComponent(game.id)}`}>جرّب اللعبة</a>
            </article>
          ))}
        </div>
      )}
      {!loading && !error && games.length === 0 && (
        <p className="directory-message">لا توجد ألعاب تجريبية منشورة حاليًا.</p>
      )}
      <a className="trial-games-catalog-link" href="/games">استكشف مكتبة الألعاب ←</a>
    </section>
  );
}

function SpecialistsDirectory() {
  const [specialists, setSpecialists] = useState([]);
  const [loadingSpecialists, setLoadingSpecialists] = useState(true);
  const [error, setError] = useState('');
  const carouselRef = useRef(null);

  useEffect(() => {
    let active = true;
    const loadDirectory = async () => {
      setLoadingSpecialists(true);
      setError('');
      try {
        const { specialists: directory } = await apiRequest('/api/v1/directory/specialists');
        if (!active) return;
        setSpecialists(directory);
      } catch (requestError) {
        if (active) setError(requestError.message);
      } finally {
        if (active) setLoadingSpecialists(false);
      }
    };
    loadDirectory();
    return () => { active = false; };
  }, []);

  return (
    <section className="section section--white" id="specialists">
      <SectionHeading
        title="أخصائيون معتمدون"
        description="تعرف على الأخصائيين المعتمدين، وتحقق من المواعيد المتاحة واحجز عند الحاجة. الحجز اختياري."
      />
      {loadingSpecialists && <p className="directory-message" role="status">جارٍ تحميل الأخصائيين…</p>}
      {error && <p className="directory-message" role="alert">{error}</p>}
      {specialists.length > 0 && (
        <>
          <div
            className={`specialist-grid${specialists.length > 4 ? ' specialist-grid--carousel' : ''}`}
            ref={carouselRef}
            aria-label="دليل الأخصائيين"
            tabIndex={specialists.length > 4 ? 0 : undefined}
          >
            {specialists.map((specialist) => <SpecialistCard specialist={specialist} key={specialist.id} />)}
          </div>
          {specialists.length > 4 && (
            <div className="specialist-carousel-controls" aria-label="التنقل بين الأخصائيين">
              <button type="button" className="button button--small button--outline" aria-label="الأخصائيون السابقون"
                onClick={() => carouselRef.current?.scrollBy({ left: -carouselRef.current.clientWidth * 0.8, behavior: 'smooth' })}>
                السابق
              </button>
              <a className="button button--small button--primary" href="/specialists">عرض جميع الأخصائيين</a>
              <button type="button" className="button button--small button--outline" aria-label="الأخصائيون التاليون"
                onClick={() => carouselRef.current?.scrollBy({ left: carouselRef.current.clientWidth * 0.8, behavior: 'smooth' })}>
                التالي
              </button>
            </div>
          )}
        </>
      )}
      {!loadingSpecialists && !error && specialists.length === 0 && (
        <p className="directory-message">لا توجد ملفات أخصائيين معتمدة ومعلنة حاليًا.</p>
      )}
    </section>
  );
}

function SpecialistsPage({ settings }) {
  const [specialists, setSpecialists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    apiRequest('/api/v1/directory/specialists')
      .then(({ specialists: directory }) => {
        if (active) setSpecialists(directory);
      })
      .catch((requestError) => {
        if (active) setError(requestError.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  return (
    <>
      <a className="skip-link" href="#main">انتقل للمحتوى</a>
      <Header specialistPage settings={settings} />
      <main id="main">
        <section className="section section--white">
          <SectionHeading
            title="جميع الأخصائيين"
            description="تعرّف على الأخصائيين المعتمدين وخيارات المواعيد. حجز الأخصائي خدمة اختيارية."
          />
          {loading && <p className="directory-message" role="status">جارٍ تحميل الأخصائيين…</p>}
          {error && <p className="directory-message" role="alert">{error}</p>}
          {!loading && !error && specialists.length === 0 && (
            <p className="directory-message">لا توجد ملفات أخصائيين معتمدة ومعلنة حاليًا.</p>
          )}
          {specialists.length > 0 && (
            <div className="specialist-grid specialist-grid--all">
              {specialists.map((specialist) => <SpecialistCard specialist={specialist} key={specialist.id} />)}
            </div>
          )}
        </section>
      </main>
      <Footer settings={settings} />
    </>
  );
}

function Hero({ settings }) {
  const { homepage } = settings;
  const [activeImage, setActiveImage] = useState(0);
  const heroImages = settings.heroImages ?? [];

  useEffect(() => {
    setActiveImage((current) => Math.min(current, Math.max(heroImages.length - 1, 0)));
  }, [heroImages.length]);

  useEffect(() => {
    if (heroImages.length < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const timer = window.setInterval(() => {
      setActiveImage((current) => (current + 1) % heroImages.length);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [heroImages.length]);

  const changeImage = (direction) => {
    setActiveImage((current) => (current + direction + heroImages.length) % heroImages.length);
  };

  return (
    <section className="hero" id="home">
      <div className={`hero__art${heroImages.length ? ' hero__art--carousel' : ''}`}
        role={heroImages.length ? 'region' : undefined}
        aria-roledescription={heroImages.length ? 'عارض صور' : undefined}
        aria-label={heroImages.length ? 'صور منصة حرف' : undefined}>
        {heroImages.length ? (
          <>
            <div className="hero-carousel__slides" aria-live="off">
              {heroImages.map((image, index) => (
                <img
                  key={image.id}
                  className={`hero-carousel__image${index === activeImage ? ' is-active' : ''}`}
                  src={getApiUrl(image.url)}
                  alt={image.altText || ''}
                  aria-hidden={index !== activeImage}
                />
              ))}
            </div>
            {heroImages.length > 1 && (
              <>
                <button className="hero-carousel__arrow hero-carousel__arrow--previous" type="button"
                  aria-label="الصورة السابقة" onClick={() => changeImage(-1)}>‹</button>
                <button className="hero-carousel__arrow hero-carousel__arrow--next" type="button"
                  aria-label="الصورة التالية" onClick={() => changeImage(1)}>›</button>
                <div className="hero-carousel__dots" aria-label="اختيار صورة">
                  {heroImages.map((image, index) => (
                    <button key={image.id} type="button"
                      className={`hero-carousel__dot${index === activeImage ? ' is-active' : ''}`}
                      aria-label={`عرض الصورة ${index + 1}`}
                      aria-current={index === activeImage ? 'true' : undefined}
                      onClick={() => setActiveImage(index)} />
                  ))}
                </div>
              </>
            )}
          </>
        ) : (
          <>
            <BrandLogo compact logoUrl={settings.logoUrl} />
            <span className="hero__spark hero__spark--one" aria-hidden="true">✦</span>
            <span className="hero__spark hero__spark--two" aria-hidden="true">✦</span>
          </>
        )}
      </div>
      <div className="hero__content">
        <span className="pill">{homepage.eyebrow}</span>
        <h1>{homepage.title}</h1>
        <p>{homepage.description}</p>
        <div className="hero__actions">
          <a className="button button--primary" href="/games/first-letter-trial">{homepage.primaryAction}</a>
          <a className="button button--outline" href="#journey">{homepage.secondaryAction}</a>
        </div>
      </div>
    </section>
  );
}

function Steps() {
  return (
    <section className="section section--white" id="steps">
      <SectionHeading title="ثلاث خطوات في كل لعبة" description="بسيطة وقصيرة تناسب انتباه الطفل" />
      <div className="step-grid">
        {steps.map((step, index) => (
          <article className="step-card" key={step.number}>
            <span className={`number-badge number-badge--${index + 1}`}>{step.number}</span>
            <h3>{step.title}</h3>
            <p>{step.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function Skills() {
  return (
    <section className="section section--soft" id="skills">
      <SectionHeading title="إيه اللي بنقدمه حرف؟" description="مهارات التخاطب واللغة في مكان واحد" />
      <div className="skill-grid">
        {skills.map((skill, index) => (
          <article className="skill-card" key={skill.title}>
            <span className={`skill-card__icon skill-card__icon--${index + 1}`} aria-hidden="true">
              {skill.letter}
            </span>
            <h3>{skill.title}</h3>
            <p>{skill.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function Journey() {
  return (
    <section className="journey" id="journey">
      <div className="journey__content">
        <span className="journey__label">معًا خطوة بخطوة</span>
        <h2>ولي الأمر: تابع من غير تعقيد</h2>
        <p>حرف يصمم خطوات تعليمية تفاعلية في البيت، ويساعدك على تتبع التقدم بأمان.</p>
        <ul>
          <li>خطوات صغيرة تناسب انتباه الطفل</li>
          <li>تعلم مرن حسب مستوى الطفل</li>
          <li>وقت ممتع للعائلة في صفحة واحدة</li>
        </ul>
      </div>
      <div className="progress-card" aria-label="مثال توضيحي لتقدم الطفل">
        <div className="progress-card__top">
          <span className="progress-card__animal" aria-hidden="true">🐳</span>
          <div>
            <span className="progress-card__caption">مثال توضيحي</span>
            <strong>حرف اليوم: ب</strong>
          </div>
        </div>
        <div className="progress-card__stars" aria-hidden="true">
          <span>☆</span><span>☆</span><span>★</span><span>★</span><span>★</span>
        </div>
        <p>٢ من ٣ خطوات — مثال توضيحي</p>
      </div>
    </section>
  );
}

function Plans() {
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [planError, setPlanError] = useState(false);

  useEffect(() => {
    let active = true;
    apiRequest('/api/v1/payments/plan')
      .then(({ plan: currentPlan }) => {
        if (active) setPlan(currentPlan);
      })
      .catch(() => {
        if (active) setPlanError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const monthlyPrice = plan?.configured
    ? new Intl.NumberFormat('ar-EG', {
        style: 'currency',
        currency: plan.currency,
        maximumFractionDigits: 2
      }).format(plan.amountMinor / 100)
    : loading ? 'جارٍ تحميل السعر…' : planError ? 'تعذر تحميل السعر الحالي' : 'السعر يُعلن قريبًا';
  const annualPrice = plan?.annualAmountMinor
    ? new Intl.NumberFormat('ar-EG', {
        style: 'currency',
        currency: plan.currency,
        maximumFractionDigits: 2
      }).format(plan.annualAmountMinor / 100)
    : null;

  return (
    <section className="section section--soft" id="plans">
      <SectionHeading title="اختار الباقة المناسبة" description="أسعار الاشتراكات الحالية يحددها مسؤول المنصة" />
      <div className="plan-grid">
        <article className="plan-card">
          <h3>تجريبية</h3>
          <p className="plan-card__price">مجانية</p>
          <ul><li>لعبة تجريبية واحدة</li><li>بدون اشتراك</li><li>لا تحفظ بيانات شخصية</li></ul>
          <a className="button button--small button--outline" href="/games/first-letter-trial">جرّب</a>
        </article>
        <article className="plan-card plan-card--featured">
          <h3>اشتراك شهري</h3>
          <p className="plan-card__price" aria-live="polite">{monthlyPrice}</p>
          <ul><li>الوصول للألعاب المنشورة</li><li>مسار تعلّم متدرج</li><li>متابعة أنشطة الأسرة</li></ul>
          <a className="button button--small button--yellow" href="/dashboard?section=payments&period=monthly">اشترك شهريًا</a>
        </article>
        {annualPrice && (
          <article className="plan-card plan-card--annual">
            <h3>اشتراك سنوي</h3>
            <p className="plan-card__price">{annualPrice}</p>
            <ul><li>اشتراك لمدة ١٢ شهرًا</li><li>الوصول للألعاب المنشورة</li><li>مسار تعلّم ومتابعة الأسرة</li></ul>
            <a className="button button--small button--yellow" href="/dashboard?section=payments&period=annual">اشترك سنويًا</a>
          </article>
        )}
      </div>
    </section>
  );
}

function Testimonials() {
  const [testimonials, setTestimonials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    apiRequest('/api/v1/testimonials')
      .then(({ testimonials: approvedTestimonials }) => {
        if (active) setTestimonials(approvedTestimonials);
      })
      .catch((requestError) => {
        if (active) setError(requestError.message || 'تعذر تحميل آراء أولياء الأمور.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  return (
    <section className="section section--white" id="testimonials">
      <SectionHeading title="آراء أولياء الأمور" description="تجارب حقيقية شاركها أولياء الأمور بعد مراجعتها واعتمادها." />
      {loading && <p className="dashboard-loading" role="status">جارٍ تحميل الآراء…</p>}
      {error && <p className="dashboard-empty-state" role="status">{error}</p>}
      {!loading && !error && testimonials.length > 0 && <div className="testimonial-grid">
        {testimonials.map((item) => (
          <article className="testimonial-card" key={item.id}>
            <span aria-hidden="true">♡ تجربة ولي أمر</span>
            <p>«{item.quote}»</p>
            <strong>{item.displayName}</strong>
          </article>
        ))}
      </div>}
      {!loading && !error && testimonials.length === 0 && (
        <div className="testimonial-empty-state">
          <span aria-hidden="true">♡</span>
          <p>سيُعرض هنا ما يشاركه أولياء الأمور بعد مراجعة الإدارة.</p>
        </div>
      )}
    </section>
  );
}

function Questions() {
  return (
    <section className="section section--soft faq" id="faq">
      <SectionHeading title="أسئلة شائعة" description="إجابات تهمك قبل ما نبدأ" />
      <div className="faq-list">
        {questions.map((item, index) => (
          <details className="faq-item" key={item.question} open={index === 0}>
            <summary>{item.question}</summary>
            <p>{item.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function CallToAction() {
  return (
    <section className="cta" id="start">
      <h2>جاهز نبدأ أول كلمة؟</h2>
      <p>تعرف على خطوات اللعب والتعلم مع حرف</p>
      <a className="button button--yellow" href="#steps">استكشف الخطوات</a>
    </section>
  );
}

function Footer({ settings }) {
  return (
    <footer className="site-footer">
      <div className="site-footer__brand">
        <BrandLogo logoUrl={settings.logoUrl} />
        <span>لأن كل كلمة بداية لقصة أجمل</span>
      </div>
      <nav aria-label="روابط السياسات">
        <a href="#faq">الأسئلة الشائعة</a>
        <a href="#plans">الباقات</a>
        <a href="#home">تواصل معنا</a>
      </nav>
    </footer>
  );
}

export default function App() {
  const [portalRoute, setPortalRoute] = useState(() => window.location.pathname);
  const [platformSettings, setPlatformSettings] = useState(defaultPlatformSettings);
  const [platformSettingsError, setPlatformSettingsError] = useState('');
  const [platformSettingsLoaded, setPlatformSettingsLoaded] = useState(false);

  useEffect(() => {
    const updateRoute = () => setPortalRoute(window.location.pathname);
    window.addEventListener('popstate', updateRoute);
    return () => window.removeEventListener('popstate', updateRoute);
  }, []);

  useEffect(() => {
    let active = true;
    apiRequest('/api/v1/platform/settings')
      .then(({ settings }) => {
        if (active) {
          setPlatformSettings(settings);
          setPlatformSettingsError('');
        }
      })
      .catch((requestError) => {
        if (active) {
          setPlatformSettings(defaultPlatformSettings);
          setPlatformSettingsError(requestError.message || 'تعذر تحميل إعدادات هوية المنصة.');
        }
      })
      .finally(() => {
        if (active) setPlatformSettingsLoaded(true);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (portalRoute !== '/') {
      document.title = 'حرف — معًا ننطق المستقبل';
      document.querySelector('meta[name="description"]')?.setAttribute(
        'content',
        'حرف، منصة تفاعلية لتنمية مهارات التخاطب واللغة لدى الأطفال.'
      );
      const isGameCatalog = portalRoute.replace(/\/+$/, '') === '/games';
      document.querySelector('meta[name="theme-color"]')?.setAttribute(
        'content',
        isGameCatalog ? platformSettings.colors.primary : '#f9fafb'
      );
      return;
    }
    document.title = `${platformSettings.homepage.title.replace(/\s+/g, ' ').trim()} — حرف`;
    document.querySelector('meta[name="description"]')?.setAttribute('content', platformSettings.homepage.description);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', platformSettings.colors.primary);
  }, [portalRoute, platformSettings]);

  const brandStyle = platformBrandStyle(platformSettings);
  const platformWarning = platformSettingsError
    ? <p className="platform-settings-warning" role="status">يتم عرض الهوية الافتراضية مؤقتًا. {platformSettingsError}</p>
    : null;
  if (!platformSettingsLoaded) {
    return <main className="platform-settings-loading" aria-busy="true">
      <p role="status">جارٍ تجهيز المنصة…</p>
    </main>;
  }
  if (portalRoute === '/dashboard') return <div className="platform-brand" style={brandStyle}>{platformWarning}<AuthPanel standaloneDashboard logoUrl={platformSettings.logoUrl} /></div>;
  if (portalRoute === '/admin') return <div className="platform-brand" style={brandStyle}>{platformWarning}<AuthPanel standaloneAdmin logoUrl={platformSettings.logoUrl} /></div>;
  if (portalRoute === '/specialist') return <div className="platform-brand" style={brandStyle}>{platformWarning}<AuthPanel standaloneSpecialist logoUrl={platformSettings.logoUrl} /></div>;
  if (portalRoute === '/specialists') return <div className="platform-brand" style={brandStyle}>{platformWarning}<SpecialistsPage settings={platformSettings} /></div>;
  if (portalRoute === '/games' || portalRoute.startsWith('/games/')) {
    return (
      <Suspense fallback={<main className="game-page"><p className="dashboard-loading" role="status">جارٍ تجهيز الألعاب…</p></main>}>
        <GamesPage settings={platformSettings} />
      </Suspense>
    );
  }

  return (
    <div className="platform-brand" style={brandStyle}>
      {platformWarning}
      <a className="skip-link" href="#main">انتقل للمحتوى</a>
      <Header settings={platformSettings} />
      <main id="main">
        <Hero settings={platformSettings} />
        <TrialGames />
        <Steps />
        <Skills />
        <SpecialistsDirectory />
        <Journey />
        <Plans />
        <Testimonials />
        <Questions />
        <CallToAction />
      </main>
      <Footer settings={platformSettings} />
    </div>
  );
}

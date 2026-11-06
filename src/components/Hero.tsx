// ヒーロー全体：スクロール固定（sticky）の 3D キャンバスと、進行度に応じて切り替わるコピー。
// 高さ 300vh のセクションをスクロールする間に SpaceTree のカメラが一周する。
import { useEffect, useRef, useState } from 'react';
import SpaceTree, { type TreeCategory } from './SpaceTree';

interface Props {
  categories: TreeCategory[];
  siteName: string;
  tagline: string;
}

const STEPS = [
  { at: 0.0, title: 'ひとつの星系に、ぜんぶ。', body: 'ゲーム、アプリ、動画、コミュニティ。作ったものを一か所に。' },
  { at: 0.3, title: 'カテゴリは惑星。', body: '惑星の周りを回る衛星が、ひとつひとつの成果物です。' },
  { at: 0.6, title: '公開したものだけが光る。', body: '管理側でスイッチを入れた瞬間に、この星系に現れます。' },
  { at: 0.9, title: '惑星をクリックして探索。', body: 'ドラッグで回転できます。下にスクロールすると一覧へ。' },
];

export default function Hero({ categories, siteName, tagline }: Props) {
  const section = useRef<HTMLElement>(null);
  const progressRef = useRef(0);
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const el = section.current;
    if (!el) return;
    let raf = 0;
    const update = () => {
      const rect = el.getBoundingClientRect();
      const scrollable = el.offsetHeight - window.innerHeight;
      const p = scrollable > 0 ? Math.min(1, Math.max(0, -rect.top / scrollable)) : 1;
      progressRef.current = p;
      let s = 0;
      for (let i = 0; i < STEPS.length; i++) if (p >= STEPS[i].at) s = i;
      setStep(s);
      setDone(p >= 1);
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <section ref={section} className="hero">
      <div className="hero-sticky">
        <div className="hero-canvas">
          <SpaceTree categories={categories} progressRef={progressRef} />
        </div>
        <header className="hero-top container">
          <a className="brand" href="/">
            {siteName}
          </a>
          <nav>
            {categories.map((c) => (
              <a key={c.slug} href={`#cat-${c.slug}`}>
                {c.name}
              </a>
            ))}
          </nav>
        </header>
        <div className="hero-copy container" aria-live="polite">
          <p className="eyebrow">{tagline}</p>
          <h1 key={step} className="fade-in">
            {STEPS[step].title}
          </h1>
          <p key={`b${step}`} className="lead fade-in">
            {STEPS[step].body}
          </p>
          <div className={`scroll-hint${done ? ' is-hidden' : ''}`}>
            <span />
            スクロールで一周
          </div>
        </div>
      </div>
    </section>
  );
}

// 公開ページのヒーロー：明るい宇宙に浮かぶ「成果物ツリー」。
// - 中心の恒星 = 83Products
// - 各カテゴリ = 周回する惑星（公開アイテム数で大きさが変わる）
// - 各アイテム = 惑星の周りを回る小さな衛星
// - 最初はスクロールに合わせてカメラが系全体を一周し（B 案のギミック）、
//   一周し終えたら自由に回せる。惑星クリックで該当カテゴリへスクロール。
import { useMemo, useRef, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html, Line, OrbitControls, Sparkles } from '@react-three/drei';
import type { Group, Mesh } from 'three';
import { Color, Vector3 } from 'three';

export interface TreeCategory {
  slug: string;
  name: string;
  color: string;
  items: { slug: string; title: string }[];
}

interface Props {
  categories: TreeCategory[];
  /** スクロール進行度 0..1 を外から渡す（1 で一周完了） */
  progressRef: { current: number };
}

const ORBIT_RADIUS = 4.2;

function Planet({
  category,
  angle,
  onSelect,
}: {
  category: TreeCategory;
  angle: number;
  onSelect: (slug: string) => void;
}) {
  const group = useRef<Group>(null!);
  const mesh = useRef<Mesh>(null!);
  const [hover, setHover] = useState(false);
  const size = 0.32 + Math.min(category.items.length, 8) * 0.05;
  const position = useMemo(
    () => new Vector3(Math.cos(angle) * ORBIT_RADIUS, Math.sin(angle * 2) * 0.35, Math.sin(angle) * ORBIT_RADIUS),
    [angle],
  );
  const color = useMemo(() => new Color(category.color), [category.color]);

  useFrame((state, dt) => {
    group.current.rotation.y += dt * 0.6;
    const target = hover ? 1.18 : 1;
    mesh.current.scale.lerp(new Vector3(target, target, target), 0.15);
    void state;
  });

  return (
    <group position={position}>
      <mesh
        ref={mesh}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(category.slug);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHover(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          setHover(false);
          document.body.style.cursor = '';
        }}
      >
        <sphereGeometry args={[size, 48, 48]} />
        <meshStandardMaterial color={color} roughness={0.35} metalness={0.1} emissive={color} emissiveIntensity={hover ? 0.35 : 0.12} />
      </mesh>
      {/* 衛星 = アイテム */}
      <group ref={group}>
        {category.items.map((item, i) => {
          const a = (i / Math.max(category.items.length, 1)) * Math.PI * 2;
          const r = size + 0.35 + (i % 2) * 0.12;
          return (
            <mesh key={item.slug} position={[Math.cos(a) * r, (i % 3) * 0.06 - 0.06, Math.sin(a) * r]}>
              <sphereGeometry args={[0.055, 16, 16]} />
              <meshStandardMaterial color="#ffffff" emissive={color} emissiveIntensity={0.6} />
            </mesh>
          );
        })}
      </group>
      <Html center distanceFactor={9} style={{ pointerEvents: 'none', transform: `translateY(${-size * 60 - 28}px)` }}>
        <div className={`planet-label${hover ? ' is-hover' : ''}`}>
          <span className="dot" style={{ background: category.color }} />
          {category.name}
          <small>{category.items.length}</small>
        </div>
      </Html>
    </group>
  );
}

function Sun() {
  const mesh = useRef<Mesh>(null!);
  useFrame((_, dt) => {
    mesh.current.rotation.y += dt * 0.15;
  });
  return (
    <group>
      <mesh ref={mesh}>
        <icosahedronGeometry args={[0.95, 3]} />
        <meshStandardMaterial color="#ffffff" emissive="#ffe9b3" emissiveIntensity={0.9} roughness={0.2} flatShading />
      </mesh>
      <mesh scale={1.35}>
        <sphereGeometry args={[0.95, 32, 32]} />
        <meshBasicMaterial color="#ffd27a" transparent opacity={0.12} />
      </mesh>
    </group>
  );
}

function Rig({ progressRef, controls }: { progressRef: { current: number }; controls: React.MutableRefObject<any> }) {
  useFrame(({ camera }) => {
    const p = progressRef.current;
    if (p < 1) {
      // スクロールで一周：角度 0 → 2π、カメラは少し高い位置から俯瞰 → 水平へ
      const theta = p * Math.PI * 2 - Math.PI / 2;
      const radius = 9.5 - p * 1.5;
      const height = 5.5 - p * 3.2;
      camera.position.set(Math.cos(theta) * radius, height, Math.sin(theta) * radius);
      camera.lookAt(0, 0, 0);
      if (controls.current) controls.current.enabled = false;
    } else if (controls.current && !controls.current.enabled) {
      controls.current.enabled = true;
      controls.current.update();
    }
  });
  return null;
}

export default function SpaceTree({ categories, progressRef }: Props) {
  const controls = useRef<any>(null);
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);

  const onSelect = (slug: string) => {
    document.getElementById(`cat-${slug}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const orbitPoints = useMemo(() => {
    const pts: [number, number, number][] = [];
    for (let i = 0; i <= 96; i++) {
      const a = (i / 96) * Math.PI * 2;
      pts.push([Math.cos(a) * ORBIT_RADIUS, Math.sin(a * 2) * 0.35, Math.sin(a) * ORBIT_RADIUS]);
    }
    return pts;
  }, []);

  return (
    <Canvas
      dpr={[1, 1.75]}
      camera={{ position: [0, 5.5, 9.5], fov: 42 }}
      gl={{ antialias: true, alpha: true }}
      style={{ background: 'transparent' }}
    >
      <ambientLight intensity={1.1} />
      <directionalLight position={[6, 8, 4]} intensity={1.6} color="#fff6e5" />
      <directionalLight position={[-6, -2, -4]} intensity={0.5} color="#cfd8ff" />

      {!reduced && <Sparkles count={160} scale={[22, 10, 22]} size={2.2} speed={0.25} color="#8a94ff" opacity={0.55} />}
      <Sun />
      <Line points={orbitPoints} color="#5b6cff" transparent opacity={0.22} lineWidth={1} />
      {categories.map((c, i) => (
        <Planet key={c.slug} category={c} angle={(i / Math.max(categories.length, 1)) * Math.PI * 2} onSelect={onSelect} />
      ))}

      <Rig progressRef={progressRef} controls={controls} />
      <OrbitControls ref={controls} enablePan={false} enableZoom={false} autoRotate={!reduced} autoRotateSpeed={0.6} minPolarAngle={0.9} maxPolarAngle={1.5} />
    </Canvas>
  );
}

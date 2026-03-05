"use client";

import { Suspense, useRef, useEffect, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  ContactShadows,
  Environment,
  useFBX,
  useAnimations,
} from "@react-three/drei";
import * as THREE from "three";

const RALLY_PERIOD = 4;

// ─── Kicker (left) — synced to first half of rally ───────────────────
function Kicker({
  position,
  rotation,
  scale = 0.005,
}: {
  position: [number, number, number];
  rotation: [number, number, number];
  scale?: number;
}) {
  const fbx = useFBX("/goalkeeper-drop-kick.fbx");
  const groupRef = useRef<THREE.Group>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const actionRef = useRef<THREE.AnimationAction | null>(null);
  const clipDuration = useRef(1);

  useEffect(() => {
    fbx.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
  }, [fbx]);

  const { mixer, actions } = useAnimations(fbx.animations, groupRef);

  useEffect(() => {
    mixerRef.current = mixer;
    const names = Object.keys(actions);
    if (names.length > 0) {
      const action = actions[names[0]];
      if (action) {
        actionRef.current = action;
        clipDuration.current = action.getClip().duration;
        action.reset().setLoop(THREE.LoopOnce, 1).play();
        action.clampWhenFinished = true;
        action.paused = true;
      }
    }
  }, [mixer, actions]);

  useFrame((state) => {
    if (!actionRef.current || !mixerRef.current) return;
    const t = state.clock.elapsedTime;
    const phase = (t % RALLY_PERIOD) / RALLY_PERIOD;

    // Kicker plays during first half (0 → 0.5): ball goes left→right
    if (phase < 0.5) {
      const progress = phase / 0.5; // 0→1
      actionRef.current.time = progress * clipDuration.current;
    } else {
      // Hold at rest (beginning of clip) while waiting
      actionRef.current.time = 0;
    }
  });

  return (
    <group
      ref={groupRef}
      position={position}
      rotation={rotation}
      scale={[scale, scale, scale]}
    >
      <primitive object={fbx} />
    </group>
  );
}

// ─── Catcher (right) — synced to second half of rally ────────────────
function Catcher({
  position,
  rotation,
  scale = 0.005,
}: {
  position: [number, number, number];
  rotation: [number, number, number];
  scale?: number;
}) {
  const fbx = useFBX("/goalkeeper-catch.fbx");
  const groupRef = useRef<THREE.Group>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const actionRef = useRef<THREE.AnimationAction | null>(null);
  const clipDuration = useRef(1);

  useEffect(() => {
    fbx.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
  }, [fbx]);

  const { mixer, actions } = useAnimations(fbx.animations, groupRef);

  useEffect(() => {
    mixerRef.current = mixer;
    const names = Object.keys(actions);
    if (names.length > 0) {
      const action = actions[names[0]];
      if (action) {
        actionRef.current = action;
        clipDuration.current = action.getClip().duration;
        action.reset().setLoop(THREE.LoopOnce, 1).play();
        action.clampWhenFinished = true;
        action.paused = true;
      }
    }
  }, [mixer, actions]);

  useFrame((state) => {
    if (!actionRef.current || !mixerRef.current) return;
    const t = state.clock.elapsedTime;
    const phase = (t % RALLY_PERIOD) / RALLY_PERIOD;

    // Catcher plays during first half too — anticipation + catch as ball arrives
    // Start the catch animation at 30% of the rally so hands are ready when ball lands
    if (phase >= 0.3 && phase < 0.55) {
      const progress = (phase - 0.3) / 0.25; // 0→1
      actionRef.current.time = progress * clipDuration.current;
    } else if (phase >= 0.55) {
      // Hold at end (caught position) for the rest of the cycle
      actionRef.current.time = clipDuration.current;
    } else {
      // Waiting — hold at rest
      actionRef.current.time = 0;
    }
  });

  return (
    <group
      ref={groupRef}
      position={position}
      rotation={rotation}
      scale={[scale, scale, scale]}
    >
      <primitive object={fbx} />
    </group>
  );
}

// ─── Volleyball ───────────────────────────────────────────────────────
function VolleyballMesh() {
  const ref = useRef<THREE.Mesh>(null);
  const mat = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: new THREE.Color("#FFFFF0"),
        roughness: 0.35,
        clearcoat: 0.4,
        clearcoatRoughness: 0.15,
      }),
    []
  );

  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    const phase = (t % RALLY_PERIOD) / RALLY_PERIOD;

    if (phase < 0.5) {
      // Ball travels from left kicker → right catcher
      const progress = phase / 0.5;
      const x = THREE.MathUtils.lerp(-2.0, 2.0, progress);
      const y = 0.3 + Math.sin(progress * Math.PI) * 0.8;
      ref.current.position.set(x, y, 0);
      ref.current.visible = true;
    } else if (phase < 0.55) {
      // Ball held at catcher briefly
      ref.current.position.set(2.0, 0.3, 0);
      ref.current.visible = true;
    } else {
      // Ball hidden while resetting (catcher throws it back off-screen)
      ref.current.visible = false;
    }

    ref.current.rotation.x += 0.06;
    ref.current.rotation.z += 0.04;
  });

  return (
    <mesh ref={ref} material={mat} castShadow>
      <sphereGeometry args={[0.045, 32, 32]} />
    </mesh>
  );
}

// ─── Scene ────────────────────────────────────────────────────────────
function Scene() {
  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight
        position={[3, 5, 4]}
        intensity={1.5}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <directionalLight position={[-2, 3, -2]} intensity={0.4} color="#B4D4FF" />
      <pointLight position={[0, -1, 2]} intensity={0.15} color="#FFE4C4" />

      {/* Left Player — kicks the ball */}
      <Kicker
        position={[-2.5, -1.2, 0]}
        rotation={[0, Math.PI * 0.3, 0]}
        scale={0.005}
      />

      {/* Right Player — waits then catches */}
      <Catcher
        position={[2.5, -1.2, 0]}
        rotation={[0, -Math.PI * 0.3, 0]}
        scale={0.005}
      />

      <VolleyballMesh />

      <ContactShadows
        position={[0, -1.2, 0]}
        opacity={0.35}
        scale={8}
        blur={2.5}
        far={4}
      />

      <Environment preset="city" />
    </>
  );
}

// ─── Exported Wrapper ─────────────────────────────────────────────────
export default function VolleyballScene3D() {
  return (
    <div
      className="absolute inset-0 pointer-events-none overflow-hidden"
      style={{ zIndex: 20 }}
    >
      <Canvas
        gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
        camera={{ position: [0, 0.2, 4.5], fov: 35, near: 0.1, far: 50 }}
        shadows
        dpr={[1, 2]}
        style={{ pointerEvents: "none" }}
      >
        <Suspense fallback={null}>
          <Scene />
        </Suspense>
      </Canvas>
    </div>
  );
}

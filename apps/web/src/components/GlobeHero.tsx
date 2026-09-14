import { useEffect, useRef } from "react";
import * as THREE from "three";

export function GlobeHero() {
  const mountRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef(false);
  const pointerRef = useRef({ dragging: false, lastX: 0, lastY: 0 });

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = mount.clientWidth;
    const height = mount.clientHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    // The hero's right column can be narrow on laptop viewports; pull the
    // camera back there so the full globe remains visible instead of clipping.
    camera.position.set(0, 0.6, width < height ? 6.2 : 4.2);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    // Place the dark body first so the animated wireframe remains visible.
    const innerGeo = new THREE.SphereGeometry(1.58, 32, 32);
    const innerMat = new THREE.MeshBasicMaterial({ color: 0x071322, transparent: true, opacity: 0.92 });
    const inner = new THREE.Mesh(innerGeo, innerMat);
    scene.add(inner);

    const globeGeo = new THREE.IcosahedronGeometry(1.62, 3);
    const globeMat = new THREE.MeshBasicMaterial({
      color: 0x39c8ff,
      wireframe: true,
      transparent: true,
      opacity: 0.68,
      depthTest: false,
    });
    const globe = new THREE.Mesh(globeGeo, globeMat);
    globe.renderOrder = 2;
    scene.add(globe);

    const atmosphereGeo = new THREE.SphereGeometry(1.72, 32, 32);
    const atmosphereMat = new THREE.MeshBasicMaterial({
      color: 0x168cff,
      transparent: true,
      opacity: 0.08,
      side: THREE.BackSide,
      depthWrite: false,
    });
    const atmosphere = new THREE.Mesh(atmosphereGeo, atmosphereMat);
    scene.add(atmosphere);

    const orbitGeo = new THREE.TorusGeometry(1.92, 0.008, 8, 128);
    const orbitMat = new THREE.MeshBasicMaterial({ color: 0x00d2ff, transparent: true, opacity: 0.55 });
    const orbit = new THREE.Mesh(orbitGeo, orbitMat);
    orbit.rotation.x = Math.PI * 0.36;
    orbit.renderOrder = 3;
    scene.add(orbit);

    const starGeo = new THREE.BufferGeometry();
    const starPositions = new Float32Array(180 * 3);
    for (let i = 0; i < starPositions.length; i += 3) {
      const radius = 2.8 + Math.random() * 1.8;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      starPositions[i] = radius * Math.sin(phi) * Math.cos(theta);
      starPositions[i + 1] = radius * Math.cos(phi);
      starPositions[i + 2] = radius * Math.sin(phi) * Math.sin(theta);
    }
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({ color: 0x9ddcff, size: 0.012, transparent: true, opacity: 0.7 });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    // scattered points orbiting — a small "satellite constellation"
    const satCount = 40;
    const satGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(satCount * 3);
    const radii: number[] = [];
    const speeds: number[] = [];
    const phases: number[] = [];
    for (let i = 0; i < satCount; i++) {
      radii.push(2.0 + Math.random() * 0.6);
      speeds.push(0.05 + Math.random() * 0.15);
      phases.push(Math.random() * Math.PI * 2);
    }
    satGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const satMat = new THREE.PointsMaterial({ color: 0xe0a53f, size: 0.035 });
    const satellites = new THREE.Points(satGeo, satMat);
    scene.add(satellites);

    let frame = 0;
    let raf = 0;
    const animate = () => {
      frame += 1;
      globe.rotation.y += activeRef.current ? 0.006 : 0.0016;
      inner.rotation.y = globe.rotation.y * 0.9;
      atmosphere.rotation.y -= 0.0007;
      orbit.rotation.z += 0.002;
      stars.rotation.y -= 0.00025;

      const posAttr = satGeo.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < satCount; i++) {
        const angle = phases[i] + frame * 0.01 * speeds[i];
        const tilt = (i % 5) * 0.3 - 0.6;
        posAttr.setXYZ(
          i,
          radii[i] * Math.cos(angle),
          radii[i] * Math.sin(angle) * Math.sin(tilt),
          radii[i] * Math.sin(angle) * Math.cos(tilt)
        );
      }
      posAttr.needsUpdate = true;

      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    animate();

    const handleResize = () => {
      if (!mount) return;
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", handleResize);
      globeGeo.dispose();
      globeMat.dispose();
      innerGeo.dispose();
      innerMat.dispose();
      orbitGeo.dispose();
      orbitMat.dispose();
      satGeo.dispose();
      satMat.dispose();
      atmosphereGeo.dispose();
      atmosphereMat.dispose();
      starGeo.dispose();
      starMat.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div
      ref={mountRef}
      className="globe-hero"
      onPointerEnter={() => {
        activeRef.current = true;
      }}
      onPointerLeave={() => {
        activeRef.current = false;
        pointerRef.current.dragging = false;
      }}
      onPointerDown={(event) => {
        pointerRef.current.dragging = true;
        pointerRef.current.lastX = event.clientX;
        pointerRef.current.lastY = event.clientY;
      }}
      onPointerMove={(event) => {
        if (!pointerRef.current.dragging) return;
        const dx = event.clientX - pointerRef.current.lastX;
        const dy = event.clientY - pointerRef.current.lastY;
        pointerRef.current.lastX = event.clientX;
        pointerRef.current.lastY = event.clientY;
        const canvas = mountRef.current?.querySelector("canvas");
        if (canvas) {
          canvas.style.transform = `rotateX(${Math.max(-12, Math.min(12, -dy * 0.12))}deg) rotateY(${Math.max(-18, Math.min(18, dx * 0.12))}deg)`;
        }
      }}
      onPointerUp={() => {
        pointerRef.current.dragging = false;
      }}
      aria-label="Interactive ORBITA satellite intelligence globe"
    />
  );
}

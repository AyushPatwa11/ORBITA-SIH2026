import { useEffect, useRef } from "react";
import * as THREE from "three";

export function GlobeHero() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = mount.clientWidth;
    const height = mount.clientHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 0.6, 4.2);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    // wireframe globe — no textures, so it stays fully offline-safe
    const globeGeo = new THREE.IcosahedronGeometry(1.6, 3);
    const globeMat = new THREE.MeshBasicMaterial({
      color: 0x4da3ff,
      wireframe: true,
      transparent: true,
      opacity: 0.35,
    });
    const globe = new THREE.Mesh(globeGeo, globeMat);
    scene.add(globe);

    // thin solid inner sphere so the wireframe reads as a globe, not a cage
    const innerGeo = new THREE.SphereGeometry(1.58, 32, 32);
    const innerMat = new THREE.MeshBasicMaterial({ color: 0x0b0e13 });
    scene.add(new THREE.Mesh(innerGeo, innerMat));

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
      globe.rotation.y += 0.0016;

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
      satGeo.dispose();
      satMat.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={mountRef} className="globe-hero" />;
}

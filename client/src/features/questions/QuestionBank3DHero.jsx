import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

export const QuestionBank3DHero = ({ className = '' }) => {
  const mountRef = useRef(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const width = container.clientWidth || 360;
    const height = container.clientHeight || 240;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    camera.position.set(0, 0, 5.2);

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance'
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    const group = new THREE.Group();
    scene.add(group);

    // 1. Central Faceted Dark Polyhedron Core
    const coreGeo = new THREE.IcosahedronGeometry(1.2, 0);
    const coreMat = new THREE.MeshPhysicalMaterial({
      color: 0x191A1D,
      emissive: 0x121316,
      roughness: 0.2,
      metalness: 0.85,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1,
      reflectivity: 0.95,
      flatShading: true
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    group.add(coreMesh);

    // 2. Lime Glowing Wireframe Edges
    const wireGeo = new THREE.IcosahedronGeometry(1.22, 0);
    const wireMat = new THREE.MeshBasicMaterial({
      color: 0xEDFF72, // Lime accent
      wireframe: true,
      transparent: true,
      opacity: 0.9
    });
    const wireMesh = new THREE.Mesh(wireGeo, wireMat);
    group.add(wireMesh);

    // 3. Spheres at vertices and orbital nodes (Lime & Glossy Silver matching screenshot)
    const vertices = wireGeo.attributes.position;
    const nodeSpheres = [];

    const sphereGeo = new THREE.SphereGeometry(0.16, 16, 16);
    const sphereMatLime = new THREE.MeshStandardMaterial({
      color: 0xEDFF72,
      emissive: 0xEDFF72,
      emissiveIntensity: 0.45,
      roughness: 0.15,
      metalness: 0.8
    });
    const sphereMatSilver = new THREE.MeshStandardMaterial({
      color: 0xFFFFFF,
      emissive: 0x222222,
      roughness: 0.1,
      metalness: 0.95
    });

    // Place spheres at distinct vertices
    const uniquePositions = [];
    for (let i = 0; i < vertices.count; i++) {
      const v = new THREE.Vector3(vertices.getX(i), vertices.getY(i), vertices.getZ(i));
      // Filter out duplicate vertex positions
      if (!uniquePositions.some((p) => p.distanceTo(v) < 0.1)) {
        uniquePositions.push(v);
      }
    }

    uniquePositions.forEach((pos, idx) => {
      // Alternate between lime and silver spheres
      const isLime = idx % 3 !== 0;
      const sphere = new THREE.Mesh(sphereGeo, isLime ? sphereMatLime : sphereMatSilver);
      sphere.position.copy(pos);
      group.add(sphere);
      nodeSpheres.push(sphere);
    });

    // 4. Fine Orbital Trajectory Rings circling the cluster
    const ringGeo1 = new THREE.TorusGeometry(1.85, 0.015, 16, 100);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xEDFF72,
      transparent: true,
      opacity: 0.45
    });
    const ring1 = new THREE.Mesh(ringGeo1, ringMat);
    ring1.rotation.x = Math.PI / 3;
    ring1.rotation.y = Math.PI / 5;
    group.add(ring1);

    const ringGeo2 = new THREE.TorusGeometry(2.1, 0.015, 16, 100);
    const ring2 = new THREE.Mesh(ringGeo2, ringMat);
    ring2.rotation.x = -Math.PI / 4;
    ring2.rotation.y = -Math.PI / 3;
    group.add(ring2);

    // 5. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.3);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xEDFF72, 2.8);
    dirLight.position.set(4, 5, 4);
    scene.add(dirLight);

    const fillLight = new THREE.PointLight(0xffffff, 1.2, 10);
    fillLight.position.set(-3, -2, 3);
    scene.add(fillLight);

    // Mouse Tracking
    let targetRotX = 0;
    let targetRotY = 0;

    const handlePointerMove = (e) => {
      const rect = container.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      targetRotY = x * 0.4;
      targetRotX = -y * 0.4;
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });

    // Resize Handler
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    // Animation Loop
    let animationId;
    const clock = new THREE.Clock();

    const animate = () => {
      animationId = requestAnimationFrame(animate);
      const elapsedTime = clock.getElapsedTime();

      if (!prefersReducedMotion) {
        group.rotation.y += 0.006;
        group.rotation.x += 0.003;

        ring1.rotation.z += 0.005;
        ring2.rotation.z -= 0.004;

        group.position.y = Math.sin(elapsedTime * 1.5) * 0.07;
        group.rotation.y += (targetRotY - group.rotation.y) * 0.05;
        group.rotation.x += (targetRotX - group.rotation.x) * 0.05;
      }

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('pointermove', handlePointerMove);
      resizeObserver.disconnect();

      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }

      coreGeo.dispose();
      coreMat.dispose();
      wireGeo.dispose();
      wireMat.dispose();
      sphereGeo.dispose();
      sphereMatLime.dispose();
      sphereMatSilver.dispose();
      ringGeo1.dispose();
      ringGeo2.dispose();
      ringMat.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={mountRef}
      className={`relative w-full h-full min-h-[220px] pointer-events-auto ${className}`}
      aria-label="Interactive 3D Molecular Crystal"
    />
  );
};

export default QuestionBank3DHero;

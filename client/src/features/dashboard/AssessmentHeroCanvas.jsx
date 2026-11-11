import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

export const AssessmentHeroCanvas = ({ className = '' }) => {
  const mountRef = useRef(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // Check reduced motion
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Scene, Camera, Renderer
    const width = container.clientWidth || 320;
    const height = container.clientHeight || 240;

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
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

    // Group for entire object
    const heroGroup = new THREE.Group();
    scene.add(heroGroup);

    // 1. Central Futuristic Crystal Core (Icosahedron)
    const coreGeo = new THREE.IcosahedronGeometry(1.2, 1);
    const coreMat = new THREE.MeshPhysicalMaterial({
      color: 0x191A1D,
      emissive: 0x111215,
      roughness: 0.2,
      metalness: 0.85,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1,
      reflectivity: 0.9,
      flatShading: true
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    heroGroup.add(coreMesh);

    // 2. Lime Glowing Wireframe Cage
    const wireframeGeo = new THREE.IcosahedronGeometry(1.24, 1);
    const wireframeMat = new THREE.MeshBasicMaterial({
      color: 0xEDFF72, // Lime accent
      wireframe: true,
      transparent: true,
      opacity: 0.65
    });
    const wireframeMesh = new THREE.Mesh(wireframeGeo, wireframeMat);
    heroGroup.add(wireframeMesh);

    // 3. Orbiting Lime Assessment Ring (Torus)
    const ringGeo = new THREE.TorusGeometry(1.85, 0.035, 16, 100);
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0xEDFF72,
      emissive: 0xEDFF72,
      emissiveIntensity: 0.4,
      roughness: 0.3,
      metalness: 0.7
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = Math.PI / 3;
    ringMesh.rotation.y = Math.PI / 6;
    heroGroup.add(ringMesh);

    // 4. Floating Assessment Data Spheres on Ring
    const nodeGeo = new THREE.SphereGeometry(0.1, 16, 16);
    const nodeMat = new THREE.MeshBasicMaterial({ color: 0xEDFF72 });
    const nodes = [];
    for (let i = 0; i < 3; i++) {
      const node = new THREE.Mesh(nodeGeo, nodeMat);
      heroGroup.add(node);
      nodes.push({ mesh: node, angle: (i * Math.PI * 2) / 3, radius: 1.85 });
    }

    // 5. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
    scene.add(ambientLight);

    const dirLightLime = new THREE.DirectionalLight(0xEDFF72, 2.5);
    dirLightLime.position.set(4, 5, 4);
    scene.add(dirLightLime);

    const pointLightFill = new THREE.PointLight(0xffffff, 1.5, 10);
    pointLightFill.position.set(-3, -2, 3);
    scene.add(pointLightFill);

    // Mouse Interaction
    let targetRotX = 0;
    let targetRotY = 0;

    const handlePointerMove = (e) => {
      const rect = container.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      targetRotY = x * 0.45;
      targetRotX = -y * 0.45;
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });

    // Resize Handler
    const handleResize = () => {
      if (!container) return;
      const newWidth = container.clientWidth;
      const newHeight = container.clientHeight;
      if (newWidth === 0 || newHeight === 0) return;
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    // Animation Loop
    let animationId;
    let clock = new THREE.Clock();

    const animate = () => {
      animationId = requestAnimationFrame(animate);

      const elapsedTime = clock.getElapsedTime();

      if (!prefersReducedMotion) {
        // Continuous rotation
        coreMesh.rotation.y += 0.007;
        coreMesh.rotation.x += 0.004;

        wireframeMesh.rotation.y += 0.007;
        wireframeMesh.rotation.x += 0.004;

        ringMesh.rotation.z += 0.009;

        // Floating bobbing motion
        heroGroup.position.y = Math.sin(elapsedTime * 1.5) * 0.08;

        // Smooth mouse follow interpolation
        heroGroup.rotation.y += (targetRotY - heroGroup.rotation.y) * 0.05;
        heroGroup.rotation.x += (targetRotX - heroGroup.rotation.x) * 0.05;

        // Animate nodes around the ring
        nodes.forEach((item) => {
          const currentAngle = item.angle + elapsedTime * 0.6;
          item.mesh.position.x = Math.cos(currentAngle) * item.radius;
          item.mesh.position.y = Math.sin(currentAngle) * Math.cos(Math.PI / 3) * item.radius;
          item.mesh.position.z = Math.sin(currentAngle) * Math.sin(Math.PI / 3) * item.radius;
        });
      }

      renderer.render(scene, camera);
    };

    animate();

    // Cleanup
    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('pointermove', handlePointerMove);
      resizeObserver.disconnect();

      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }

      coreGeo.dispose();
      coreMat.dispose();
      wireframeGeo.dispose();
      wireframeMat.dispose();
      ringGeo.dispose();
      ringMat.dispose();
      nodeGeo.dispose();
      nodeMat.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={mountRef}
      className={`relative w-full h-full min-h-[160px] pointer-events-auto ${className}`}
      aria-label="Interactive 3D Assessment Hero Visualization"
    />
  );
};

export default AssessmentHeroCanvas;

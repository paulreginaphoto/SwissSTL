import { Suspense, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { useLoader } from "@react-three/fiber";
import * as THREE from "three";

function StlModel({ url }: { url: string }) {
  const geometry = useLoader(STLLoader, url);

  const centered = useMemo(() => {
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    const center = new THREE.Vector3();
    box.getCenter(center);
    geometry.translate(-center.x, -center.y, -center.z);
    return geometry;
  }, [geometry]);

  return (
    <mesh geometry={centered} rotation={[-Math.PI / 2, 0, 0]}>
      <meshStandardMaterial color="#b0b0b0" flatShading />
    </mesh>
  );
}

interface StlPreviewProps {
  url: string;
  fullscreen?: boolean;
}

export default function StlPreview({ url, fullscreen }: StlPreviewProps) {
  return (
    <div className={fullscreen ? "stl-preview-fullscreen" : "stl-preview-container"}>
      <Canvas camera={{ position: [0, 0, 150], fov: 45 }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[100, 100, 100]} intensity={1} />
        <directionalLight position={[-50, -50, 50]} intensity={0.3} />
        <Suspense fallback={null}>
          <StlModel url={url} />
        </Suspense>
        <OrbitControls autoRotate autoRotateSpeed={2} enablePan={false} />
      </Canvas>
    </div>
  );
}

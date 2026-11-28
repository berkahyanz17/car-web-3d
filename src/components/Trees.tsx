import { useLayoutEffect, useMemo, useRef } from 'react'
import { CylinderCollider, RigidBody } from '@react-three/rapier'
import { useControls } from 'leva'
import { Color, CylinderGeometry, ConeGeometry, Object3D, type InstancedMesh } from 'three'
import { TREE_SPOTS } from '../data/jatinangor'
import { mapToWorld } from '../utils/campusCoords'
import { createRng, type HeightFn } from '../utils/terrainMath'

const TRUNK_HEIGHT = 1.6
const FOLIAGE_HEIGHT = 3
const FOLIAGE_COLORS = ['#2f7d4f', '#3a8f5a', '#28694a', '#4a9d5b']

interface TreeData {
  x: number
  y: number
  z: number
  scale: number
  rotation: number
  color: number
}

/**
 * Trees go on the pre-computed spots (forest patches of the drone photo, clear of roads,
 * buildings and ponds). The seed shuffles which spots get used and jitters them.
 */
function scatterTrees(count: number, seed: number, heightFn: HeightFn): TreeData[] {
  const rng = createRng(seed)
  const total = TREE_SPOTS.length / 2
  const order = Array.from({ length: total }, (_, i) => i)
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const a = order[i] ?? 0
    order[i] = order[j] ?? 0
    order[j] = a
  }

  const trees: TreeData[] = []
  for (const index of order.slice(0, Math.min(count, total))) {
    const [bx, bz] = mapToWorld(TREE_SPOTS[index * 2] ?? 0, TREE_SPOTS[index * 2 + 1] ?? 0)
    const x = bx + (rng() - 0.5) * 2
    const z = bz + (rng() - 0.5) * 2
    trees.push({
      x,
      y: heightFn(x, z),
      z,
      scale: 0.8 + rng() * 0.8,
      rotation: rng() * Math.PI * 2,
      color: Math.floor(rng() * FOLIAGE_COLORS.length),
    })
  }
  return trees
}

interface TreesProps {
  heightFn: HeightFn
  /** Changes when the terrain is regenerated so trees are re-seated on it. */
  signature: string
}

export function Trees({ heightFn, signature }: TreesProps) {
  const { count, seed } = useControls('Trees', {
    count: { value: 450, min: 0, max: 1600, step: 50 },
    seed: { value: 42, step: 1, label: 'seed' },
  })

  const trees = useMemo(() => scatterTrees(count, seed, heightFn), [count, seed, heightFn])

  const trunkGeometry = useMemo(() => {
    const geometry = new CylinderGeometry(0.22, 0.3, TRUNK_HEIGHT, 6)
    geometry.translate(0, TRUNK_HEIGHT / 2, 0)
    return geometry
  }, [])
  const foliageGeometry = useMemo(() => {
    const geometry = new ConeGeometry(1.3, FOLIAGE_HEIGHT, 7)
    geometry.translate(0, TRUNK_HEIGHT + FOLIAGE_HEIGHT / 2 - 0.2, 0)
    return geometry
  }, [])

  const trunkRef = useRef<InstancedMesh>(null)
  const foliageRef = useRef<InstancedMesh>(null)

  useLayoutEffect(() => {
    const trunks = trunkRef.current
    const foliage = foliageRef.current
    if (!trunks || !foliage) return
    const dummy = new Object3D()
    const color = new Color()
    trees.forEach((tree, i) => {
      dummy.position.set(tree.x, tree.y, tree.z)
      dummy.rotation.set(0, tree.rotation, 0)
      dummy.scale.setScalar(tree.scale)
      dummy.updateMatrix()
      trunks.setMatrixAt(i, dummy.matrix)
      foliage.setMatrixAt(i, dummy.matrix)
      trunks.setColorAt(i, color.set('#7a5230'))
      foliage.setColorAt(i, color.set(FOLIAGE_COLORS[tree.color] ?? '#2f7d4f'))
    })
    trunks.instanceMatrix.needsUpdate = true
    foliage.instanceMatrix.needsUpdate = true
    if (trunks.instanceColor) trunks.instanceColor.needsUpdate = true
    if (foliage.instanceColor) foliage.instanceColor.needsUpdate = true
  }, [trees])

  return (
    <>
      {/* key remounts the instanced meshes when the instance count changes */}
      <instancedMesh
        key={`trunk-${trees.length}`}
        ref={trunkRef}
        args={[trunkGeometry, undefined, trees.length]}
        castShadow
        receiveShadow
        frustumCulled={false}
      >
        <meshStandardMaterial flatShading />
      </instancedMesh>
      <instancedMesh
        key={`foliage-${trees.length}`}
        ref={foliageRef}
        args={[foliageGeometry, undefined, trees.length]}
        castShadow
        receiveShadow
        frustumCulled={false}
      >
        <meshStandardMaterial flatShading />
      </instancedMesh>

      {/* One static body, one simple cylinder collider per trunk. */}
      <RigidBody key={`${signature}-${count}-${seed}`} type="fixed" colliders={false}>
        {trees.map((tree, i) => {
          const halfHeight = (TRUNK_HEIGHT * tree.scale) / 2 + 0.2
          return (
            <CylinderCollider
              key={i}
              args={[halfHeight, 0.35 * tree.scale]}
              position={[tree.x, tree.y + halfHeight - 0.2, tree.z]}
              friction={0.5}
            />
          )
        })}
      </RigidBody>
    </>
  )
}

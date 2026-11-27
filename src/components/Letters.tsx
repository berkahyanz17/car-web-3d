import { useMemo, type ComponentProps } from 'react'
import { Text3D } from '@react-three/drei'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { useControls } from 'leva'
import { Font } from 'three/examples/jsm/loaders/FontLoader.js'
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js'
import fontJson from '../assets/fonts/helvetiker_bold.typeface.json'

type Text3DFont = ComponentProps<typeof Text3D>['font']
type FontConstructorData = ConstructorParameters<typeof Font>[0]

// Bundled typeface (three.js example font, see FONT_LICENSE.txt).
const font = new Font(fontJson as unknown as FontConstructorData)
const FONT_DATA = fontJson as unknown as Text3DFont

const CURVE_SEGMENTS = 6
const GROUND_CLEARANCE = 0.02
const LETTERS_Z = -7 // in front of the spawn (car faces -Z), before the ramps
const COLORS = ['#e63946', '#f4a261', '#e9c46a', '#2a9d8f', '#4361ee', '#9d4edd']

interface LetterLayout {
  char: string
  /** Body (collider center) position in world space. */
  position: [number, number, number]
  /** Offset from the body center back to the glyph origin. */
  glyphOffset: [number, number, number]
  /** Collider half extents: the glyph's bounding box. */
  halfExtents: [number, number, number]
  color: string
}

/** Measures each glyph with the same font/size as Text3D and lays them out in a centered row. */
function layoutLetters(text: string, size: number, depth: number): LetterLayout[] {
  const scale = size / font.data.resolution
  const advances = Array.from(text).map((char) => (font.data.glyphs[char]?.ha ?? 0) * scale)
  const totalWidth = advances.reduce((sum, a) => sum + a, 0)

  const letters: LetterLayout[] = []
  let cursor = -totalWidth / 2

  Array.from(text).forEach((char, i) => {
    const advance = advances[i] ?? 0
    if (char.trim() !== '') {
      const geometry = new TextGeometry(char, { font, size, depth, curveSegments: CURVE_SEGMENTS, bevelEnabled: false })
      geometry.computeBoundingBox()
      const box = geometry.boundingBox
      geometry.dispose()
      if (box) {
        const width = box.max.x - box.min.x
        const height = box.max.y - box.min.y
        const cx = (box.min.x + box.max.x) / 2
        const cy = (box.min.y + box.max.y) / 2
        const cz = depth / 2
        letters.push({
          char,
          position: [cursor + cx, height / 2 + GROUND_CLEARANCE, LETTERS_Z],
          glyphOffset: [-cx, -cy, -cz],
          halfExtents: [width / 2, height / 2, depth / 2],
          color: COLORS[letters.length % COLORS.length] ?? '#e63946',
        })
      }
    }
    cursor += advance
  })
  return letters
}

export function Letters() {
  const { text, size, depth, mass, friction } = useControls('Letters', {
    text: 'BERKAH',
    size: { value: 2, min: 0.5, max: 5, step: 0.1 },
    depth: { value: 0.6, min: 0.2, max: 2, step: 0.05 },
    mass: { value: 6, min: 0.5, max: 100, step: 0.5 },
    friction: { value: 0.8, min: 0, max: 2, step: 0.05 },
  })

  const letters = useMemo(() => layoutLetters(text.toUpperCase(), size, depth), [text, size, depth])
  const signature = `${text}-${size}-${depth}-${mass}-${friction}`

  return (
    <>
      {letters.map((letter, i) => (
        <RigidBody
          key={`${signature}-${i}`}
          position={letter.position}
          colliders={false}
          type="dynamic"
        >
          {/* Box collider = glyph bounding box, never the visual mesh. */}
          <CuboidCollider args={letter.halfExtents} mass={mass} friction={friction} restitution={0.1} />
          <Text3D
            font={FONT_DATA}
            size={size}
            height={depth}
            curveSegments={CURVE_SEGMENTS}
            bevelEnabled={false}
            position={letter.glyphOffset}
            castShadow
            receiveShadow
          >
            {letter.char}
            <meshStandardMaterial color={letter.color} flatShading />
          </Text3D>
        </RigidBody>
      ))}
    </>
  )
}

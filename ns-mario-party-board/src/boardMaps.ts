import {
  DEFAULT_TILE_HEIGHT,
  DEFAULT_TILE_WIDTH,
  START_SPACE_ID,
  getTilePresentation,
  type BoardMap,
  type BoardSpace,
  type EditableSpaceKind,
} from './game'

const STORAGE_KEY = 'ns-mario-party-board:custom-maps'

const createId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

const createStartSpace = (): BoardSpace => ({
  id: START_SPACE_ID,
  kind: 'start',
  label: 'Camp',
  description: 'Complete a lap to earn a Flame Token.',
  x: 18,
  y: 50,
  width: DEFAULT_TILE_WIDTH,
  height: DEFAULT_TILE_HEIGHT,
  next: ['tile-1'],
})

const createTile = (
  id: string,
  kind: EditableSpaceKind,
  x: number,
  y: number,
  next: string[],
): BoardSpace => {
  const presentation = getTilePresentation(kind)

  return {
    id,
    kind,
    label: presentation.label,
    description: presentation.description,
    x,
    y,
    width: DEFAULT_TILE_WIDTH,
    height: DEFAULT_TILE_HEIGHT,
    next,
  }
}

const normalizeSpace = (space: BoardSpace): BoardSpace => ({
  ...space,
  width: space.width ?? DEFAULT_TILE_WIDTH,
  height: space.height ?? DEFAULT_TILE_HEIGHT,
})

const normalizeMap = (map: BoardMap): BoardMap => ({
  ...map,
  spaces: map.spaces.map(normalizeSpace),
})

export const createStarterCustomMap = (name = 'Custom board'): BoardMap => ({
  id: createId('map'),
  name,
  startSpaceId: START_SPACE_ID,
  spaces: [
    createStartSpace(),
    createTile('tile-1', 'regular', 48, 50, ['tile-2']),
    createTile('tile-2', 'kindling', 70, 30, ['tile-3']),
    createTile('tile-3', 'shop', 78, 54, ['tile-4']),
    createTile('tile-4', 'water', 66, 74, [START_SPACE_ID]),
  ],
})

export const loadSavedCustomMaps = (): BoardMap[] => {
  if (typeof window === 'undefined') {
    return []
  }

  const raw = window.localStorage.getItem(STORAGE_KEY)

  if (!raw) {
    return []
  }

  try {
    const parsed = JSON.parse(raw) as BoardMap[]
    return Array.isArray(parsed) ? parsed.map(normalizeMap) : []
  } catch {
    return []
  }
}

export const saveCustomMapsToStorage = (maps: BoardMap[]) => {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(maps))
}

export const createMapTile = (
  count: number,
  kind: EditableSpaceKind,
): BoardSpace => {
  const angle = (count * 48 * Math.PI) / 180
  const radius = 28
  const x = Math.round(50 + Math.cos(angle) * radius)
  const y = Math.round(50 + Math.sin(angle) * radius)

  return createTile(createId('tile'), kind, x, y, [])
}

export const getMapValidationIssues = (map: BoardMap): string[] => {
  const issues: string[] = []
  const spaceIds = new Set(map.spaces.map((space) => space.id))
  const start = map.spaces.find((space) => space.id === map.startSpaceId)
  const nonStartSpaces = map.spaces.filter((space) => space.id !== map.startSpaceId)

  if (!start) {
    issues.push('The map must include the Camp start node.')
    return issues
  }

  if (nonStartSpaces.length < 1) {
    issues.push('Add at least one tile to the map.')
  }

  if (start.next.length < 1) {
    issues.push('Camp needs an outgoing connection to the first tile.')
  }

  for (const space of map.spaces) {
    for (const nextId of space.next) {
      if (!spaceIds.has(nextId)) {
        issues.push(`${space.label} points to a missing tile.`)
      }
    }
  }

  const reachable = new Set<string>()
  const stack = [map.startSpaceId]

  while (stack.length > 0) {
    const currentId = stack.pop()

    if (!currentId || reachable.has(currentId)) {
      continue
    }

    reachable.add(currentId)
    const current = map.spaces.find((space) => space.id === currentId)

    if (!current) {
      continue
    }

    for (const nextId of current.next) {
      if (!reachable.has(nextId)) {
        stack.push(nextId)
      }
    }
  }

  if (nonStartSpaces.some((space) => !reachable.has(space.id))) {
    issues.push('Every tile must be reachable from Camp.')
  }

  const canReturnToStart = (() => {
    const visited = new Set<string>()
    const search = (spaceId: string): boolean => {
      if (visited.has(spaceId)) {
        return false
      }

      visited.add(spaceId)
      const space = map.spaces.find((entry) => entry.id === spaceId)

      if (!space) {
        return false
      }

      for (const nextId of space.next) {
        if (nextId === map.startSpaceId) {
          return true
        }

        if (search(nextId)) {
          return true
        }
      }

      return false
    }

    return start.next.some((nextId) => search(nextId))
  })()

  if (!canReturnToStart) {
    issues.push('At least one path must lead back to Camp so laps can finish.')
  }

  return [...new Set(issues)]
}

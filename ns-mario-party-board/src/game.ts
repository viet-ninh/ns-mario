export type ItemKey = 'logs' | 'waterSpray' | 'doubleLogs' | 'wildfire'
export type ShopItemKey = ItemKey | 'flameToken'

export type SpaceKind =
  | 'start'
  | 'regular'
  | 'kindling'
  | 'water'
  | 'shop'
  | 'hotSeat'
  | 'branch'

export type EditableSpaceKind = 'regular' | 'kindling' | 'water' | 'shop' | 'hotSeat'

export interface TeamSetup {
  id: string
  name: string
  color: string
}

export interface Inventory {
  logs: number
  waterSpray: number
  doubleLogs: number
  wildfire: number
}

export interface Player {
  id: string
  name: string
  color: string
  position: string
  embers: number
  flameTokens: number
  inventory: Inventory
  pendingRollModifier: number
  laps: number
}

export interface BoardSpace {
  id: string
  kind: SpaceKind
  label: string
  description: string
  x: number
  y: number
  width?: number
  height?: number
  next: string[]
}

export interface BoardMap {
  id: string
  name: string
  spaces: BoardSpace[]
  startSpaceId: string
}

export interface RollState {
  base: number
  modifier: number
  total: number
  isExtra: boolean
  wasDoubled: boolean
}

export interface PendingMove {
  stepsRemaining: number
}

export type MovementMode = 'auto' | 'manual'

export interface BranchChoice {
  fromSpaceId: string
  nextOptions: string[]
}

export type TargetingAction = 'waterSpray' | 'wildfire' | null

export type TurnPhase =
  | 'awaitingRoll'
  | 'choosingMoveMode'
  | 'choosingPath'
  | 'manualMoving'
  | 'shop'
  | 'awaitingAction'
  | 'choosingTarget'

export interface GameState {
  boardMap: BoardMap
  players: Player[]
  currentPlayerIndex: number
  round: number
  maxRounds: number
  phase: TurnPhase
  roll: RollState | null
  pendingMove: PendingMove | null
  movementMode: MovementMode | null
  branchChoice: BranchChoice | null
  targetingAction: TargetingAction
  log: string[]
  finished: boolean
}

export const MAX_ROUNDS = 15
export const START_SPACE_ID = 'camp'
export const FLAME_TOKEN_COST_IN_EMBERS = 20
export const DEFAULT_TILE_WIDTH = 88
export const DEFAULT_TILE_HEIGHT = 66
export const MIN_TILE_WIDTH = 60
export const MAX_TILE_WIDTH = 180
export const MIN_TILE_HEIGHT = 48
export const MAX_TILE_HEIGHT = 140

export const TEAM_COLOR_OPTIONS = [
  '#f97316',
  '#ef4444',
  '#facc15',
  '#22c55e',
  '#14b8a6',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
]

export const DEFAULT_TEAMS: TeamSetup[] = [
  { id: 'ember-1', name: 'Blaze Brigade', color: '#f97316' },
  { id: 'ember-2', name: 'Cinder Crew', color: '#3b82f6' },
  { id: 'ember-3', name: 'Spark Squad', color: '#22c55e' },
  { id: 'ember-4', name: 'Torch Team', color: '#ec4899' },
]

export const ITEM_COSTS: Record<ItemKey, number> = {
  logs: 3,
  waterSpray: 3,
  doubleLogs: 5,
  wildfire: 7,
}

export const SHOP_ITEM_COSTS: Record<ShopItemKey, number> = {
  ...ITEM_COSTS,
  flameToken: FLAME_TOKEN_COST_IN_EMBERS,
}

export const ITEM_LABELS: Record<ItemKey, string> = {
  logs: 'Log',
  waterSpray: 'Water Spray',
  doubleLogs: 'Double Logs',
  wildfire: 'Wildfire',
}

export const SHOP_ITEM_LABELS: Record<ShopItemKey, string> = {
  ...ITEM_LABELS,
  flameToken: 'Flame Token',
}

export const ITEM_DESCRIPTIONS: Record<ItemKey, string> = {
  logs: 'Take an immediate extra 1d6 roll this turn.',
  waterSpray: "Reduce another team's next roll by 1.",
  doubleLogs: 'Double your current roll after you roll.',
  wildfire: 'Swap positions with another team.',
}

export const SHOP_ITEM_DESCRIPTIONS: Record<ShopItemKey, string> = {
  ...ITEM_DESCRIPTIONS,
  flameToken: 'Buy 1 Flame Token directly for 20 embers.',
}

export const DEFAULT_BOARD_MAP: BoardMap = {
  id: 'flame-trail-classic',
  name: 'Flame Trail Classic',
  startSpaceId: START_SPACE_ID,
  spaces: [
    {
      id: 'camp',
      kind: 'start',
      label: 'Camp',
      description: 'Complete a lap to earn a Flame Token.',
      x: 50,
      y: 8,
      next: ['trail-1'],
    },
    {
      id: 'trail-1',
      kind: 'regular',
      label: 'Trail',
      description: 'A steady path through the woods.',
      x: 72,
      y: 14,
      next: ['kindling-1'],
    },
    {
      id: 'kindling-1',
      kind: 'kindling',
      label: 'Kindling',
      description: 'Gain 3 embers.',
      x: 85,
      y: 26,
      next: ['shop-1'],
    },
    {
      id: 'shop-1',
      kind: 'shop',
      label: 'Shop',
      description: 'Buy one-use fire tools.',
      x: 87,
      y: 42,
      next: ['fork-1'],
    },
    {
      id: 'fork-1',
      kind: 'branch',
      label: 'Fork',
      description: 'Choose between the long bend and the shortcut.',
      x: 80,
      y: 60,
      next: ['route-a-1', 'route-b-1'],
    },
    {
      id: 'route-a-1',
      kind: 'regular',
      label: 'Bend',
      description: 'Longer but safer route.',
      x: 70,
      y: 84,
      next: ['water-1'],
    },
    {
      id: 'water-1',
      kind: 'water',
      label: 'Bucket',
      description: 'Lose 3 embers.',
      x: 50,
      y: 91,
      next: ['join-1'],
    },
    {
      id: 'join-1',
      kind: 'regular',
      label: 'Ridge',
      description: 'Both routes meet again here.',
      x: 30,
      y: 83,
      next: ['kindling-2'],
    },
    {
      id: 'route-b-1',
      kind: 'shop',
      label: 'Shortcut Shop',
      description: 'Quick detour with a chance to stock up.',
      x: 59,
      y: 62,
      next: ['join-1'],
    },
    {
      id: 'kindling-2',
      kind: 'kindling',
      label: 'Kindling',
      description: 'Gain 3 embers.',
      x: 17,
      y: 70,
      next: ['shop-2'],
    },
    {
      id: 'shop-2',
      kind: 'shop',
      label: 'Shop',
      description: 'Buy one-use fire tools.',
      x: 11,
      y: 52,
      next: ['fork-2'],
    },
    {
      id: 'fork-2',
      kind: 'branch',
      label: 'Fork',
      description: 'Pick the climb or the quick cross.',
      x: 14,
      y: 33,
      next: ['route-c-1', 'route-d-1'],
    },
    {
      id: 'route-c-1',
      kind: 'regular',
      label: 'Climb',
      description: 'Long route toward the northern ridge.',
      x: 22,
      y: 17,
      next: ['water-2'],
    },
    {
      id: 'water-2',
      kind: 'water',
      label: 'Bucket',
      description: 'Lose 3 embers.',
      x: 39,
      y: 12,
      next: ['join-2'],
    },
    {
      id: 'join-2',
      kind: 'regular',
      label: 'Lookout',
      description: 'The paths merge before the final push.',
      x: 57,
      y: 18,
      next: ['kindling-3'],
    },
    {
      id: 'route-d-1',
      kind: 'kindling',
      label: 'Shortcut Glow',
      description: 'Quick route that grants 3 embers.',
      x: 33,
      y: 40,
      next: ['join-2'],
    },
    {
      id: 'kindling-3',
      kind: 'kindling',
      label: 'Kindling',
      description: 'Gain 3 embers.',
      x: 67,
      y: 31,
      next: ['shop-3'],
    },
    {
      id: 'shop-3',
      kind: 'shop',
      label: 'Shop',
      description: 'Final chance to buy tools before camp.',
      x: 69,
      y: 48,
      next: ['back-1'],
    },
    {
      id: 'back-1',
      kind: 'regular',
      label: 'Runback',
      description: 'Push through the last stretch.',
      x: 60,
      y: 68,
      next: ['camp'],
    },
  ],
}

export const createInventory = (): Inventory => ({
  logs: 0,
  waterSpray: 0,
  doubleLogs: 0,
  wildfire: 0,
})

export const createGameState = (
  teams: TeamSetup[],
  boardMap: BoardMap,
): GameState => ({
  boardMap,
  players: teams.map((team) => ({
    id: team.id,
    name: team.name.trim(),
    color: team.color,
    position: boardMap.startSpaceId,
    embers: 0,
    flameTokens: 0,
    inventory: createInventory(),
    pendingRollModifier: 0,
    laps: 0,
  })),
  currentPlayerIndex: 0,
  round: 1,
  maxRounds: MAX_ROUNDS,
  phase: 'awaitingRoll',
  roll: null,
  pendingMove: null,
  movementMode: null,
  branchChoice: null,
  targetingAction: null,
  log: [`${boardMap.name} is ready. Blaze through 15 rounds.`],
  finished: false,
})

export const rankPlayers = (players: Player[]) =>
  [...players].sort(
    (left, right) =>
      right.flameTokens - left.flameTokens ||
      right.embers - left.embers ||
      right.laps - left.laps,
  )

export const getSpace = (boardMap: BoardMap, spaceId: string) => {
  const space = boardMap.spaces.find((entry) => entry.id === spaceId)

  if (!space) {
    throw new Error(`Unknown board space: ${spaceId}`)
  }

  return space
}

export const getCurrentPlayer = (state: GameState) =>
  state.players[state.currentPlayerIndex]

export const trimLog = (entries: string[], message: string) => [
  message,
  ...entries,
].slice(0, 10)

export const getTilePresentation = (kind: EditableSpaceKind) => {
  switch (kind) {
    case 'shop':
      return {
        label: 'Shop',
        description: 'Buy one-use items with embers.',
      }
    case 'hotSeat':
      return {
        label: 'Hot Seat',
        description: "Pause here to test the team's ability.",
      }
    case 'kindling':
      return {
        label: 'Kindling',
        description: 'Gain 3 embers.',
      }
    case 'water':
      return {
        label: 'Water Bucket',
        description: 'Lose 3 embers.',
      }
    default:
      return {
        label: 'Trail',
        description: 'A regular space to pass through.',
      }
  }
}

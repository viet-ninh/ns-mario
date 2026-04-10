import {
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { motion } from 'framer-motion'
import {
  Flame,
  GitBranch,
  MinusCircle,
  PlusCircle,
  Save,
  ShieldAlert,
  ShoppingBag,
  Trees,
  Trophy,
} from 'lucide-react'
import './App.css'
import {
  createMapTile,
  createStarterCustomMap,
  getMapValidationIssues,
  loadSavedCustomMaps,
  saveCustomMapsToStorage,
} from './boardMaps'
import {
  DEFAULT_TEAMS,
  DEFAULT_TILE_HEIGHT,
  DEFAULT_TILE_WIDTH,
  FLAME_TOKEN_COST_IN_EMBERS,
  MAX_TILE_HEIGHT,
  MAX_TILE_WIDTH,
  MAX_ROUNDS,
  MIN_TILE_HEIGHT,
  MIN_TILE_WIDTH,
  SHOP_ITEM_COSTS,
  SHOP_ITEM_DESCRIPTIONS,
  SHOP_ITEM_LABELS,
  TEAM_COLOR_OPTIONS,
  createGameState,
  getCurrentPlayer,
  getSpace,
  getTilePresentation,
  rankPlayers,
  trimLog,
  type BoardMap,
  type BoardSpace,
  type EditableSpaceKind,
  type GameState,
  type ItemKey,
  type Player,
  type ShopItemKey,
  type TeamSetup,
} from './game'

const createInitialMap = () => {
  const savedMaps = loadSavedCustomMaps()
  return savedMaps[0] ? structuredClone(savedMaps[0]) : createStarterCustomMap()
}

function App() {
  const [mode, setMode] = useState<'editor' | 'setup' | 'game' | 'results'>('editor')
  const [setupTeams, setSetupTeams] = useState<TeamSetup[]>(DEFAULT_TEAMS)
  const [game, setGame] = useState<GameState | null>(null)
  const [savedMaps, setSavedMaps] = useState<BoardMap[]>(() => loadSavedCustomMaps())
  const [editorMap, setEditorMap] = useState<BoardMap>(createInitialMap)
  const [selectedBoardMap, setSelectedBoardMap] = useState<BoardMap>(createInitialMap)
  const [selectedSpaceIds, setSelectedSpaceIds] = useState<string[]>(['camp'])
  const [connectionSourceId, setConnectionSourceId] = useState<string | null>(null)
  const [saveNotice, setSaveNotice] = useState('')
  const [gmTargetTeamId, setGmTargetTeamId] = useState<string>('')
  const [gmEmberAmount, setGmEmberAmount] = useState<string>('3')
  const editorBoardRef = useRef<HTMLDivElement | null>(null)
  const gameBoardRef = useRef<HTMLDivElement | null>(null)
  const dragStateRef = useRef<{
    spaceId: string
    pointerId: number
    startX: number
    startY: number
    moved: boolean
  } | null>(null)
  const suppressClickRef = useRef<string | null>(null)
  const [adminMode, setAdminMode] = useState(false)
  const [manualMoveMode, setManualMoveMode] = useState(false)
  const [manualMoveTeamId, setManualMoveTeamId] = useState('')
  const [adminDragPlayer, setAdminDragPlayer] = useState<Player | null>(null)
  const [adminDragPosition, setAdminDragPosition] = useState<{ x: number; y: number } | null>(null)

  const currentPlayer = game ? getCurrentPlayer(game) : null
  const rankedPlayers = game ? rankPlayers(game.players) : []
  const manualMovePlayer = game
    ? game.players.find((player) => player.id === manualMoveTeamId) ?? currentPlayer
    : null
  const selectedSpaceId = selectedSpaceIds[selectedSpaceIds.length - 1] ?? ''
  const selectedSpace = editorMap.spaces.find((space) => space.id === selectedSpaceId)
  const editorIssues = getMapValidationIssues(editorMap)
  const canUseEditorMap = editorIssues.length === 0
  const savedMapIds = new Set(savedMaps.map((map) => map.id))
  const mapHasSavedVersion = savedMapIds.has(editorMap.id)
  const isSetupValid =
    setupTeams.every((team) => team.name.trim().length > 1) &&
    new Set(setupTeams.map((team) => team.color)).size === setupTeams.length

  const persistSavedMaps = (nextMaps: BoardMap[]) => {
    setSavedMaps(nextMaps)
    saveCustomMapsToStorage(nextMaps)
  }

  const updateSetupTeam = (
    teamId: string,
    updater: (team: TeamSetup) => TeamSetup,
  ) => {
    setSetupTeams((teams) =>
      teams.map((team) => (team.id === teamId ? updater(team) : team)),
    )
  }

  const updateEditorMap = (updater: (draft: BoardMap) => void) => {
    setEditorMap((current) => {
      const draft = structuredClone(current)
      updater(draft)
      return draft
    })
  }

  const commitGame = (updater: (draft: GameState) => void) => {
    if (!game) {
      return
    }

    const draft = structuredClone(game)
    updater(draft)
    setGame(draft)

    if (draft.finished) {
      setMode('results')
    }
  }

  const writeLog = (draft: GameState, message: string) => {
    draft.log = trimLog(draft.log, message)
  }

  const getItemCount = (player: Player, item: ItemKey) => player.inventory[item]

  const clampTileWidth = (value: number) => Math.max(MIN_TILE_WIDTH, Math.min(MAX_TILE_WIDTH, value))
  const clampTileHeight = (value: number) => Math.max(MIN_TILE_HEIGHT, Math.min(MAX_TILE_HEIGHT, value))
  const getSpaceWidth = (space: BoardSpace) => space.width ?? DEFAULT_TILE_WIDTH
  const getSpaceHeight = (space: BoardSpace) => space.height ?? DEFAULT_TILE_HEIGHT

  const addEmbers = (draft: GameState, player: Player, delta: number) => {
    const previousEmbers = player.embers
    player.embers = Math.max(0, player.embers + delta)

    if (delta > 0) {
      writeLog(
        draft,
        `${player.name} gains ${delta} embers and now has ${player.embers}.`,
      )
    }

    if (delta < 0) {
      writeLog(
        draft,
        `${player.name} loses ${Math.min(previousEmbers, -delta)} embers and now has ${player.embers}.`,
      )
    }
  }

  const moveCurrentPlayerToSpace = (draft: GameState, nextSpaceId: string) => {
    const player = getCurrentPlayer(draft)
    const previousPosition = player.position

    player.position = nextSpaceId

    if (
      previousPosition !== draft.boardMap.startSpaceId &&
      nextSpaceId === draft.boardMap.startSpaceId
    ) {
      player.laps += 1
      player.flameTokens += 1
      writeLog(draft, `${player.name} completes a lap and earns 1 Flame Token.`)
    }
  }

  const resolveLanding = (draft: GameState) => {
    const player = getCurrentPlayer(draft)
    const space = getSpace(draft.boardMap, player.position)

    switch (space.kind) {
      case 'kindling': {
        addEmbers(draft, player, 3)
        draft.phase = 'awaitingAction'
        return
      }
      case 'water': {
        addEmbers(draft, player, -3)
        draft.phase = 'awaitingAction'
        return
      }
      case 'start': {
        writeLog(draft, `${player.name} is back at camp.`)
        draft.phase = 'awaitingAction'
        return
      }
      case 'shop': {
        writeLog(draft, `${player.name} lands on Shop and can buy items with embers.`)
        draft.phase = 'shop'
        return
      }
      case 'hotSeat': {
        writeLog(draft, `${player.name} lands on Hot Seat. Test that team's ability.`)
        draft.phase = 'awaitingAction'
        return
      }
      default: {
        writeLog(draft, `${player.name} lands on ${space.label}.`)
        draft.phase = 'awaitingAction'
      }
    }
  }

  const continueMovement = (draft: GameState, chosenNextId?: string) => {
    const player = getCurrentPlayer(draft)

    if (!draft.pendingMove) {
      if (!draft.roll) {
        return
      }

      draft.pendingMove = { stepsRemaining: draft.roll.total }
    }

    let nextChoice = chosenNextId

    while (draft.pendingMove.stepsRemaining > 0) {
      const currentSpace = getSpace(draft.boardMap, player.position)

      if (currentSpace.next.length > 1 && !nextChoice) {
        draft.branchChoice = {
          fromSpaceId: currentSpace.id,
          nextOptions: currentSpace.next,
        }
        draft.phase = 'choosingPath'
        return
      }

      const nextSpaceId = nextChoice ?? currentSpace.next[0]

      if (!currentSpace.next.includes(nextSpaceId)) {
        return
      }

      moveCurrentPlayerToSpace(draft, nextSpaceId)
      draft.pendingMove.stepsRemaining -= 1
      draft.branchChoice = null
      nextChoice = undefined

      const landedSpace = getSpace(draft.boardMap, player.position)
      if (landedSpace.kind === 'shop' && draft.pendingMove.stepsRemaining > 0) {
        writeLog(draft, `${player.name} passes through the Shop.`)
        draft.phase = 'shopPassthrough'
        return
      }
    }

    draft.pendingMove = null
    draft.roll = null
    draft.movementMode = null
    resolveLanding(draft)
  }

  const startGame = () => {
    const sanitizedTeams = setupTeams.map((team) => ({
      ...team,
      name: team.name.trim(),
    }))

    const nextBoard = structuredClone(selectedBoardMap)
    const nextGame = createGameState(sanitizedTeams, nextBoard)
    setGame(nextGame)
    setGmTargetTeamId(nextGame.players[0]?.id ?? '')
    setManualMoveTeamId(nextGame.players[0]?.id ?? '')
    setManualMoveMode(false)
    setMode('game')
  }

  const resetToSetup = () => {
    setGame(null)
    setManualMoveMode(false)
    setManualMoveTeamId('')
    setMode('setup')
  }

  const performRoll = (draft: GameState, isExtraRoll: boolean) => {
    const player = getCurrentPlayer(draft)
    const base = Math.floor(Math.random() * 6) + 1
    const modifier = player.pendingRollModifier
    const total = Math.max(1, base + modifier)

    player.pendingRollModifier = 0
    draft.roll = {
      base,
      modifier,
      total,
      isExtra: isExtraRoll,
      wasDoubled: false,
    }
    draft.phase = 'choosingMoveMode'
    draft.pendingMove = null
    draft.movementMode = null
    draft.branchChoice = null

    const rollLabel = isExtraRoll ? 'extra roll' : 'roll'
    const modifierText = modifier === 0 ? '' : ` (${modifier > 0 ? '+' : ''}${modifier})`

    writeLog(
      draft,
      `${player.name} makes a ${rollLabel}: ${base}${modifierText} = ${total}.`,
    )
  }

  const continueRolledMove = () => {
    commitGame((draft) => {
      draft.movementMode = 'auto'
      continueMovement(draft)
    })
  }

  const rollDice = (isExtraRoll = false) => {
    commitGame((draft) => {
      performRoll(draft, isExtraRoll)
    })
  }

  const endTurn = () => {
    setManualMoveMode(false)

    commitGame((draft) => {
      if (draft.currentPlayerIndex === draft.players.length - 1) {
        if (draft.round >= draft.maxRounds) {
          draft.finished = true
          writeLog(draft, 'The final campfire round ends. Final standings are in.')
          return
        }

        draft.currentPlayerIndex = 0
        draft.round += 1
      } else {
        draft.currentPlayerIndex += 1
      }

      draft.phase = 'awaitingRoll'
      draft.roll = null
      draft.pendingMove = null
      draft.movementMode = null
      draft.branchChoice = null
      draft.targetingAction = null

      const nextPlayer = getCurrentPlayer(draft)
      writeLog(draft, `Round ${draft.round}: ${nextPlayer.name} is up.`)
    })
  }

  const buyItem = (item: ShopItemKey) => {
    commitGame((draft) => {
      const player = getCurrentPlayer(draft)
      const price = SHOP_ITEM_COSTS[item]

      if (player.embers < price) {
        return
      }

      player.embers -= price

      if (item === 'flameToken') {
        player.flameTokens += 1
      } else {
        player.inventory[item] += 1
      }

      writeLog(draft, `${player.name} buys ${SHOP_ITEM_LABELS[item]} for ${price} embers.`)
    })
  }

  const buyPassthroughItem = (item: ShopItemKey) => {
    commitGame((draft) => {
      const player = getCurrentPlayer(draft)
      const price = SHOP_ITEM_COSTS[item]

      if (player.embers < price) {
        return
      }

      player.embers -= price

      if (item === 'flameToken') {
        player.flameTokens += 1
      } else {
        player.inventory[item] += 1
      }

      writeLog(draft, `${player.name} buys ${SHOP_ITEM_LABELS[item]} for ${price} embers.`)
      continueMovement(draft)
    })
  }

  const passShopPassthrough = () => {
    commitGame((draft) => {
      continueMovement(draft)
    })
  }

  const useLog = () => {
    commitGame((draft) => {
      const player = getCurrentPlayer(draft)

      if (player.inventory.logs < 1) {
        return
      }

      player.inventory.logs -= 1
      writeLog(draft, `${player.name} uses a Log for an extra roll.`)
      performRoll(draft, true)
    })
  }

  const beginTargeting = (action: 'waterSpray' | 'wildfire') => {
    commitGame((draft) => {
      const player = getCurrentPlayer(draft)

      if (player.inventory[action] < 1) {
        return
      }

      draft.targetingAction = action
      draft.phase = 'choosingTarget'
    })
  }

  const applyTargetAction = (targetId: string) => {
    commitGame((draft) => {
      const player = getCurrentPlayer(draft)
      const target = draft.players.find((entry) => entry.id === targetId)

      if (!target || !draft.targetingAction || target.id === player.id) {
        return
      }

      if (draft.targetingAction === 'waterSpray') {
        if (player.inventory.waterSpray < 1) {
          return
        }

        player.inventory.waterSpray -= 1
        target.pendingRollModifier -= 1
        writeLog(draft, `${player.name} uses Water Spray on ${target.name}. Next roll is reduced by 1.`)
      }

      if (draft.targetingAction === 'wildfire') {
        if (player.inventory.wildfire < 1) {
          return
        }

        player.inventory.wildfire -= 1
        const currentPosition = player.position
        player.position = target.position
        target.position = currentPosition
        writeLog(draft, `${player.name} triggers Wildfire and swaps positions with ${target.name}.`)
      }

      draft.targetingAction = null
      draft.phase = 'awaitingAction'
    })
  }

  const applyManualEmbers = () => {
    const amount = Math.trunc(Number(gmEmberAmount) || 0)

    if (!gmTargetTeamId || !game || amount === 0) {
      return
    }

    commitGame((draft) => {
      const target = draft.players.find((player) => player.id === gmTargetTeamId)

      if (!target) {
        return
      }

      const previousEmbers = target.embers
      addEmbers(draft, target, amount)
      writeLog(
        draft,
        amount > 0
          ? `Game Master grants ${amount} embers to ${target.name}.`
          : `Game Master subtracts ${Math.min(previousEmbers, Math.abs(amount))} embers from ${target.name}.`,
      )
    })
  }

  const getSpaceIcon = (space: BoardSpace, boardMap: BoardMap) => {
    if (space.id === boardMap.startSpaceId) {
      return <Trees size={16} />
    }

    if (space.kind === 'kindling') {
      return <Flame size={16} />
    }

    if (space.kind === 'water') {
      return <ShieldAlert size={16} />
    }

    if (space.kind === 'shop') {
      return <ShoppingBag size={16} />
    }

    if (space.kind === 'hotSeat') {
      return <Trophy size={16} />
    }

    if (space.next.length > 1) {
      return <GitBranch size={16} />
    }

    return <Trees size={16} />
  }

  const clampPercent = (value: number) => Math.max(8, Math.min(92, value))

  const getBoardPercentPosition = (
    board: HTMLDivElement | null,
    clientX: number,
    clientY: number,
  ) => {
    if (!board) {
      return null
    }

    const rect = board.getBoundingClientRect()

    if (rect.width < 1 || rect.height < 1) {
      return null
    }

    return {
      x: clampPercent(((clientX - rect.left) / rect.width) * 100),
      y: clampPercent(((clientY - rect.top) / rect.height) * 100),
    }
  }

  const moveTileToPointer = (spaceId: string, clientX: number, clientY: number) => {
    const nextPosition = getBoardPercentPosition(editorBoardRef.current, clientX, clientY)

    if (!nextPosition) {
      return
    }

    updateEditorMap((draft) => {
      const space = draft.spaces.find((entry) => entry.id === spaceId)

      if (!space || space.id === draft.startSpaceId) {
        return
      }

      space.x = Math.round(nextPosition.x)
      space.y = Math.round(nextPosition.y)
    })
    setSaveNotice('')
  }

  const getNearestSpace = (boardMap: BoardMap, x: number, y: number) =>
    boardMap.spaces.reduce((closestSpace, space) => {
      const closestDistance = Math.hypot(closestSpace.x - x, closestSpace.y - y)
      const nextDistance = Math.hypot(space.x - x, space.y - y)

      return nextDistance < closestDistance ? space : closestSpace
    })

  const handleAdminTokenPointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
    player?: Player,
  ) => {
    if (!game || !player) {
      return
    }

    setAdminDragPlayer(player)
    const currentSpace = getSpace(game.boardMap, player.position)
    setAdminDragPosition({ x: currentSpace.x, y: currentSpace.y })
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handleAdminTokenPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!adminDragPlayer) {
      return
    }

    const nextPosition = getBoardPercentPosition(gameBoardRef.current, event.clientX, event.clientY)

    if (!nextPosition) {
      return
    }

    setAdminDragPosition({ x: Math.round(nextPosition.x), y: Math.round(nextPosition.y) })
  }

  const handleAdminTokenPointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!game || !adminDragPlayer || !adminDragPosition) {
      return
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    const targetSpace = getNearestSpace(game.boardMap, adminDragPosition.x, adminDragPosition.y)

    commitGame((draft) => {
      const player = draft.players.find((entry) => entry.id === adminDragPlayer.id)

      if (!player) {
        return
      }

      player.position = targetSpace.id
      writeLog(draft, `${adminDragPlayer.name} moved to ${targetSpace.label} (admin mode).`)
    })

    setAdminDragPlayer(null)
    setAdminDragPosition(null)
  }

  const toggleManualMoveMode = () => {
    if (!game) {
      return
    }

    setManualMoveTeamId((current) => current || getCurrentPlayer(game).id)
    setManualMoveMode((current) => !current)
  }

  const handleGameBoardSpaceClick = (spaceId: string) => {
    if (!game || !manualMoveMode || !manualMoveTeamId) {
      return
    }

    commitGame((draft) => {
      const player = draft.players.find((entry) => entry.id === manualMoveTeamId)

      if (!player) {
        return
      }

      player.position = spaceId
      writeLog(draft, `${player.name} was moved manually to ${getSpace(draft.boardMap, spaceId).label}.`)
    })

    setManualMoveMode(false)
  }

  const handleSpacePointerDown = (
    spaceId: string,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (connectionSourceId) {
      return
    }

    dragStateRef.current = {
      spaceId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    }
    setSelectedSpaceIds([spaceId])
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handleSpacePointerMove = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    const dragState = dragStateRef.current

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return
    }

    const deltaX = Math.abs(event.clientX - dragState.startX)
    const deltaY = Math.abs(event.clientY - dragState.startY)

    if (!dragState.moved && deltaX + deltaY < 4) {
      return
    }

    dragState.moved = true
    moveTileToPointer(dragState.spaceId, event.clientX, event.clientY)
  }

  const handleSpacePointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const dragState = dragStateRef.current

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    if (dragState.moved) {
      suppressClickRef.current = dragState.spaceId
    }

    dragStateRef.current = null
  }

  const shouldIgnoreSpaceClick = (spaceId: string) => {
    if (suppressClickRef.current === spaceId) {
      suppressClickRef.current = null
      return true
    }

    return false
  }

  const renderBoardStage = (
    boardMap: BoardMap,
    options?: {
      occupancy?: Record<string, Player[]>
      hiddenPlayerIds?: string[]
      adminMode?: boolean
      editorMode?: boolean
      onSpaceClick?: (spaceId: string, event: ReactMouseEvent<HTMLButtonElement>) => void
      onSpacePointerDown?: (
        spaceId: string,
        event: ReactPointerEvent<HTMLButtonElement>,
      ) => void
      onSpacePointerMove?: (event: ReactPointerEvent<HTMLButtonElement>) => void
      onSpacePointerUp?: (event: ReactPointerEvent<HTMLButtonElement>) => void
      shouldIgnoreClick?: (spaceId: string) => boolean
      boardRef?: React.RefObject<HTMLDivElement | null>
      selectedIds?: string[]
      connectionId?: string | null
      currentPlayerPosition?: string
      manualTokenPlayer?: Player | null
      manualTokenPosition?: { x: number; y: number } | null
      onManualTokenPointerDown?: (
        event: ReactPointerEvent<HTMLButtonElement>,
        player?: Player,
      ) => void
      onManualTokenPointerMove?: (event: ReactPointerEvent<HTMLButtonElement>) => void
      onManualTokenPointerUp?: (event: ReactPointerEvent<HTMLButtonElement>) => void
    },
  ) => {
    const hiddenPlayerIds = new Set(options?.hiddenPlayerIds ?? [])

    return (
      <div
        className={`board-stage ${options?.editorMode ? 'is-editor' : ''}`}
        ref={options?.boardRef}
      >
      <svg className="board-lines" viewBox="0 0 100 100" aria-hidden="true">
        {boardMap.spaces.flatMap((space) =>
          space.next.map((nextId) => {
            const nextSpace = getSpace(boardMap, nextId)
            return (
              <line
                key={`${space.id}-${nextId}`}
                x1={space.x}
                y1={space.y}
                x2={nextSpace.x}
                y2={nextSpace.y}
              />
            )
          }),
        )}
      </svg>

      {boardMap.spaces.map((space) => {
        const occupyingPlayers = (options?.occupancy?.[space.id] ?? []).filter(
          (player) => !hiddenPlayerIds.has(player.id),
        )
        const isCurrentSpace = options?.currentPlayerPosition === space.id
        const isSelected = options?.selectedIds?.includes(space.id) ?? false
        const isConnectionSource = options?.connectionId === space.id
        const isConnectable = Boolean(
          options?.connectionId && options.connectionId !== space.id,
        )

        return (
          <button
            type="button"
            className={`space-node kind-${space.kind} ${isCurrentSpace ? 'is-current' : ''} ${isSelected ? 'is-selected' : ''} ${isConnectionSource ? 'is-connection-source' : ''} ${isConnectable ? 'is-connectable' : ''}`}
            key={space.id}
            style={{
              left: `${space.x}%`,
              top: `${space.y}%`,
              width: `${getSpaceWidth(space)}px`,
              minHeight: `${getSpaceHeight(space)}px`,
            }}
            onClick={(event) => {
              if (options?.shouldIgnoreClick?.(space.id)) {
                return
              }

              options?.onSpaceClick?.(space.id, event)
            }}
            onPointerDown={(event) => options?.onSpacePointerDown?.(space.id, event)}
            onPointerMove={(event) => options?.onSpacePointerMove?.(event)}
            onPointerUp={(event) => options?.onSpacePointerUp?.(event)}
            disabled={!options?.onSpaceClick}
          >
            <div className="space-icon">{getSpaceIcon(space, boardMap)}</div>
            <strong>{space.label}</strong>
            <span>{space.description}</span>

            <div className="token-stack">
              {occupyingPlayers.map((player, index) => (
                options?.adminMode ? (
                  <button
                    type="button"
                    className="token"
                    key={player.id}
                    style={{
                      backgroundColor: player.color,
                      transform: `translate(${index % 2 === 0 ? '-45%' : '10%'}, ${index < 2 ? '-35%' : '20%'})`,
                    }}
                    title={`Move ${player.name}`}
                    onPointerDown={(event) => options.onManualTokenPointerDown?.(event, player)}
                    onPointerMove={(event) => options.onManualTokenPointerMove?.(event)}
                    onPointerUp={(event) => options.onManualTokenPointerUp?.(event)}
                  >
                    {player.name.slice(0, 1).toUpperCase()}
                  </button>
                ) : (
                  <motion.div
                    layout
                    className="token"
                    key={player.id}
                    style={{
                      backgroundColor: player.color,
                      transform: `translate(${index % 2 === 0 ? '-45%' : '10%'}, ${index < 2 ? '-35%' : '20%'})`,
                    }}
                    title={player.name}
                  >
                    {player.name.slice(0, 1).toUpperCase()}
                  </motion.div>
                )
              ))}
            </div>
          </button>
        )
      })}

      {options?.manualTokenPlayer && options.manualTokenPosition ? (
        <button
          type="button"
          className="manual-token-piece"
          style={{
            left: `${options.manualTokenPosition.x}%`,
            top: `${options.manualTokenPosition.y}%`,
            backgroundColor: options.manualTokenPlayer.color,
          }}
          onPointerDown={(event) => options.onManualTokenPointerDown?.(event, options.manualTokenPlayer ?? undefined)}
          onPointerMove={options.onManualTokenPointerMove}
          onPointerUp={options.onManualTokenPointerUp}
          title={`Move ${options.manualTokenPlayer.name}`}
        >
          {options.manualTokenPlayer.name.slice(0, 1).toUpperCase()}
        </button>
      ) : null}
      </div>
    )
  }

  const addTile = (kind: EditableSpaceKind) => {
    const tileCount = editorMap.spaces.filter((space) => space.id !== editorMap.startSpaceId).length
    const tile = createMapTile(tileCount + 1, kind)

    updateEditorMap((draft) => {
      draft.spaces.push(tile)
    })
    setSelectedSpaceIds([tile.id])
    setSaveNotice('')
  }

  const updateSelectedTile = (updater: (space: BoardSpace) => void) => {
    if (!selectedSpace || selectedSpace.id === editorMap.startSpaceId) {
      return
    }

    updateEditorMap((draft) => {
      const space = draft.spaces.find((entry) => entry.id === selectedSpace.id)

      if (!space) {
        return
      }

      updater(space)
    })
    setSaveNotice('')
  }

  const updateSelectedTilesSizes = (width?: number, height?: number) => {
    updateEditorMap((draft) => {
      for (const spaceId of selectedSpaceIds) {
        const space = draft.spaces.find((entry) => entry.id === spaceId)

        if (!space) {
          continue
        }

        if (width !== undefined) {
          space.width = width
        }

        if (height !== undefined) {
          space.height = height
        }
      }
    })
    setSaveNotice('')
  }

  const handleEditorSpaceClick = (spaceId: string, event: ReactMouseEvent<HTMLButtonElement>) => {
    if (connectionSourceId && connectionSourceId !== spaceId) {
      updateEditorMap((draft) => {
        const source = draft.spaces.find((space) => space.id === connectionSourceId)

        if (!source) {
          return
        }

        if (source.next.includes(spaceId)) {
          source.next = source.next.filter((nextId) => nextId !== spaceId)
        } else {
          source.next.push(spaceId)
        }
      })
      setSelectedSpaceIds([spaceId])
      setSaveNotice('')
      return
    }

    const isMulti = event.shiftKey || event.metaKey || event.ctrlKey

    if (isMulti) {
      setSelectedSpaceIds((current) => {
        if (current.includes(spaceId)) {
          const next = current.filter((id) => id !== spaceId)
          return next.length > 0 ? next : [spaceId]
        }

        return [...current, spaceId]
      })
    } else {
      setSelectedSpaceIds([spaceId])
    }
  }

  const deleteSelectedTile = () => {
    if (!selectedSpace || selectedSpace.id === editorMap.startSpaceId) {
      return
    }

    updateEditorMap((draft) => {
      draft.spaces = draft.spaces.filter((space) => space.id !== selectedSpace.id)
      for (const space of draft.spaces) {
        space.next = space.next.filter((nextId) => nextId !== selectedSpace.id)
      }
    })
    setSelectedSpaceIds((current) => {
      const next = current.filter((id) => id !== selectedSpace!.id)
      return next.length > 0 ? next : [editorMap.startSpaceId]
    })
    setConnectionSourceId(null)
    setSaveNotice('')
  }

  const saveCurrentMap = () => {
    const nextMap = {
      ...structuredClone(editorMap),
      name: editorMap.name.trim() || 'Custom board',
    }

    const existingIndex = savedMaps.findIndex((map) => map.id === nextMap.id)
    const nextMaps =
      existingIndex >= 0
        ? savedMaps.map((map) => (map.id === nextMap.id ? nextMap : map))
        : [...savedMaps, nextMap]

    persistSavedMaps(nextMaps)
    setEditorMap(nextMap)
    setSelectedBoardMap(nextMap)
    setSaveNotice('Map saved locally. It will be available the next time you open the app.')
  }

  const loadMapIntoEditor = (mapId: string) => {
    const match = savedMaps.find((map) => map.id === mapId)

    if (!match) {
      return
    }

    setEditorMap(structuredClone(match))
    setSelectedSpaceIds([match.startSpaceId])
    setConnectionSourceId(null)
    setSaveNotice('')
  }

  const createNewMap = () => {
    const freshMap = createStarterCustomMap(`Custom board ${savedMaps.length + 1}`)
    setEditorMap(freshMap)
    setSelectedSpaceIds([freshMap.startSpaceId])
    setConnectionSourceId(null)
    setSaveNotice('')
  }

  const deleteCurrentMap = () => {
    if (!mapHasSavedVersion) {
      return
    }

    const nextMaps = savedMaps.filter((map) => map.id !== editorMap.id)
    persistSavedMaps(nextMaps)

    const fallbackMap = nextMaps[0] ? structuredClone(nextMaps[0]) : createStarterCustomMap()
    setEditorMap(fallbackMap)
    setSelectedBoardMap(fallbackMap)
    setSelectedSpaceIds([fallbackMap.startSpaceId])
    setConnectionSourceId(null)
    setSaveNotice('Saved map deleted.')
  }

  const boardOccupancy = game
    ? game.boardMap.spaces.reduce<Record<string, Player[]>>((accumulator, space) => {
        accumulator[space.id] = game.players.filter((player) => player.position === space.id)
        return accumulator
      }, {})
    : {}

  if (mode === 'editor') {
    return (
      <main className="app-shell game-shell">
        <section className="hero-panel">
          <div className="hero-copy">
            <span className="eyebrow">Board builder</span>
            <h1>Build the event map first</h1>
            <p>
              Add regular, kindling, water bucket, shop, and Hot Seat tiles. Connect them to build
              the route, then save the board locally and carry it into team setup.
            </p>
          </div>

          <div className="hero-stats">
            <article>
              <strong>5</strong>
              <span>Tile types</span>
            </article>
            <article>
              <strong>∞</strong>
              <span>Saved maps</span>
            </article>
            <article>
              <strong>1</strong>
              <span>Camp start</span>
            </article>
          </div>
        </section>

        <section className="editor-grid">
          <article className="board-panel">
            <div className="panel-heading compact">
              <h2>{editorMap.name}</h2>
              <p>Click a node to edit it. Turn on connection mode to link one node to another.</p>
            </div>

            {renderBoardStage(editorMap, {
              onSpaceClick: handleEditorSpaceClick,
              onSpacePointerDown: handleSpacePointerDown,
              onSpacePointerMove: handleSpacePointerMove,
              onSpacePointerUp: handleSpacePointerUp,
              shouldIgnoreClick: shouldIgnoreSpaceClick,
              editorMode: true,
              boardRef: editorBoardRef,
              selectedIds: selectedSpaceIds,
              connectionId: connectionSourceId,
            })}

            <div className="inline-actions">
              <button type="button" className="secondary-button" onClick={() => addTile('regular')}>
                <PlusCircle size={16} />
                Add regular
              </button>
              <button type="button" className="secondary-button" onClick={() => addTile('kindling')}>
                <Flame size={16} />
                Add kindling
              </button>
              <button type="button" className="secondary-button" onClick={() => addTile('water')}>
                <ShieldAlert size={16} />
                Add water bucket
              </button>
              <button type="button" className="secondary-button" onClick={() => addTile('shop')}>
                <ShoppingBag size={16} />
                Add shop
              </button>
              <button type="button" className="secondary-button" onClick={() => addTile('hotSeat')}>
                <Trophy size={16} />
                Add hot seat
              </button>
            </div>
          </article>

          <aside className="sidebar-panel">
            <article className="status-card">
              <div className="panel-heading compact">
                <h2>Map details</h2>
                <p>Save multiple layouts and reload them later.</p>
              </div>

              <label className="stack-field">
                <span className="field-label">Map name</span>
                <input
                  type="text"
                  value={editorMap.name}
                  onChange={(event) => {
                    const value = event.target.value
                    updateEditorMap((draft) => {
                      draft.name = value
                    })
                    setSaveNotice('')
                  }}
                />
              </label>

              <div className="inline-actions compact-actions">
                <button type="button" className="secondary-button" onClick={createNewMap}>
                  New map
                </button>
                <button type="button" className="secondary-button" onClick={saveCurrentMap}>
                  <Save size={16} />
                  Save map
                </button>
              </div>

              <div className="saved-map-list">
                {savedMaps.length === 0 ? (
                  <p className="muted-copy">No saved maps yet. Save this one to keep it.</p>
                ) : (
                  savedMaps.map((map) => (
                    <button
                      type="button"
                      key={map.id}
                      className={`saved-map-button ${map.id === editorMap.id ? 'is-active' : ''}`}
                      onClick={() => loadMapIntoEditor(map.id)}
                    >
                      <strong>{map.name}</strong>
                      <span>{map.spaces.length - 1} tiles</span>
                    </button>
                  ))
                )}
              </div>

              <div className="inline-actions compact-actions">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={deleteCurrentMap}
                  disabled={!mapHasSavedVersion}
                >
                  Delete saved map
                </button>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => {
                    setSelectedBoardMap(structuredClone(editorMap))
                    setMode('setup')
                  }}
                  disabled={!canUseEditorMap}
                >
                  Continue to teams
                </button>
              </div>

              {saveNotice && <p className="success-copy">{saveNotice}</p>}
            </article>

            <article className="status-card">
              <div className="panel-heading compact">
                <h2>Selected node</h2>
                <p>
                  {selectedSpaceIds.length > 1
                    ? `${selectedSpaceIds.length} tiles selected — size changes apply to all. Shift/⌘+click to add.`
                    : selectedSpace
                      ? selectedSpace.label
                      : 'Choose a tile on the map.'}
                </p>
              </div>

              <div className="inline-actions">
                <button
                  type="button"
                  className="secondary-button small-button"
                  onClick={() => setSelectedSpaceIds(editorMap.spaces.map((space) => space.id))}
                >
                  Select all
                </button>
                {selectedSpaceIds.length > 1 && (
                  <button
                    type="button"
                    className="ghost-button small-button"
                    onClick={() => setSelectedSpaceIds([selectedSpaceId])}
                  >
                    Clear selection
                  </button>
                )}
              </div>

              {selectedSpace ? (
                <div className="editor-controls">
                  {selectedSpace.id !== editorMap.startSpaceId ? (
                    <>
                      <label className="stack-field">
                        <span className="field-label">Tile type</span>
                        <select
                          value={selectedSpace.kind}
                          onChange={(event) => {
                            const nextKind = event.target.value as EditableSpaceKind
                            updateSelectedTile((space) => {
                              const presentation = getTilePresentation(nextKind)
                              space.kind = nextKind
                              space.label = presentation.label
                              space.description = presentation.description
                            })
                          }}
                        >
                          <option value="regular">Regular</option>
                          <option value="kindling">Kindling</option>
                          <option value="water">Water Bucket</option>
                          <option value="shop">Shop</option>
                          <option value="hotSeat">Hot Seat</option>
                        </select>
                      </label>

                      <p className="muted-copy">Drag this tile directly on the board to move it.</p>

                      <div className="inline-actions compact-actions">
                        <button
                          type="button"
                          className={`secondary-button ${connectionSourceId === selectedSpace.id ? 'is-toggled' : ''}`}
                          onClick={() =>
                            setConnectionSourceId((current) =>
                              current === selectedSpace.id ? null : selectedSpace.id,
                            )
                          }
                        >
                          <GitBranch size={16} />
                          {connectionSourceId === selectedSpace.id ? 'Stop connecting' : 'Connect from this tile'}
                        </button>
                        <button type="button" className="ghost-button" onClick={deleteSelectedTile}>
                          <MinusCircle size={16} />
                          Remove tile
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="choice-copy">
                      <strong>Camp</strong>
                      <span>Camp is the fixed start node. Use connection mode here to set the opening path.</span>
                      <button
                        type="button"
                        className={`secondary-button ${connectionSourceId === selectedSpace.id ? 'is-toggled' : ''}`}
                        onClick={() =>
                          setConnectionSourceId((current) =>
                            current === selectedSpace.id ? null : selectedSpace.id,
                          )
                        }
                      >
                        <GitBranch size={16} />
                        {connectionSourceId === selectedSpace.id ? 'Stop connecting' : 'Connect from Camp'}
                      </button>
                    </div>
                  )}

                  <div className="range-grid">
                    <label className="stack-field">
                      <span className="field-label">Tile width</span>
                      <input
                        type="range"
                        min={MIN_TILE_WIDTH}
                        max={MAX_TILE_WIDTH}
                        step={2}
                        value={getSpaceWidth(selectedSpace)}
                        onChange={event => {
                          const nextValue = clampTileWidth(Number(event.target.value) || DEFAULT_TILE_WIDTH)
                          updateSelectedTilesSizes(nextValue, undefined)
                        }}
                      />
                      <span style={{ fontSize: '0.9em', marginLeft: 8 }}>{getSpaceWidth(selectedSpace)} px</span>
                    </label>

                    <label className="stack-field">
                      <span className="field-label">Tile height</span>
                      <input
                        type="range"
                        min={MIN_TILE_HEIGHT}
                        max={MAX_TILE_HEIGHT}
                        step={2}
                        value={getSpaceHeight(selectedSpace)}
                        onChange={event => {
                          const nextValue = clampTileHeight(Number(event.target.value) || DEFAULT_TILE_HEIGHT)
                          updateSelectedTilesSizes(undefined, nextValue)
                        }}
                      />
                      <span style={{ fontSize: '0.9em', marginLeft: 8 }}>{getSpaceHeight(selectedSpace)} px</span>
                    </label>
                  </div>

                  <div className="connection-list">
                    <span className="field-label">Outgoing connections</span>
                    {selectedSpace.next.length === 0 ? (
                      <p className="muted-copy">No outgoing connections yet.</p>
                    ) : (
                      selectedSpace.next.map((nextId) => {
                        const target = editorMap.spaces.find((space) => space.id === nextId)
                        return (
                          <div className="connection-chip" key={`${selectedSpace.id}-${nextId}`}>
                            <span>{target?.label ?? nextId}</span>
                            <button
                              type="button"
                              className="ghost-button small-button"
                              onClick={() => {
                                updateEditorMap((draft) => {
                                  const space = draft.spaces.find((entry) => entry.id === selectedSpace.id)

                                  if (!space) {
                                    return
                                  }

                                  space.next = space.next.filter((entry) => entry !== nextId)
                                })
                                setSaveNotice('')
                              }}
                            >
                              Remove
                            </button>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
              ) : null}
            </article>

            <article className="status-card">
              <div className="panel-heading compact">
                <h2>Map checks</h2>
                <p>The game will only start on a playable loop.</p>
              </div>

              {editorIssues.length === 0 ? (
                <p className="success-copy">This board is playable. You can move on to team setup.</p>
              ) : (
                <div className="validation-list">
                  {editorIssues.map((issue) => (
                    <p key={issue}>{issue}</p>
                  ))}
                </div>
              )}
            </article>
          </aside>
        </section>
      </main>
    )
  }

  if (mode === 'setup') {
    const selectedBoardTileCount = selectedBoardMap.spaces.length - 1

    return (
      <main className="app-shell">
        <section className="hero-panel">
          <div className="hero-copy">
            <span className="eyebrow">Team setup</span>
            <h1>{selectedBoardMap.name}</h1>
            <p>
              Your saved board is ready. Set the four team names and colors, then launch the event board.
            </p>
          </div>

          <div className="hero-stats">
            <article>
              <strong>{selectedBoardTileCount}</strong>
              <span>Tiles</span>
            </article>
            <article>
              <strong>{MAX_ROUNDS}</strong>
              <span>Rounds</span>
            </article>
            <article>
              <strong>{FLAME_TOKEN_COST_IN_EMBERS}</strong>
              <span>Embers per store Flame Token</span>
            </article>
          </div>
          <div style={{ marginTop: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <input
                type="checkbox"
                checked={adminMode}
                onChange={e => setAdminMode(e.target.checked)}
                style={{ width: 18, height: 18 }}
              />
              <span style={{ fontWeight: 500 }}>
                Admin mode: allow moving any team anywhere during gameplay
              </span>
            </label>
          </div>
        </section>

        <section className="setup-panel">
          <div className="panel-heading">
            <h2>Teams</h2>
            <p>Choose names and colors. You can go back to the editor if the board still needs changes.</p>
          </div>

          <div className="setup-preview-grid">
            <div className="setup-preview-board">{renderBoardStage(selectedBoardMap)}</div>
            <div className="setup-preview-copy">
              <div className="rules-strip compact-rules">
                <article>
                  <Flame size={18} />
                  <span>Kindling: +3 embers</span>
                </article>
                <article>
                  <ShieldAlert size={18} />
                  <span>Water bucket: -3 embers</span>
                </article>
                <article>
                  <ShoppingBag size={18} />
                  <span>Shop: buy items or Flame Tokens with embers</span>
                </article>
                <article>
                  <Trophy size={18} />
                  <span>Hot Seat: test a team's ability</span>
                </article>
                <article>
                  <GitBranch size={18} />
                  <span>Multiple connections create branch choices</span>
                </article>
                <article>
                  <Trophy size={18} />
                  <span>Most Flame Tokens after 15 rounds wins</span>
                </article>
              </div>
            </div>
          </div>

          <div className="team-grid">
            {setupTeams.map((team, index) => (
              <article className="team-card" key={team.id}>
                <div className="team-card-head">
                  <span className="team-number">Team {index + 1}</span>
                  <span
                    className="color-chip"
                    style={{ backgroundColor: team.color }}
                    aria-hidden="true"
                  />
                </div>

                <label>
                  <span>Name</span>
                  <input
                    type="text"
                    value={team.name}
                    maxLength={20}
                    onChange={(event) =>
                      updateSetupTeam(team.id, (current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                  />
                </label>

                <div>
                  <span className="field-label">Color</span>
                  <div className="color-grid">
                    {TEAM_COLOR_OPTIONS.map((color) => {
                      const selected = team.color === color
                      const inUseElsewhere = setupTeams.some(
                        (entry) => entry.id !== team.id && entry.color === color,
                      )

                      return (
                        <button
                          type="button"
                          key={color}
                          className={`color-option ${selected ? 'is-selected' : ''}`}
                          style={{ backgroundColor: color }}
                          onClick={() =>
                            updateSetupTeam(team.id, (current) => ({
                              ...current,
                              color,
                            }))
                          }
                          disabled={inUseElsewhere}
                          aria-label={`Choose ${color} for ${team.name}`}
                        />
                      )
                    })}
                  </div>
                </div>
              </article>
            ))}
          </div>

          <div className="setup-actions">
            <button type="button" className="secondary-button" onClick={() => setMode('editor')}>
              Back to board editor
            </button>
            <button type="button" className="primary-button" onClick={startGame} disabled={!isSetupValid}>
              Start event board
            </button>
          </div>
        </section>
      </main>
    )
  }

  if (!game || !currentPlayer) {
    return null
  }

  if (mode === 'results') {
    return (
      <main className="app-shell results-shell">
        <section className="results-panel">
          <div className="panel-heading">
            <h1>{selectedBoardMap.name} results</h1>
            <p>
              {rankedPlayers[0]?.name} wins with {rankedPlayers[0]?.flameTokens} Flame Tokens.
            </p>
          </div>

          <div className="results-grid">
            {rankedPlayers.map((player, index) => (
              <article className="result-card" key={player.id}>
                <div className="result-rank">#{index + 1}</div>
                <div className="result-name-row">
                  <span className="player-dot" style={{ backgroundColor: player.color }} />
                  <h2>{player.name}</h2>
                </div>
                <div className="result-stats">
                  <span>{player.flameTokens} Flame Tokens</span>
                  <span>{player.embers} embers</span>
                  <span>{player.laps} laps</span>
                </div>
              </article>
            ))}
          </div>

          <div className="setup-actions">
            <button type="button" className="secondary-button" onClick={resetToSetup}>
              Back to setup
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                const nextGame = createGameState(setupTeams, structuredClone(selectedBoardMap))
                setGame(nextGame)
                setGmTargetTeamId(nextGame.players[0]?.id ?? '')
                setManualMoveTeamId(nextGame.players[0]?.id ?? '')
                setManualMoveMode(false)
                setMode('game')
              }}
            >
              Play again
            </button>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell game-shell">
      <header className="game-header">
        <div>
          <span className="eyebrow">Round {game.round} of {game.maxRounds}</span>
          <h1>{game.boardMap.name}</h1>
        </div>

        <div className="game-header-actions">
          <div className="turn-badge" style={{ '--team-color': currentPlayer.color } as CSSProperties}>
            <span className="turn-label">Current team</span>
            <strong>{currentPlayer.name}</strong>
          </div>

          <div className="manual-move-toolbar">
            <button
              type="button"
              className={`secondary-button ${manualMoveMode ? 'is-toggled' : ''}`}
              onClick={toggleManualMoveMode}
            >
              {manualMoveMode ? 'Cancel manual move' : 'Manual move'}
            </button>
            <label className="stack-field manual-move-field">
              <span className="field-label">Team</span>
              <select
                value={manualMoveTeamId}
                onChange={(event) => setManualMoveTeamId(event.target.value)}
              >
                {game.players.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </header>

      <section className="game-grid">
        <article className="board-panel">
          <div className="panel-heading compact">
            <h2>Board</h2>
            <p>
              {manualMoveMode && manualMovePlayer
                ? `Select a tile to move ${manualMovePlayer.name}.`
                : 'Roll 1d6, then continue movement on the board.'}
            </p>
          </div>

          {renderBoardStage(game.boardMap, {
            occupancy: boardOccupancy,
            currentPlayerPosition: manualMoveMode && manualMovePlayer
              ? manualMovePlayer.position
              : currentPlayer.position,
            boardRef: gameBoardRef,
            manualTokenPlayer: adminDragPlayer,
            manualTokenPosition: adminDragPosition,
            onManualTokenPointerDown: handleAdminTokenPointerDown,
            onManualTokenPointerMove: handleAdminTokenPointerMove,
            onManualTokenPointerUp: handleAdminTokenPointerUp,
            onSpaceClick: manualMoveMode ? handleGameBoardSpaceClick : undefined,
            adminMode,
          })}
        </article>

        <aside className="sidebar-panel">
          <article className="status-card spotlight" style={{ '--team-color': currentPlayer.color } as CSSProperties}>
            <div className="panel-heading compact">
              <h2>{currentPlayer.name}</h2>
              <p>{currentPlayer.flameTokens} Flame Tokens • {currentPlayer.embers} embers • {currentPlayer.laps} laps</p>
            </div>

            {game.roll ? (
              <motion.div
                key={`${game.round}-${currentPlayer.id}-${game.roll.total}`}
                className="dice-card"
                initial={{ rotate: -8, scale: 0.9, opacity: 0 }}
                animate={{ rotate: 0, scale: 1, opacity: 1 }}
                transition={{ duration: 0.28 }}
              >
                <strong>{game.roll.total}</strong>
                <span>
                  Roll {game.roll.base}
                  {game.roll.modifier !== 0
                    ? ` ${game.roll.modifier > 0 ? '+' : ''}${game.roll.modifier}`
                    : ''}
                </span>
              </motion.div>
            ) : (
              <div className="dice-card is-empty">
                <strong>?</strong>
                <span>Roll the die to move.</span>
              </div>
            )}

              {game.phase === 'awaitingRoll' && (
                <div className="choice-group">
                  <div className="choice-copy">
                    <strong>Start turn</strong>
                    <span>Roll 1d6 to set the move amount for this turn.</span>
                  </div>
                  <div className="action-grid">
                    <button type="button" className="primary-button" onClick={() => rollDice()}>
                      Roll dice
                    </button>
                  </div>
                </div>
              )}

              {game.phase === 'choosingMoveMode' && game.roll && (
                <div className="choice-group">
                  <div className="choice-copy">
                    <strong>Ready to move</strong>
                    <span>Continue with your rolled move.</span>
                  </div>
                  <div className="action-grid">
                    <button
                      type="button"
                      className="primary-button"
                      onClick={continueRolledMove}
                    >
                      Continue move
                    </button>
                  </div>
                </div>
              )}

              {game.phase === 'choosingPath' && game.branchChoice && (
                <div className="choice-group">
                  <div className="choice-copy">
                    <strong>Choose a route</strong>
                    <span>{getSpace(game.boardMap, game.branchChoice.fromSpaceId).description}</span>
                  </div>
                  {game.branchChoice.nextOptions.map((nextId) => {
                    const optionSpace = getSpace(game.boardMap, nextId)
                    return (
                      <button
                        type="button"
                        className="secondary-button"
                        key={nextId}
                        onClick={() => commitGame((draft) => continueMovement(draft, nextId))}
                      >
                        {optionSpace.label}
                      </button>
                    )
                  })}
                </div>
              )}

              {game.phase === 'awaitingAction' && (
                <div className="choice-group">
                  <div className="choice-copy">
                    <strong>Turn summary</strong>
                    <span>Use items or end turn. Flame Tokens are bought in the shop or earned by laps.</span>
                  </div>
                  <div className="action-grid">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={useLog}
                      disabled={getItemCount(currentPlayer, 'logs') < 1}
                    >
                      Use Log ({getItemCount(currentPlayer, 'logs')})
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => beginTargeting('waterSpray')}
                      disabled={getItemCount(currentPlayer, 'waterSpray') < 1}
                    >
                      Water Spray ({getItemCount(currentPlayer, 'waterSpray')})
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => beginTargeting('wildfire')}
                      disabled={getItemCount(currentPlayer, 'wildfire') < 1}
                    >
                      Wildfire ({getItemCount(currentPlayer, 'wildfire')})
                    </button>
                    <button type="button" className="primary-button" onClick={endTurn}>
                      End turn
                    </button>
                  </div>
                </div>
              )}

              {game.phase === 'shopPassthrough' && (
                <div className="shop-panel">
                  <div className="choice-copy">
                    <strong>Shop</strong>
                    <span>Passing through — buy one item and keep moving, or skip.</span>
                  </div>

                  <div className="shop-grid">
                    {(Object.keys(SHOP_ITEM_COSTS) as ShopItemKey[]).map((item) => (
                      <button
                        type="button"
                        key={item}
                        className="shop-item"
                        onClick={() => buyPassthroughItem(item)}
                        disabled={currentPlayer.embers < SHOP_ITEM_COSTS[item]}
                      >
                        <strong>{SHOP_ITEM_LABELS[item]}</strong>
                        <span>{SHOP_ITEM_DESCRIPTIONS[item]}</span>
                        <em>{SHOP_ITEM_COSTS[item]} embers</em>
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    className="ghost-button"
                    onClick={passShopPassthrough}
                  >
                    Keep moving
                  </button>
                </div>
              )}

              {game.phase === 'shop' && (
                <div className="shop-panel">
                  <div className="choice-copy">
                    <strong>Shop</strong>
                    <span>Spend embers on one-use items or buy a Flame Token directly.</span>
                  </div>

                  <div className="shop-grid">
                    {(Object.keys(SHOP_ITEM_COSTS) as ShopItemKey[]).map((item) => (
                      <button
                        type="button"
                        key={item}
                        className="shop-item"
                        onClick={() => buyItem(item)}
                        disabled={currentPlayer.embers < SHOP_ITEM_COSTS[item]}
                      >
                        <strong>{SHOP_ITEM_LABELS[item]}</strong>
                        <span>{SHOP_ITEM_DESCRIPTIONS[item]}</span>
                        <em>{SHOP_ITEM_COSTS[item]} embers</em>
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    className="primary-button"
                    onClick={() =>
                      commitGame((draft) => {
                        draft.phase = 'awaitingAction'
                      })
                    }
                  >
                    Leave shop
                  </button>
                </div>
              )}

              {game.phase === 'choosingTarget' && (
                <div className="choice-group">
                  <div className="choice-copy">
                    <strong>Choose target</strong>
                    <span>
                      {game.targetingAction === 'waterSpray'
                        ? 'Pick a team to reduce their next roll by 1.'
                        : 'Pick a team to swap board positions with.'}
                    </span>
                  </div>

                  {game.players
                    .filter((player) => player.id !== currentPlayer.id)
                    .map((player) => (
                      <button
                        type="button"
                        key={player.id}
                        className="target-button"
                        onClick={() => applyTargetAction(player.id)}
                      >
                        <span className="player-dot" style={{ backgroundColor: player.color }} />
                        {player.name}
                      </button>
                    ))}

                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() =>
                      commitGame((draft) => {
                        draft.targetingAction = null
                        draft.phase = 'awaitingAction'
                      })
                    }
                  >
                    Cancel
                  </button>
                </div>
              )}
          </article>

          <article className="status-card">
            <div className="panel-heading compact">
              <h2>Standings</h2>
              <p>Flame Tokens first, embers as the tiebreaker.</p>
            </div>

            <div className="standings-list">
              {rankedPlayers.map((player, index) => {
                const tileKind = getSpace(game.boardMap, player.position).kind
                const tileToneClass =
                  tileKind === 'kindling'
                    ? 'is-kindling'
                    : tileKind === 'water'
                      ? 'is-water'
                      : ''

                return (
                  <div className={`standing-row ${tileToneClass}`} key={player.id}>
                    <span className="standing-rank">#{index + 1}</span>
                    <div className="standing-name">
                      <span className="player-dot" style={{ backgroundColor: player.color }} />
                      <strong>{player.name}</strong>
                    </div>
                    <span>{player.flameTokens} FT</span>
                    <span>{player.embers} embers</span>
                  </div>
                )
              })}
            </div>
          </article>

          <article className="status-card log-card">
            <div className="panel-heading compact">
              <h2>Event log</h2>
              <p>Recent actions for the facilitator.</p>
            </div>

            <div className="log-list">
              {game.log.map((entry) => (
                <p key={entry}>{entry}</p>
              ))}
            </div>
          </article>

          <article className="status-card">
            <div className="panel-heading compact">
              <h2>Game Master</h2>
                <p>Add or subtract embers from any team at any time.</p>
            </div>

            <div className="editor-controls">
              <label className="stack-field">
                <span className="field-label">Team</span>
                <select
                  value={gmTargetTeamId}
                  onChange={(event) => setGmTargetTeamId(event.target.value)}
                >
                  <option value="">Select a team</option>
                  {game.players.map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="stack-field">
                <span className="field-label">Embers to add or subtract</span>
                <input
                  type="number"
                  step={1}
                  value={gmEmberAmount}
                  onChange={(event) => setGmEmberAmount(event.target.value)}
                />
              </label>

              <button
                type="button"
                className="secondary-button"
                onClick={applyManualEmbers}
                disabled={!gmTargetTeamId || Math.trunc(Number(gmEmberAmount) || 0) === 0}
              >
                Apply ember change
              </button>
            </div>
          </article>

          <div className="sidebar-actions">
            <button type="button" className="ghost-button" onClick={resetToSetup}>
              Exit to setup
            </button>
          </div>
        </aside>
      </section>
    </main>
  )
}

export default App

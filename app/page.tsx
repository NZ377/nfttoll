"use client"

import type React from "react"
import { useState, useRef, useCallback, useEffect } from "react"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TraitRulesManager } from "@/components/trait-rules-manager"
import { NFTPreview } from "@/components/nft-preview"
import { TraitUsageStats } from "@/components/trait-usage-stats"
import { RarityAnalysis } from "@/components/rarity-analysis"
import { ExportManager } from "@/components/export-manager"
import { colorFamilyFromName } from "@/lib/color-utils"

interface LayerItem {
  id: number
  name: string
  dataUrl: string
  rarity?: number
  count?: number // desired total count across the whole collection
}

interface RarityPreset {
  name: string
  weights: number[]
}

interface Layer {
  id: number
  name: string
  items: LayerItem[]
  zIndex: number
  exactCountMode?: boolean // whether this layer uses exact numbers mode
}

interface TraitMatchingRule {
  id: number
  sourceLayerId: number
  targetLayerId: number
  sourceLayerName: string
  targetLayerName: string
  property: string
}

interface TraitExclusionRule {
  id: number
  sourceLayerId: number
  targetLayerId: number
  sourceLayerName: string
  targetLayerName: string
  sourceItemId?: number
  targetItemId?: number
  sourceItemName?: string
  targetItemName?: string
  property?: string
}

interface ManualMapping {
  id: number
  sourceLayerId: number
  sourceItemId: number
  targetLayerId: number
  targetItemId: number
  sourceLayerName: string
  targetLayerName: string
  sourceItemName: string
  targetItemName: string
}

interface ProjectState {
  layers: Layer[]
  traitMatchingRules: TraitMatchingRule[]
  traitExclusionRules: TraitExclusionRule[]
  manualMappings: ManualMapping[]
  rarityMode: "equal" | "weighted"
  traitUsageStats: Record<string, Record<number, number>>
  generatedCombinations: string[]
  nextId: number
  nextRuleId: number
  nextExclusionId: number
  nextMappingId: number
}

interface BatchData {
  combinations: Record<number, number>[]
  batchNumber: number
  collectionName: string
  imageSize: number
  startingNumber: number
}

type ExportStatus = "generating" | "ready" | "downloading" | "completed" | "paused"

interface ExportSession {
  id: string
  totalCount: number
  batchSize: number
  collectionName: string
  imageSize: number
  useRules: boolean
  currentBatch: number
  totalBatches: number
  completedBatches: number[]
  generatedCombinations: string[]
  timestamp: number
  status: ExportStatus
  currentBatchData?: BatchData
  autoDownload: boolean
  quotas?: Record<string, number>
  pairUsage?: Record<string, number>
}

// Helper keys
const quotaKey = (layerId: number, itemId: number) => `${layerId}:${itemId}`
const rulePairKey = (ruleId: number, sourceItemId: number, targetLayerId: number, targetItemId: number) =>
  `R|${ruleId}|${sourceItemId}|${targetLayerId}|${targetItemId}`
const mapPairKey = (sourceItemId: number, targetLayerId: number, targetItemId: number) =>
  `M|${sourceItemId}|${targetLayerId}|${targetItemId}`

export default function NFTLayerViewer() {
  const { toast } = useToast()
  const [layers, setLayers] = useState<Layer[]>([])
  const [traitMatchingRules, setTraitMatchingRules] = useState<TraitMatchingRule[]>([])
  const [traitExclusionRules, setTraitExclusionRules] = useState<TraitExclusionRule[]>([])
  const [manualMappings, setManualMappings] = useState<ManualMapping[]>([])
  const [selectedItems, setSelectedItems] = useState<Record<number, number>>({})
  const [exportProgress, setExportProgress] = useState(0)
  const [isExporting, setIsExporting] = useState<boolean>(false)
  const [exportCancelled, setExportCancelled] = useState(false)

  const [uniquenessData, setUniquenessData] = useState<{
    totalCombinations: number
    uniquenessPercentage: number
  } | null>(null)

  const [nextId, setNextId] = useState(1)
  const [nextRuleId, setNextRuleId] = useState(1)
  const [nextExclusionId, setNextExclusionId] = useState(1)
  const [nextMappingId, setNextMappingId] = useState(1)

  const [rarityMode, setRarityMode] = useState<"equal" | "weighted">("equal")
  const [rarityPresets] = useState<RarityPreset[]>([
    { name: "Equal Distribution", weights: [] },
    { name: "Common/Rare (80/20)", weights: [80, 20] },
    { name: "Common/Uncommon/Rare (70/25/5)", weights: [70, 25, 5] },
    { name: "Pyramid (50/30/15/5)", weights: [50, 30, 15, 5] },
    { name: "Ultra Rare (90/8/2)", weights: [90, 8, 2] },
  ])

  const fileInputRef = useRef<HTMLInputElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null)

  const [generatedCombinations, setGeneratedCombinations] = useState<Set<string>>(new Set())

  // Batch export & session
  const [batchExportMode, setBatchExportMode] = useState(false)
  const [currentBatch, setCurrentBatch] = useState(1)
  const currentBatchRef = useRef(1)
  useEffect(() => {
    currentBatchRef.current = currentBatch
  }, [currentBatch])

  const [totalBatches, setTotalBatches] = useState(1)
  const [batchStatus, setBatchStatus] = useState<ExportStatus>("generating")
  const [completedBatches, setCompletedBatches] = useState<number[]>([])
  const [currentBatchData, setCurrentBatchData] = useState<BatchData | null>(null)
  const [exportConfig, setExportConfig] = useState<{
    totalCount: number
    batchSize: number
    collectionName: string
    imageSize: number
    useRules: boolean
  } | null>(null)
  const [exportSession, setExportSession] = useState<ExportSession | null>(null)
  const [autoDownload, setAutoDownload] = useState(false)
  const [progressDetails, setProgressDetails] = useState<string>("")

  // Quotas & pair usage
  const quotasRef = useRef<Record<string, number>>({})
  const pairUsageRef = useRef<Record<string, number>>({})

  // Concurrency guards
  const isGeneratingRef = useRef(false)
  const isDownloadingRef = useRef(false)

  // Session persistence
  const saveExportSession = useCallback((session: ExportSession) => {
    try {
      localStorage.setItem("nft-export-session", JSON.stringify(session))
    } catch (error) {
      console.error("Failed to save export session:", error)
    }
  }, [])

  const loadExportSession = useCallback((): ExportSession | null => {
    try {
      const saved = localStorage.getItem("nft-export-session")
      if (saved) {
        const session = JSON.parse(saved) as ExportSession
        if (Date.now() - session.timestamp < 24 * 60 * 60 * 1000) {
          return session
        } else {
          localStorage.removeItem("nft-export-session")
        }
      }
    } catch (error) {
      console.error("Failed to load export session:", error)
      localStorage.removeItem("nft-export-session")
    }
    return null
  }, [])

  const clearExportSession = useCallback(() => {
    localStorage.removeItem("nft-export-session")
  }, [])

  // Load session on mount (after layers exist)
  useEffect(() => {
    const savedSession = loadExportSession()
    if (savedSession && layers.length > 0) {
      setExportSession(savedSession)
      setExportConfig({
        totalCount: savedSession.totalCount,
        batchSize: savedSession.batchSize,
        collectionName: savedSession.collectionName,
        imageSize: savedSession.imageSize,
        useRules: savedSession.useRules,
      })
      setBatchExportMode(true)
      setCurrentBatch(savedSession.currentBatch)
      setTotalBatches(savedSession.totalBatches)
      setCompletedBatches(savedSession.completedBatches)
      setBatchStatus(savedSession.status === "generating" ? "paused" : savedSession.status)
      setCurrentBatchData(savedSession.currentBatchData || null)
      setAutoDownload(savedSession.autoDownload || false)
      setGeneratedCombinations(new Set(savedSession.generatedCombinations))
      quotasRef.current = savedSession.quotas || {}
      pairUsageRef.current = savedSession.pairUsage || {}

      toast({
        title: "Session Restored",
        description: `Resumed export session: ${savedSession.collectionName} (Batch ${savedSession.currentBatch}/${savedSession.totalBatches})`,
      })
    }
  }, [layers.length, loadExportSession, toast])

  // Persist session
  useEffect(() => {
    if (exportSession) saveExportSession(exportSession)
  }, [exportSession, saveExportSession])

  // Warn before leaving
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (batchExportMode && (batchStatus === "generating" || batchStatus === "downloading")) {
        e.preventDefault()
        e.returnValue = "NFT generation is in progress. Are you sure you want to leave?"
        return "NFT generation is in progress. Are you sure you want to leave?"
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => window.removeEventListener("beforeunload", handleBeforeUnload)
  }, [batchExportMode, batchStatus])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) abortControllerRef.current.abort()
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current)
    }
  }, [])

  // Audio notification
  const playNotificationSound = useCallback(() => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      const playBeep = (frequency: number, duration: number, delay: number) => {
        setTimeout(() => {
          const oscillator = audioContext.createOscillator()
          const gainNode = audioContext.createGain()
          oscillator.connect(gainNode)
          gainNode.connect(audioContext.destination)
          oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime)
          oscillator.type = "sine"
          gainNode.gain.setValueAtTime(0.3, audioContext.currentTime)
          gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration)
          oscillator.start(audioContext.currentTime)
          oscillator.stop(audioContext.currentTime + duration)
        }, delay)
      }
      playBeep(800, 0.15, 0)
      playBeep(1000, 0.15, 200)
      playBeep(1200, 0.3, 400)
    } catch {
      // ignore
    }
  }, [])

  // Layer management
  const addLayer = useCallback(
    async (layerName: string, files: FileList) => {
      if (!layerName.trim()) {
        toast({ title: "Error", description: "Please enter a layer name", variant: "destructive" })
        return
      }
      if (files.length === 0) {
        toast({ title: "Error", description: "Please select at least one image file", variant: "destructive" })
        return
      }

      const layerId = nextId
      setNextId((prev) => prev + 1)
      const zIndex = layers.length

      const layer: Layer = {
        id: layerId,
        name: layerName,
        items: [],
        zIndex,
        exactCountMode: false,
      }

      const items: LayerItem[] = []
      const fileArray = Array.from(files)

      for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i]
        if (!file.type.startsWith("image/")) continue

        const itemName = file.name.replace(/\.[^/.]+$/, "")
        const itemId = Math.floor(Date.now() * 1000 + i + Math.random() * 1000)

        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = (e) => {
            const result = e.target?.result
            if (typeof result === "string") resolve(result)
            else reject(new Error("Failed to read file as data URL"))
          }
          reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`))
          reader.readAsDataURL(file)
        })

        items.push({
          id: itemId,
          name: itemName,
          dataUrl,
          rarity: 100 / fileArray.length,
          count: 0,
        })
      }

      if (items.length > 0) {
        layer.items = items
        setLayers((prev) => [...prev, layer])
        toast({
          title: "Success",
          description: `Added ${items.length} of ${files.length} images to "${layerName}"`,
        })
      } else {
        toast({
          title: "Error",
          description: "No valid images were added. Please check that you selected image files.",
          variant: "destructive",
        })
      }
    },
    [layers.length, nextId, toast],
  )

  const addTestLayer = useCallback(() => {
    const layerId = nextId
    setNextId((prev) => prev + 1)
    const zIndex = layers.length
    const layer: Layer = {
      id: layerId,
      name: `Test Layer ${layerId}`,
      items: [
        {
          id: Date.now() + 1,
          name: "Race A",
          dataUrl:
            "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iI2ZmMDAwMCIvPjwvc3ZnPg==",
          rarity: 33.33,
          count: 0,
        },
        {
          id: Date.now() + 2,
          name: "Race B",
          dataUrl:
            "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI0MCIgZmlsbD0iIzAwMDBmZiIvPjwvc3ZnPg==",
          rarity: 33.33,
          count: 0,
        },
        {
          id: Date.now() + 3,
          name: "Race C",
          dataUrl:
            "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIj48cG9seWdvbiBwb2ludHM9IjUwLDEwIDkwLDkwIDEwLDkwIiBmaWxsPSIjMDBmZjAwIi8+PC9zdmc+",
          rarity: 33.33,
          count: 0,
        },
      ],
      zIndex,
      exactCountMode: false,
    }

    setLayers((prev) => [...prev, layer])
    toast({
      title: "Success",
      description: `Added test layer "${layer.name}"`,
    })
  }, [layers.length, nextId, toast])

  const removeLayer = useCallback(
    (layerId: number) => {
      setLayers((prev) => {
        const layerIndex = prev.findIndex((l) => l.id === layerId)
        if (layerIndex === -1) return prev

        const removedZIndex = prev[layerIndex].zIndex
        const newLayers = prev.filter((l) => l.id !== layerId)

        return newLayers.map((layer) => ({
          ...layer,
          zIndex: layer.zIndex > removedZIndex ? layer.zIndex - 1 : layer.zIndex,
        }))
      })

      setTraitMatchingRules((prev) =>
        prev.filter((rule) => rule.sourceLayerId !== layerId && rule.targetLayerId !== layerId),
      )
      setTraitExclusionRules((prev) =>
        prev.filter((rule) => rule.sourceLayerId !== layerId && rule.targetLayerId !== layerId),
      )
      setManualMappings((prev) => prev.filter((m) => m.sourceLayerId !== layerId && m.targetLayerId !== layerId))

      setSelectedItems((prev) => {
        const newSelected = { ...prev }
        delete newSelected[layerId]
        return newSelected
      })

      toast({
        title: "Success",
        description: "Layer removed",
      })
    },
    [toast],
  )

  const moveLayer = useCallback((layerId: number, direction: "up" | "down") => {
    setLayers((prev) => {
      const layer = prev.find((l) => l.id === layerId)
      if (!layer) return prev

      const maxZIndex = Math.max(...prev.map((l) => l.zIndex))
      const minZIndex = Math.min(...prev.map((l) => l.zIndex))

      if (direction === "up" && layer.zIndex >= maxZIndex) return prev
      if (direction === "down" && layer.zIndex <= minZIndex) return prev

      const targetZIndex = direction === "up" ? layer.zIndex + 1 : layer.zIndex - 1
      const targetLayer = prev.find((l) => l.zIndex === targetZIndex)
      if (!targetLayer) return prev

      return prev.map((l) => {
        if (l.id === layerId) return { ...l, zIndex: targetZIndex }
        if (l.id === targetLayer.id) return { ...l, zIndex: layer.zIndex }
        return l
      })
    })
  }, [])

  const addTraitMatchingRule = useCallback(
    (sourceLayerId: number, targetLayerId: number, property: string) => {
      const sourceLayer = layers.find((l) => l.id === sourceLayerId)
      const targetLayer = layers.find((l) => l.id === targetLayerId)
      if (!sourceLayer || !targetLayer) return

      const rule: TraitMatchingRule = {
        id: nextRuleId,
        sourceLayerId,
        targetLayerId,
        sourceLayerName: sourceLayer.name,
        targetLayerName: targetLayer.name,
        property,
      }

      setTraitMatchingRules((prev) => [...prev, rule])
      setNextRuleId((prev) => prev + 1)

      toast({
        title: "Success",
        description: `Added matching rule: ${sourceLayer.name} → ${targetLayer.name} (${property})`,
      })
    },
    [layers, nextRuleId, toast],
  )

  const addTraitExclusionRule = useCallback(
    (sourceLayerId: number, targetLayerId: number, property?: string, sourceItemId?: number, targetItemId?: number) => {
      const sourceLayer = layers.find((l) => l.id === sourceLayerId)
      const targetLayer = layers.find((l) => l.id === targetLayerId)

      if (!sourceLayer || !targetLayer) return

      const sourceItem = sourceItemId ? sourceLayer.items.find((i) => i.id === sourceItemId) : undefined
      const targetItem = targetItemId ? targetLayer.items.find((i) => i.id === targetItemId) : undefined

      const rule: TraitExclusionRule = {
        id: nextExclusionId,
        sourceLayerId,
        targetLayerId,
        sourceLayerName: sourceLayer.name,
        targetLayerName: targetLayer.name,
        property,
        sourceItemId,
        targetItemId,
        sourceItemName: sourceItem?.name,
        targetItemName: targetItem?.name,
      }

      setTraitExclusionRules((prev) => [...prev, rule])
      setNextExclusionId((prev) => prev + 1)

      const ruleDescription = property
        ? `${sourceLayer.name} → ${targetLayer.name} (${property})`
        : `"${sourceItem?.name}" → "${targetItem?.name}"`

      toast({
        title: "Success",
        description: `Added exclusion rule: ${ruleDescription}`,
      })
    },
    [layers, nextExclusionId, toast],
  )

  const addManualMapping = useCallback(
    (mapping: ManualMapping) => {
      setManualMappings((prev) => [...prev, mapping])
      setNextMappingId((prev) => prev + 1)

      toast({
        title: "Success",
        description: `Added manual mapping: "${mapping.sourceItemName}" → "${mapping.targetItemName}"`,
      })
    },
    [toast],
  )

  const removeManualMapping = useCallback(
    (mappingId: number) => {
      setManualMappings((prev) => prev.filter((mapping) => mapping.id !== mappingId))
      toast({
        title: "Success",
        description: "Manual mapping removed",
      })
    },
    [toast],
  )

  const removeTraitExclusionRule = useCallback(
    (ruleId: number) => {
      setTraitExclusionRules((prev) => prev.filter((rule) => rule.id !== ruleId))
      toast({
        title: "Success",
        description: "Exclusion rule removed",
      })
    },
    [toast],
  )

  // Property extraction helper
  const extractProperty = (itemName: string, property: string) => {
    const colors = [
      "red",
      "blue",
      "green",
      "yellow",
      "purple",
      "orange",
      "black",
      "white",
      "brown",
      "pink",
      "cyan",
      "magenta",
      "gray",
      "grey",
      "charcoal",
      "silver",
      "gold",
      "violet",
      "indigo",
      "turquoise",
      "lime",
      "navy",
      "maroon",
      "olive",
    ]
    const words = itemName
      .toLowerCase()
      .split(/[\s\-_]+/)
      .filter((word) => word.length > 0)

    if (property.toLowerCase() === "color") {
      const colorWord = words.find((word) => colors.includes(word))
      return colorWord || words[0]
    }

    const propertyIndex = words.findIndex((word) => word.includes(property.toLowerCase()))
    if (propertyIndex >= 0 && propertyIndex < words.length - 1) {
      return words[propertyIndex + 1]
    }

    return words[0]
  }

  // Usage stats
  const [traitUsageStats, setTraitUsageStats] = useState<Record<string, Record<number, number>>>({})

  // Weighted selection
  const selectWeightedRandom = (items: LayerItem[], layerId: number, forceBalance = false): LayerItem | null => {
    if (items.length === 0) return null

    if (!forceBalance) {
      if (rarityMode === "equal" || items.every((item) => !item.rarity)) {
        const randomIndex = Math.floor(Math.random() * items.length)
        return items[randomIndex]
      }
      const totalWeight = items.reduce((sum, item) => sum + (item.rarity || 0), 0)
      let random = Math.random() * totalWeight
      for (const item of items) {
        random -= item.rarity || 0
        if (random <= 0) {
          return item
        }
      }
      return items[items.length - 1]
    }

    const layerStats = traitUsageStats[layerId] || {}
    const totalUsageInLayer = Object.values(layerStats).reduce((sum, count) => sum + count, 0)
    const averageUsage = totalUsageInLayer > 0 ? totalUsageInLayer / items.length : 0

    const scoredItems = items.map((item) => {
      const usage = layerStats[item.id] || 0
      let usageMultiplier = 1

      if (usage === 0) {
        usageMultiplier = 10
      } else if (averageUsage > 0 && usage < averageUsage) {
        usageMultiplier = 1 + ((averageUsage - usage) / averageUsage) * 2
      }

      const baseWeight = rarityMode === "weighted" ? item.rarity || 1 : 1
      const score = baseWeight * usageMultiplier

      return { ...item, score }
    })

    const totalScore = scoredItems.reduce((sum, item) => sum + (item as any).score, 0)
    if (totalScore === 0) {
      return items[Math.floor(Math.random() * items.length)]
    }

    let random = Math.random() * totalScore
    for (const item of scoredItems as any[]) {
      random -= item.score
      if (random <= 0) {
        return item
      }
    }

    return scoredItems[scoredItems.length - 1] as any
  }

  // Quota-based selection for exact-count layers
  const selectWithQuota = (layer: Layer): LayerItem | null => {
    const candidates = layer.items.filter((it) => (quotasRef.current[quotaKey(layer.id, it.id)] || 0) > 0)
    if (candidates.length === 0) return null
    const weights = candidates.map((it) => quotasRef.current[quotaKey(layer.id, it.id)] || 0)
    const total = weights.reduce((s, w) => s + w, 0)
    let r = Math.random() * total
    for (let i = 0; i < candidates.length; i++) {
      r -= weights[i]
      if (r <= 0) return candidates[i]
    }
    return candidates[candidates.length - 1]
  }

  const updateTraitUsage = (combination: Record<number, number>) => {
    setTraitUsageStats((prev) => {
      const newStats = { ...prev }
      Object.entries(combination).forEach(([layerId, itemId]) => {
        const layerIdNum = Number(layerId)
        const itemIdNum = Number(itemId)

        if (!newStats[layerIdNum]) {
          newStats[layerIdNum] = {}
        }

        newStats[layerIdNum][itemIdNum] = (newStats[layerIdNum][itemIdNum] || 0) + 1
      })
      return newStats
    })
  }

  // Head/Body helpers
  const getHeadBodyLayers = () => {
    const headLayer = layers.find((l) => /head|face|skull/i.test(l.name))
    const bodyLayer = layers.find((l) => /body|torso/i.test(l.name))
    return { headLayer, bodyLayer }
  }

  const isHeadBodyCoherent = (combo: Record<number, number>): boolean => {
    const { headLayer, bodyLayer } = getHeadBodyLayers()
    if (!headLayer || !bodyLayer) return true
    const headId = combo[headLayer.id]
    const bodyId = combo[bodyLayer.id]
    if (!headId || !bodyId) return true
    const headItem = headLayer.items.find((i) => i.id === headId)
    const bodyItem = bodyLayer.items.find((i) => i.id === bodyId)
    if (!headItem || !bodyItem) return true
    const hf = colorFamilyFromName(headItem.name)
    const bf = colorFamilyFromName(bodyItem.name)
    if (!hf || !bf) return true
    return hf === bf
  }

  const tryFixBodyToMatchHead = (combo: Record<number, number>, respectQuotas: boolean): boolean => {
    const { headLayer, bodyLayer } = getHeadBodyLayers()
    if (!headLayer || !bodyLayer) return true

    const headItem = headLayer.items.find((i) => i.id === combo[headLayer.id])
    if (!headItem) return true

    const match = findMatchingItem(headItem, bodyLayer.items, "color")
    if (!match) return false

    if (respectQuotas && bodyLayer.exactCountMode) {
      const rem = quotasRef.current[quotaKey(bodyLayer.id, match.id)] || 0
      if (rem <= 0) return false
    }

    // check exclusions
    const proposal = { ...combo, [bodyLayer.id]: match.id }
    for (const rule of traitExclusionRules) {
      const sId = proposal[rule.sourceLayerId]
      const tId = proposal[rule.targetLayerId]
      if (!sId || !tId) continue
      if (rule.sourceItemId && rule.targetItemId) {
        if (sId === rule.sourceItemId && tId === rule.targetItemId) return false
      } else if (rule.property) {
        const sLayer = layers.find((l) => l.id === rule.sourceLayerId)
        const tLayer = layers.find((l) => l.id === rule.targetLayerId)
        const sItem = sLayer?.items.find((i) => i.id === sId)
        const tItem = tLayer?.items.find((i) => i.id === tId)
        if (sItem && tItem) {
          const sp = extractProperty(sItem.name, rule.property)
          const tp = extractProperty(tItem.name, rule.property)
          if (sp.toLowerCase() === tp.toLowerCase()) return false
        }
      }
    }

    combo[bodyLayer.id] = match.id
    return true
  }

  // Rules composition
  const getEffectiveMatchingRules = () => {
    const rules = [...traitMatchingRules]
    const { headLayer, bodyLayer } = getHeadBodyLayers()

    if (headLayer && bodyLayer) {
      const exists = rules.some(
        (r) =>
          r.sourceLayerId === headLayer.id && r.targetLayerId === bodyLayer.id && r.property.toLowerCase() === "color",
      )
      if (!exists) {
        rules.push({
          id: -1,
          sourceLayerId: headLayer.id,
          targetLayerId: bodyLayer.id,
          sourceLayerName: headLayer.name,
          targetLayerName: bodyLayer.name,
          property: "color",
        })
      }
    }

    // sort: explicit rules first, implicit last
    return rules.sort((a, b) => {
      if (a.id === -1 && b.id !== -1) return 1
      if (a.id !== -1 && b.id === -1) return -1
      return 0
    })
  }

  // Single property helper (compat)
  const findMatchingItem = (sourceItem: any, targetItems: any[], property: string) => {
    if (property === "name") {
      const sourcePrefix = sourceItem.name.split(/[-_]/)[0].toLowerCase().trim()
      return targetItems.find((item) => {
        const targetPrefix = item.name.split(/[-_]/)[0].toLowerCase().trim()
        return sourcePrefix === targetPrefix
      })
    }

    if (property.toLowerCase() === "color") {
      const sourceFamily = colorFamilyFromName(sourceItem.name)
      if (!sourceFamily) return null
      const matches = targetItems.filter((t) => colorFamilyFromName(t.name) === sourceFamily)
      if (matches.length > 0) {
        return matches[Math.floor(Math.random() * matches.length)]
      }
      return null
    }

    const sourceWords = sourceItem.name
      .toLowerCase()
      .split(/[\s\-_]+/)
      .filter((word: string) => word.length > 0)
    const propertyIndex = sourceWords.findIndex((word: string) => word.includes(property.toLowerCase()))
    const sourceProperty =
      propertyIndex >= 0 && propertyIndex < sourceWords.length - 1 ? sourceWords[propertyIndex + 1] : sourceWords[0]

    const matchingItems = targetItems.filter((item) => {
      const targetWords = item.name
        .toLowerCase()
        .split(/[\s\-_]+/)
        .filter((word: string) => word.length > 0)
      const targetPropertyIndex = targetWords.findIndex((word: string) => word.includes(property.toLowerCase()))
      const targetProperty =
        targetPropertyIndex >= 0 && targetPropertyIndex < targetWords.length - 1
          ? targetWords[targetPropertyIndex + 1]
          : targetWords[0]
      return sourceProperty === targetProperty
    })

    if (matchingItems.length > 0) {
      return matchingItems[Math.floor(Math.random() * matchingItems.length)]
    }
    return null
  }

  // Advanced matching: apply all (manual, then rules) with fixpoint passes
  const getRuleCandidates = (rule: TraitMatchingRule, sourceItem: LayerItem, targetLayer: Layer): LayerItem[] => {
    if (rule.property.toLowerCase() === "color") {
      const fam = colorFamilyFromName(sourceItem.name)
      if (!fam) return []
      return targetLayer.items.filter((it) => colorFamilyFromName(it.name) === fam)
    }
    if (rule.property === "name") {
      const srcPrefix = sourceItem.name.split(/[-_]/)[0].toLowerCase().trim()
      return targetLayer.items.filter((it) => it.name.split(/[-_]/)[0].toLowerCase().trim() === srcPrefix)
    }
    const srcWords = sourceItem.name
      .toLowerCase()
      .split(/[\s\-_]+/)
      .filter(Boolean)
    const idx = srcWords.findIndex((w) => w.includes(rule.property.toLowerCase()))
    const srcProp = idx >= 0 && idx < srcWords.length - 1 ? srcWords[idx + 1] : srcWords[0]
    return targetLayer.items.filter((it) => {
      const words = it.name
        .toLowerCase()
        .split(/[\s\-_]+/)
        .filter(Boolean)
      const i = words.findIndex((w) => w.includes(rule.property.toLowerCase()))
      const val = i >= 0 && i < words.length - 1 ? words[i + 1] : words[0]
      return val === srcProp
    })
  }

  const chooseCandidateBalanced = (
    candidates: LayerItem[],
    targetLayer: Layer,
    opts: { rule?: TraitMatchingRule; sourceItemId?: number; respectQuotas: boolean },
  ): LayerItem | null => {
    if (candidates.length === 0) return null

    const weights = candidates.map((cand) => {
      const quotaRem =
        opts.respectQuotas && targetLayer.exactCountMode
          ? Math.max(0, quotasRef.current[quotaKey(targetLayer.id, cand.id)] || 0)
          : 1

      let pairKey: string | null = null
      if (opts.rule && opts.sourceItemId != null) {
        pairKey = rulePairKey(opts.rule.id, opts.sourceItemId, targetLayer.id, cand.id)
      }
      const pairUsed = pairKey ? pairUsageRef.current[pairKey] || 0 : 0

      const tLayerStats = traitUsageStats[targetLayer.id] || {}
      const tUsage = tLayerStats[cand.id] || 0
      const avgT = Object.values(tLayerStats).reduce((s, c) => s + c, 0) / Math.max(1, targetLayer.items.length)
      const usageBoost = avgT > 0 && tUsage < avgT ? 1 + ((avgT - tUsage) / avgT) * 1.5 : tUsage === 0 ? 2 : 1

      const score = (Math.max(0.001, quotaRem) * usageBoost) / (1 + pairUsed)
      return Math.max(0.0001, score)
    })

    const total = weights.reduce((s, w) => s + w, 0)
    let r = Math.random() * total
    for (let i = 0; i < candidates.length; i++) {
      r -= weights[i]
      if (r <= 0) return candidates[i]
    }
    return candidates[candidates.length - 1]
  }

  const applyAllMatching = (
    selected: Record<number, number>,
    respectQuotas: boolean,
  ): { changed: boolean; selected: Record<number, number> } => {
    let changed = false
    const effectiveRules = getEffectiveMatchingRules()

    const respectsExclusions = (candidateSelected: Record<number, number>) => {
      for (const rule of traitExclusionRules) {
        const sId = candidateSelected[rule.sourceLayerId]
        const tId = candidateSelected[rule.targetLayerId]
        if (!sId || !tId) continue
        if (rule.sourceItemId && rule.targetItemId) {
          if (sId === rule.sourceItemId && tId === rule.targetItemId) return false
        } else if (rule.property) {
          const sLayer = layers.find((l) => l.id === rule.sourceLayerId)
          const tLayer = layers.find((l) => l.id === rule.targetLayerId)
          const sItem = sLayer?.items.find((i) => i.id === sId)
          const tItem = tLayer?.items.find((i) => i.id === tId)
          if (sItem && tItem) {
            const sp = extractProperty(sItem.name, rule.property)
            const tp = extractProperty(tItem.name, rule.property)
            if (sp.toLowerCase() === tp.toLowerCase()) return false
          }
        }
      }
      return true
    }

    for (let pass = 0; pass < 3; pass++) {
      let passChanged = false

      // Manual mappings (hard constraints)
      for (const mapping of manualMappings) {
        const srcAssigned = selected[mapping.sourceLayerId]
        if (srcAssigned === mapping.sourceItemId) {
          if (selected[mapping.targetLayerId] === undefined) {
            if (
              !respectQuotas ||
              !layers.find((l) => l.id === mapping.targetLayerId)?.exactCountMode ||
              (quotasRef.current[quotaKey(mapping.targetLayerId, mapping.targetItemId)] || 0) > 0
            ) {
              const proposal = { ...selected, [mapping.targetLayerId]: mapping.targetItemId }
              if (respectsExclusions(proposal)) {
                selected[mapping.targetLayerId] = mapping.targetItemId
                const key = mapPairKey(mapping.sourceItemId, mapping.targetLayerId, mapping.targetItemId)
                pairUsageRef.current[key] = (pairUsageRef.current[key] || 0) + 1
                passChanged = true
              }
            }
          }
        }
      }

      // Property-based rules
      for (const rule of effectiveRules) {
        const srcItemId = selected[rule.sourceLayerId]
        if (!srcItemId) continue
        if (selected[rule.targetLayerId] !== undefined) continue

        const srcLayer = layers.find((l) => l.id === rule.sourceLayerId)
        const tgtLayer = layers.find((l) => l.id === rule.targetLayerId)
        if (!srcLayer || !tgtLayer) continue

        const srcItem = srcLayer.items.find((i) => i.id === srcItemId)
        if (!srcItem) continue

        const candidatesRaw = getRuleCandidates(rule, srcItem, tgtLayer)
        if (candidatesRaw.length === 0) continue

        const candidates = candidatesRaw.filter((cand) => {
          if (!respectQuotas || !tgtLayer.exactCountMode) return true
          return (quotasRef.current[quotaKey(tgtLayer.id, cand.id)] || 0) > 0
        })
        if (candidates.length === 0) continue

        const chosen = chooseCandidateBalanced(candidates, tgtLayer, {
          rule,
          sourceItemId: srcItem.id,
          respectQuotas,
        })
        if (!chosen) continue

        const proposal = { ...selected, [tgtLayer.id]: chosen.id }
        if (!respectsExclusions(proposal)) continue

        selected[tgtLayer.id] = chosen.id
        const pKey = rulePairKey(rule.id, srcItem.id, tgtLayer.id, chosen.id)
        pairUsageRef.current[pKey] = (pairUsageRef.current[pKey] || 0) + 1
        passChanged = true
      }

      if (!passChanged) break
      changed = changed || passChanged
    }

    return { changed, selected }
  }

  // Random combination (weighted)
  const generateRandomCombination = (useBalancing = false): Record<number, number> => {
    const combination: Record<number, number> = {}
    layers.forEach((layer) => {
      if (layer.items.length > 0) {
        const selectedItem = selectWeightedRandom(layer.items, layer.id, useBalancing)
        if (selectedItem) {
          combination[layer.id] = selectedItem.id
        }
      }
    })
    return combination
  }

  // Quotas checks
  const combinationRespectsQuotas = (combo: Record<number, number>): boolean => {
    for (const layer of layers) {
      if (!layer.exactCountMode) continue
      const itemId = combo[layer.id]
      if (!itemId) return false
      const rem = quotasRef.current[quotaKey(layer.id, itemId)] || 0
      if (rem <= 0) return false
    }
    return true
  }

  const decrementQuotasForCombination = (combo: Record<number, number>) => {
    for (const layer of layers) {
      if (!layer.exactCountMode) continue
      const itemId = combo[layer.id]
      if (!itemId) continue
      const key = quotaKey(layer.id, itemId)
      quotasRef.current[key] = Math.max(0, (quotasRef.current[key] || 0) - 1)
    }
  }

  // Selection change in preview
  const handleSelectionChange = (next: Record<number, number>) => {
    const updated = { ...next }
    applyAllMatching(updated, false)
    setSelectedItems(updated)
  }

  // Valid combination generator
  const generateValidCombination = (useBalancing = false, respectQuotas = false): Record<number, number> => {
    const maxAttempts = 400
    let attempts = 0

    const effectiveRules = getEffectiveMatchingRules()
    const sourceLayerIds = new Set([
      ...effectiveRules.map((r) => r.sourceLayerId),
      ...manualMappings.map((m) => m.sourceLayerId),
    ])

    while (attempts < maxAttempts) {
      attempts++
      const combination: Record<number, number> = {}

      // Source layers first
      const sourceLayers = layers
        .filter((l) => sourceLayerIds.has(l.id))
        .sort((a, b) => a.items.length - b.items.length)

      for (const sourceLayer of sourceLayers) {
        let item: LayerItem | null = null
        if (sourceLayer.exactCountMode && respectQuotas) {
          item = selectWithQuota(sourceLayer)
        } else {
          item = selectWeightedRandom(sourceLayer.items, sourceLayer.id, useBalancing)
        }
        if (!item) continue
        combination[sourceLayer.id] = item.id

        // Apply rules after setting a source selection
        applyAllMatching(combination, respectQuotas)
      }

      // Fill remaining layers
      const freeLayers = layers.filter((l) => combination[l.id] === undefined)
      for (const layer of freeLayers) {
        let item: LayerItem | null = null
        if (layer.exactCountMode && respectQuotas) {
          item = selectWithQuota(layer)
        } else {
          item = selectWeightedRandom(layer.items, layer.id, useBalancing)
        }
        if (item) {
          combination[layer.id] = item.id
        }
      }

      // Final pass to catch cascades
      applyAllMatching(combination, respectQuotas)

      // Exclusion validation
      let isValid = true
      for (const rule of traitExclusionRules) {
        const sourceItemId = combination[rule.sourceLayerId]
        const targetItemId = combination[rule.targetLayerId]
        if (!sourceItemId || !targetItemId) continue

        if (rule.sourceItemId && rule.targetItemId) {
          if (sourceItemId === rule.sourceItemId && targetItemId === rule.targetItemId) {
            isValid = false
            break
          }
        } else if (rule.property) {
          const sourceLayer = layers.find((l) => l.id === rule.sourceLayerId)
          const targetLayer = layers.find((l) => l.id === rule.targetLayerId)
          const sourceItem = sourceLayer?.items.find((i) => i.id === sourceItemId)
          const targetItem = targetLayer?.items.find((i) => i.id === targetItemId)

          if (sourceItem && targetItem) {
            const sourceProperty = extractProperty(sourceItem.name, rule.property)
            const targetProperty = extractProperty(targetItem.name, rule.property)
            if (sourceProperty.toLowerCase() === targetProperty.toLowerCase()) {
              isValid = false
              break
            }
          }
        }
      }

      if (isValid && respectQuotas && !combinationRespectsQuotas(combination)) {
        isValid = false
      }

      // Head/Body cohesion
      if (isValid) {
        const fixed = tryFixBodyToMatchHead(combination, respectQuotas)
        if (!fixed || !isHeadBodyCoherent(combination)) {
          isValid = false
        }
      }

      if (isValid) {
        return combination
      }
    }

    return {}
  }

  // Preview actions
  const generateWithRules = useCallback(() => {
    if (layers.length === 0) {
      toast({ title: "Error", description: "No layers added yet", variant: "destructive" })
      return
    }

    const combination = generateValidCombination(true, false)
    if (Object.keys(combination).length === 0) {
      toast({
        title: "No Combination",
        description: "Could not find a valid combination with current rules/quotas.",
        variant: "destructive",
      })
      return
    }

    updateTraitUsage(combination)
    setSelectedItems(combination)

    toast({
      title: "Success",
      description: "Random combination with rules generated (balanced)",
    })
  }, [layers, toast])

  const generateRandom = useCallback(() => {
    if (layers.length === 0) {
      toast({ title: "Error", description: "No layers added yet", variant: "destructive" })
      return
    }

    const combination = generateRandomCombination(true)
    updateTraitUsage(combination)
    setSelectedItems(combination)

    toast({
      title: "Success",
      description: "Random combination generated (balanced)",
    })
  }, [layers, toast])

  // Uniqueness estimation (sample)
  const calculateUniqueness = useCallback(() => {
    if (layers.length === 0) {
      toast({
        title: "Error",
        description: "No layers added yet",
        variant: "destructive",
      })
      return
    }

    const layersWithItems = layers.filter((layer) => layer.items.length > 0)
    let totalTheoreticalCombinations = 1
    layersWithItems.forEach((layer) => {
      totalTheoreticalCombinations *= layer.items.length
    })

    const sampleSize = Math.min(10000, totalTheoreticalCombinations)
    const validCombinations = new Set<string>()
    const maxAttempts = sampleSize * 3

    let attempts = 0
    while (validCombinations.size < sampleSize && attempts < maxAttempts) {
      attempts++
      const combination: Record<number, number> = {}
      layersWithItems.forEach((layer) => {
        if (layer.items.length > 0) {
          const selectedItem = selectWeightedRandom(layer.items, layer.id)
          if (selectedItem) combination[layer.id] = selectedItem.id
        }
      })

      // Apply rules
      applyAllMatching(combination, false)

      // Check exclusion rules
      let isValidCombination = true
      for (const rule of traitExclusionRules) {
        const sourceItemId = combination[rule.sourceLayerId]
        const targetItemId = combination[rule.targetLayerId]
        if (!sourceItemId || !targetItemId) continue

        if (rule.sourceItemId && rule.targetItemId) {
          if (sourceItemId === rule.sourceItemId && targetItemId === rule.targetItemId) {
            isValidCombination = false
            break
          }
        } else if (rule.property) {
          const sourceLayer = layers.find((l) => l.id === rule.sourceLayerId)
          const targetLayer = layers.find((l) => l.id === rule.targetLayerId)
          const sourceItem = sourceLayer?.items.find((i) => i.id === sourceItemId)
          const targetItem = targetLayer?.items.find((i) => i.id === targetItemId)

          if (sourceItem && targetItem) {
            const sourceProperty = extractProperty(sourceItem.name, rule.property)
            const targetProperty = extractProperty(targetItem.name, rule.property)
            if (sourceProperty.toLowerCase() === targetProperty.toLowerCase()) {
              isValidCombination = false
              break
            }
          }
        }
      }

      if (isValidCombination) {
        const hash = createCombinationHash(combination)
        validCombinations.add(hash)
      }
    }

    const estimatedTotalValid =
      validCombinations.size === sampleSize && attempts < maxAttempts
        ? totalTheoreticalCombinations
        : Math.round(totalTheoreticalCombinations * (validCombinations.size / Math.max(1, attempts)))

    const uniquenessPercentage = Math.min(100, (estimatedTotalValid / Math.max(1, totalTheoreticalCombinations)) * 100)

    setUniquenessData({
      totalCombinations: estimatedTotalValid,
      uniquenessPercentage,
    })

    toast({
      title: "Success",
      description: `Found ${validCombinations.size} unique combinations in sample of ${Math.min(sampleSize, attempts)}`,
    })
  }, [layers, traitExclusionRules, toast])

  const updateItemRarity = useCallback((layerId: number, itemId: number, rarity: number) => {
    setLayers((prev) =>
      prev.map((layer) => {
        if (layer.id === layerId) {
          return {
            ...layer,
            items: layer.items.map((item) => (item.id === itemId ? { ...item, rarity } : item)),
          }
        }
        return layer
      }),
    )
  }, [])

  const updateItemCount = useCallback((layerId: number, itemId: number, nextCount: number) => {
    const safe = Math.max(0, Math.floor(nextCount) || 0)
    setLayers((prev) =>
      prev.map((layer) => {
        if (layer.id === layerId) {
          return {
            ...layer,
            items: layer.items.map((item) => (item.id === itemId ? { ...item, count: safe } : item)),
          }
        }
        return layer
      }),
    )
  }, [])

  const setLayerExactMode = useCallback((layerId: number, enabled: boolean) => {
    setLayers((prev) => prev.map((layer) => (layer.id === layerId ? { ...layer, exactCountMode: enabled } : layer)))
  }, [])

  const applyRarityPreset = useCallback(
    (layerId: number, presetName: string) => {
      const preset = rarityPresets.find((p) => p.name === presetName)
      if (!preset || preset.weights.length === 0) return

      setLayers((prev) =>
        prev.map((layer) => {
          if (layer.id === layerId) {
            const updatedItems = layer.items.map((item, index) => ({
              ...item,
              rarity: preset.weights[index % preset.weights.length] || 1,
            }))
            return { ...layer, items: updatedItems }
          }
          return layer
        }),
      )

      toast({
        title: "Success",
        description: `Applied ${presetName} rarity preset`,
      })
    },
    [rarityPresets, toast],
  )

  const normalizeRarities = useCallback(
    (layerId: number) => {
      setLayers((prev) =>
        prev.map((layer) => {
          if (layer.id === layerId) {
            const totalRarity = layer.items.reduce((sum, item) => sum + (item.rarity || 0), 0)
            if (totalRarity === 0) return layer

            const normalizedItems = layer.items.map((item) => ({
              ...item,
              rarity: ((item.rarity || 0) / totalRarity) * 100,
            }))
            return { ...layer, items: normalizedItems }
          }
          return layer
        }),
      )

      toast({
        title: "Success",
        description: "Rarities normalized to 100%",
      })
    },
    [toast],
  )

  const createCombinationHash = (combination: Record<number, number>): string => {
    const sortedKeys = Object.keys(combination).sort((a, b) => Number(a) - Number(b))
    return sortedKeys.map((key) => `${key}:${combination[Number(key)]}`).join("|")
  }

  // Compute starting quotas for exact-count layers
  function computeInitialQuotas(totalExportCount: number): Record<string, number> {
    const result: Record<string, number> = {}

    const scaleCountsToTotal = (counts: number[], total: number) => {
      const sum = counts.reduce((s, c) => s + c, 0)
      if (sum === 0) return counts.map(() => 0)
      const raw = counts.map((c) => (c / sum) * total)
      const floored = raw.map((x) => Math.floor(x))
      let remainder = total - floored.reduce((s, x) => s + x, 0)
      const fracIdx = raw
        .map((x, i) => ({ i, f: x - Math.floor(x) }))
        .sort((a, b) => b.f - a.f)
        .map((e) => e.i)
      let idx = 0
      while (remainder > 0 && idx < fracIdx.length) {
        floored[fracIdx[idx]] += 1
        remainder--
        idx++
        if (idx >= fracIdx.length) idx = 0
      }
      return floored
    }

    for (const layer of layers) {
      if (!layer.exactCountMode) continue
      const counts = layer.items.map((it) => Math.max(0, Math.floor(it.count || 0)))
      const sum = counts.reduce((s, c) => s + c, 0)

      let finalCounts = counts
      if (sum !== totalExportCount) {
        finalCounts = scaleCountsToTotal(counts, totalExportCount)
        const before = sum
        const after = finalCounts.reduce((s, c) => s + c, 0)
        toast({
          title: "Counts Scaled",
          description: `Layer "${layer.name}" counts (${before}) auto-scaled to match export size (${after}).`,
        })
      }

      layer.items.forEach((it, idx) => {
        result[quotaKey(layer.id, it.id)] = finalCounts[idx]
      })
    }

    return result
  }

  // Batch generation core
  const generateBatchCombinations = async (
    batchSize: number,
    useRules: boolean,
    signal?: AbortSignal,
  ): Promise<Record<number, number>[]> => {
    const combinations: Record<number, number>[] = []
    const batchHashes = new Set<string>()
    const maxAttempts = batchSize * 30

    let attempts = 0
    let lastProgressUpdate = Date.now()

    while (combinations.length < batchSize && attempts < maxAttempts) {
      if (signal?.aborted) throw new Error("Generation cancelled")
      attempts++

      const now = Date.now()
      if (now - lastProgressUpdate > 100) {
        const progress = Math.round((combinations.length / batchSize) * 100)
        setExportProgress(progress)
        setProgressDetails(`Generated ${combinations.length} of ${batchSize} NFTs (${attempts} attempts)`)
        lastProgressUpdate = now
      }

      let combination: Record<number, number> = {}

      try {
        if (useRules) {
          combination = generateValidCombination(true, true)
        } else {
          // Even without rules, still respect quotas and then apply rules (non-blocking) to fill targets
          combination = {}
          for (const layer of layers) {
            let item: LayerItem | null = null
            if (layer.exactCountMode) item = selectWithQuota(layer)
            else item = selectWeightedRandom(layer.items, layer.id, true)
            if (item) combination[layer.id] = item.id
          }
          applyAllMatching(combination, true)
        }

        if (Object.keys(combination).length === 0) continue

        const hash = createCombinationHash(combination)
        if (!batchHashes.has(hash) && !generatedCombinations.has(hash)) {
          if (combinationRespectsQuotas(combination)) {
            combinations.push(combination)
            batchHashes.add(hash)
            updateTraitUsage(combination)
            decrementQuotasForCombination(combination)
          }
        }
      } catch {
        // ignore and continue
        continue
      }

      if (attempts % 25 === 0) await new Promise((resolve) => setTimeout(resolve, 1))
    }

    // Update global generated combinations
    setGeneratedCombinations((prev) => new Set([...prev, ...batchHashes]))

    // Persist quotas/pair usage to session if active
    if (exportSession) {
      setExportSession({
        ...exportSession,
        quotas: { ...quotasRef.current },
        pairUsage: { ...pairUsageRef.current },
        timestamp: Date.now(),
      })
    }

    return combinations
  }

  const downloadBatch = async (batchData: BatchData) => {
    if (isDownloadingRef.current || batchStatus === "downloading") return
    isDownloadingRef.current = true

    setBatchStatus("downloading")
    setExportProgress(0)
    setProgressDetails("Initializing download...")

    const abortController = new AbortController()
    abortControllerRef.current = abortController

    try {
      const { default: JSZip } = await import("jszip")
      const zip = new JSZip()
      const imagesFolder = zip.folder("images")
      const metadataFolder = zip.folder("metadata")

      for (let i = 0; i < batchData.combinations.length; i++) {
        if (abortController.signal.aborted) throw new Error("Download cancelled")

        const nftProgress = Math.round((i / batchData.combinations.length) * 80)
        setExportProgress(nftProgress)
        setProgressDetails(`Generating NFT ${i + 1} of ${batchData.combinations.length}...`)

        const combination = batchData.combinations[i]
        const nftNumber = batchData.startingNumber + i

        try {
          const canvas = document.createElement("canvas")
          canvas.width = batchData.imageSize
          canvas.height = batchData.imageSize
          const ctx = canvas.getContext("2d", {
            alpha: false,
            willReadFrequently: false,
            desynchronized: true,
          })!

          ctx.fillStyle = "white"
          ctx.fillRect(0, 0, batchData.imageSize, batchData.imageSize)

          const sortedLayers = layers.filter((layer) => combination[layer.id]).sort((a, b) => a.zIndex - b.zIndex)

          for (const layer of sortedLayers) {
            const itemId = combination[layer.id]
            const item = layer.items.find((i) => i.id === itemId)
            if (!item) continue

            await new Promise<void>((resolve, reject) => {
              const img = new Image()
              const timeout = setTimeout(() => reject(new Error(`Timeout loading image for ${item.name}`)), 10000)
              img.onload = () => {
                clearTimeout(timeout)
                try {
                  ctx.drawImage(img, 0, 0, batchData.imageSize, batchData.imageSize)
                  resolve()
                } catch (error) {
                  reject(error)
                }
              }
              img.onerror = () => reject(new Error(`Failed to load image for ${item.name}`))
              img.crossOrigin = "anonymous"
              img.src = item.dataUrl
            })
          }

          const blob = await new Promise<Blob>((resolve) => {
            canvas.toBlob((blob) => resolve(blob!), "image/png", 0.8)
          })

          imagesFolder?.file(`${nftNumber}.png`, blob)

          const metadata = {
            name: `${batchData.collectionName} #${nftNumber}`,
            description: `A unique NFT from the ${batchData.collectionName} collection`,
            created_by: "",
            image: `ipfs://[CID]/images/${nftNumber}.png`,
            attributes: sortedLayers.map((layer) => {
              const itemId = combination[layer.id]
              const item = layer.items.find((i) => i.id === itemId)
              return {
                trait_type: layer.name,
                value: item?.name || "Unknown",
              }
            }),
          }

          metadataFolder?.file(`${nftNumber}.json`, JSON.stringify(metadata, null, 2))

          canvas.width = 1
          canvas.height = 1

          if (i % 5 === 0 && i > 0) {
            await new Promise((resolve) => setTimeout(resolve, 10))
          }
        } catch (error) {
          console.error(`Error generating NFT ${nftNumber}:`, error)
        }
      }

      if (abortController.signal.aborted) throw new Error("Download cancelled")

      setExportProgress(82)
      setProgressDetails("Preparing ZIP file...")

      const endNumber = batchData.startingNumber + batchData.combinations.length - 1

      zip.file(
        "README.txt",
        `NFT Collection: ${batchData.collectionName}
Generated on: ${new Date().toLocaleString()}
Batch: ${batchData.batchNumber}
Total NFTs in batch: ${batchData.combinations.length}
NFT Numbers: ${batchData.startingNumber} to ${endNumber}
Image Size: ${batchData.imageSize}x${batchData.imageSize}px

⚠️ IMPORTANT: This is part of a larger collection split into batches.
All NFTs across all batches are guaranteed to be unique.

IPFS Instructions:
1. Upload the 'images' folder to IPFS
2. Get the CID (hash) from IPFS for the images folder
3. Replace [CID] in ALL metadata JSON files with your actual images CID
4. Upload the 'metadata' folder to IPFS
5. Use the metadata folder CID for your NFT contract`,
      )

      setExportProgress(85)
      setProgressDetails("Creating ZIP file...")

      const zipContent = await zip.generateAsync(
        {
          type: "blob",
          compression: "STORE",
          streamFiles: false,
        },
        (metadata) => {
          const zipProgress = 85 + metadata.percent * 0.13
          setExportProgress(Math.round(zipProgress))
          setProgressDetails(`Creating ZIP file... ${metadata.percent.toFixed(1)}%`)
        },
      )

      setExportProgress(99)
      setProgressDetails("Starting download...")

      const url = URL.createObjectURL(zipContent)
      const a = document.createElement("a")
      a.href = url
      a.download = `${batchData.collectionName.toLowerCase().replace(/\s+/g, "-")}-batch-${batchData.batchNumber}-nfts-${batchData.startingNumber}-${endNumber}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => {
        URL.revokeObjectURL(url)
      }, 5000)

      const updatedCompletedBatches = [...completedBatches, batchData.batchNumber]
      setCompletedBatches(updatedCompletedBatches)
      setBatchStatus("completed")
      setExportProgress(100)
      setProgressDetails("Download completed!")

      // Increment currentBatch after successful download
      setCurrentBatch((prev) => prev + 1)

      if (exportSession) {
        const updatedSession: ExportSession = {
          ...exportSession,
          completedBatches: updatedCompletedBatches,
          status: currentBatch >= totalBatches ? "completed" : "completed",
          generatedCombinations: Array.from(generatedCombinations),
          timestamp: Date.now(),
          quotas: { ...quotasRef.current },
          pairUsage: { ...pairUsageRef.current },
        }
        setExportSession(updatedSession)
      }

      playNotificationSound()

      toast({
        title: "Success",
        description: `Batch ${batchData.batchNumber} downloaded successfully! (NFTs ${batchData.startingNumber}-${endNumber})`,
      })

      if (autoDownload && currentBatchRef.current < totalBatches) {
        setTimeout(() => {
          generateNextBatch()
        }, 2000)
      }
    } catch (error) {
      console.error("Download error:", error)
      setBatchStatus("ready")
      setProgressDetails(error instanceof Error ? error.message : "Download error")
      toast({
        title: "Error",
        description: `Failed to download batch ${batchData.batchNumber}.`,
        variant: "destructive",
      })
    } finally {
      abortControllerRef.current = null
      isDownloadingRef.current = false
    }
  }

  const generateNextBatch = async () => {
    if (!exportConfig) return
    if (isGeneratingRef.current || batchStatus === "generating") return
    if (currentBatch >= totalBatches) {
      setBatchStatus("completed")
      return
    }

    isGeneratingRef.current = true

    // FIXED: Calculate based on currentBatch - 1 (batches that should be completed)
    const completedNFTs = (currentBatch - 1) * exportConfig.batchSize
    const startingNumber = completedNFTs + 1
    const remainingNFTs = exportConfig.totalCount - completedNFTs

    console.log(`DEBUG: Current batch: ${currentBatch}`)
    console.log(`DEBUG: Batches processed: ${currentBatch - 1}`)
    console.log(`DEBUG: Completed NFTs: ${completedNFTs}`)
    console.log(`DEBUG: Starting number: ${startingNumber}`)
    console.log(`DEBUG: Remaining NFTs: ${remainingNFTs}`)

    setBatchStatus("generating")
    setExportProgress(0)
    setProgressDetails(`Starting batch ${currentBatch + 1} generation...`)

    const abortController = new AbortController()
    abortControllerRef.current = abortController

    if (exportSession) {
      setExportSession({
        ...exportSession,
        currentBatch: currentBatch + 1,
        status: "generating",
        timestamp: Date.now(),
        quotas: { ...quotasRef.current },
        pairUsage: { ...pairUsageRef.current },
      })
    }

    try {
      const combinations = await generateBatchCombinations(
        Math.min(exportConfig.batchSize, remainingNFTs),
        exportConfig.useRules,
        abortController.signal,
      )

      if (combinations.length !== Math.min(exportConfig.batchSize, remainingNFTs)) {
        toast({
          title: "Warning",
          description:
            "Could not generate the full batch with current rules/quotas. Consider adjusting counts or rules.",
        })
      }

      if (combinations.length === 0) {
        setBatchExportMode(false)
        clearExportSession()
        return
      }

      const batchData: BatchData = {
        combinations,
        batchNumber: currentBatch + 1,
        collectionName: exportConfig.collectionName,
        imageSize: exportConfig.imageSize,
        startingNumber,
      }

      console.log(`DEBUG: Created batch data for batch ${currentBatch + 1} with starting number ${startingNumber}`)
      console.log(
        `DEBUG: This batch will generate NFTs ${startingNumber} to ${startingNumber + combinations.length - 1}`,
      )

      setCurrentBatchData(batchData)
      setBatchStatus("ready")
      setExportProgress(100)
      setProgressDetails(`Batch ${currentBatch + 1} ready for download`)

      setExportSession((prev) =>
        prev
          ? {
              ...prev,
              status: "ready",
              currentBatchData: batchData,
              generatedCombinations: Array.from(generatedCombinations),
              quotas: { ...quotasRef.current },
              pairUsage: { ...pairUsageRef.current },
              timestamp: Date.now(),
            }
          : prev,
      )

      toast({
        title: "Batch Ready",
        description: `Batch ${currentBatch + 1} generated successfully with ${combinations.length} unique NFTs! (NFTs ${startingNumber}-${startingNumber + combinations.length - 1})`,
      })

      if (autoDownload) {
        setTimeout(() => {
          downloadBatch(batchData)
        }, 1000)
      }
    } catch (error) {
      if (error instanceof Error && error.message === "Generation cancelled") return
      console.error("Batch generation error:", error)
      toast({
        title: "Error",
        description: `Failed to generate batch ${currentBatch + 1}.`,
        variant: "destructive",
      })
      setBatchExportMode(false)
      clearExportSession()
    } finally {
      abortControllerRef.current = null
      isGeneratingRef.current = false
    }
  }

  const startBatchExport = async (
    exportCount: number,
    collectionName: string,
    imageSize: number,
    useRules: boolean,
    batchSize: number,
    splitIntoMultiple = false,
  ) => {
    if (layers.length === 0) {
      toast({
        title: "Error",
        description: "No layers added yet",
        variant: "destructive",
      })
      return
    }

    const totalPossibleCombinations = layers.reduce((total, layer) => total * Math.max(1, layer.items.length), 1)
    if (exportCount > totalPossibleCombinations) {
      toast({
        title: "Warning",
        description: `Requested ${exportCount} NFTs but only ${totalPossibleCombinations} unique combinations possible. Reducing to maximum possible.`,
      })
      exportCount = totalPossibleCombinations
    }

    const anyExact = layers.some((l) => l.exactCountMode)
    quotasRef.current = anyExact ? computeInitialQuotas(exportCount) : {}
    pairUsageRef.current = {}
    isGeneratingRef.current = false
    isDownloadingRef.current = false

    if (splitIntoMultiple) {
      const numBatches = Math.ceil(exportCount / batchSize)
      const sessionId = `export-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
      const newExportConfig = {
        totalCount: exportCount,
        batchSize,
        collectionName,
        imageSize,
        useRules,
      }

      const newExportSession: ExportSession = {
        id: sessionId,
        totalCount: exportCount,
        batchSize,
        collectionName,
        imageSize,
        useRules,
        currentBatch: 1,
        totalBatches: numBatches,
        completedBatches: [],
        generatedCombinations: Array.from(generatedCombinations),
        timestamp: Date.now(),
        status: "generating",
        autoDownload: false,
        quotas: { ...quotasRef.current },
        pairUsage: { ...pairUsageRef.current },
      }

      setExportConfig(newExportConfig)
      setExportSession(newExportSession)
      setBatchExportMode(true)
      setTotalBatches(numBatches)
      setCurrentBatch(1)
      setCompletedBatches([])
      setBatchStatus("generating")
      setExportProgress(0)
      setExportCancelled(false)
      setProgressDetails("Starting first batch generation...")

      const abortController = new AbortController()
      abortControllerRef.current = abortController

      try {
        const firstBatchSize = Math.min(batchSize, exportCount)
        const combinations = await generateBatchCombinations(firstBatchSize, useRules, abortController.signal)

        if (combinations.length === 0) {
          toast({
            title: "Error",
            description:
              "Could not generate enough unique combinations for first batch with current rules/quotas. Adjust and try again.",
            variant: "destructive",
          })
          setBatchExportMode(false)
          clearExportSession()
          return
        }

        const batchData: BatchData = {
          combinations,
          batchNumber: 1,
          collectionName,
          imageSize: imageSize,
          startingNumber: 1,
        }

        setCurrentBatchData(batchData)
        setBatchStatus("ready")
        setExportProgress(100)
        setProgressDetails("First batch ready for download")

        setExportSession((prev) =>
          prev
            ? {
                ...prev,
                status: "ready",
                currentBatchData: batchData,
                generatedCombinations: Array.from(generatedCombinations),
                quotas: { ...quotasRef.current },
                pairUsage: { ...pairUsageRef.current },
                timestamp: Date.now(),
              }
            : prev,
        )

        toast({
          title: "First Batch Ready",
          description: `Batch 1 generated successfully with ${combinations.length} unique NFTs!`,
        })
      } catch (error) {
        if (error instanceof Error && error.message === "Generation cancelled") return
        console.error("First batch generation error:", error)
        toast({
          title: "Error",
          description: `Failed to generate first batch.`,
          variant: "destructive",
        })
        setBatchExportMode(false)
        clearExportSession()
      } finally {
        abortControllerRef.current = null
      }
    } else {
      // Single export mode
      setIsExporting(true)
      setExportCancelled(false)
      setExportProgress(0)
      setProgressDetails("Starting collection generation...")

      try {
        await exportSingleCollection(exportCount, collectionName, imageSize, useRules, batchSize)
      } catch (error) {
        console.error("Export error:", error)
        toast({
          title: "Error",
          description: "Error generating collection.",
          variant: "destructive",
        })
      } finally {
        setIsExporting(false)
        setExportProgress(0)
        setProgressDetails("")
      }
    }
  }

  const exportSingleCollection = async (
    exportCount: number,
    collectionName: string,
    imageSize: number,
    useRules: boolean,
    batchSize: number,
  ) => {
    const anyExact = layers.some((l) => l.exactCountMode)
    quotasRef.current = anyExact ? computeInitialQuotas(exportCount) : {}
    pairUsageRef.current = {}

    const { default: JSZip } = await import("jszip")
    const zip = new JSZip()
    const imagesFolder = zip.folder("images")
    const metadataFolder = zip.folder("metadata")

    const abortController = new AbortController()
    abortControllerRef.current = abortController

    try {
      const allCombinations = await generateBatchCombinations(exportCount, useRules, abortController.signal)

      for (let i = 0; i < allCombinations.length; i++) {
        if (abortController.signal.aborted) {
          throw new Error("Export cancelled")
        }

        const progress = Math.round((i / allCombinations.length) * 95)
        setExportProgress(progress)
        setProgressDetails(`Generating NFT ${i + 1} of ${allCombinations.length}...`)

        const combination = allCombinations[i]

        try {
          const canvas = document.createElement("canvas")
          canvas.width = imageSize
          canvas.height = imageSize
          const ctx = canvas.getContext("2d", {
            alpha: false,
            willReadFrequently: false,
          })!

          ctx.fillStyle = "white"
          ctx.fillRect(0, 0, imageSize, imageSize)

          const sortedLayers = layers.filter((layer) => combination[layer.id]).sort((a, b) => a.zIndex - b.zIndex)

          for (const layer of sortedLayers) {
            const itemId = combination[layer.id]
            const item = layer.items.find((i) => i.id === itemId)
            if (!item) continue

            await new Promise<void>((resolve, reject) => {
              const img = new Image()
              img.onload = () => {
                try {
                  ctx.drawImage(img, 0, 0, imageSize, imageSize)
                  resolve()
                } catch (error) {
                  reject(error)
                }
              }
              img.onerror = () => reject(new Error(`Failed to load image for ${item.name}`))
              img.crossOrigin = "anonymous"
              img.src = item.dataUrl
            })
          }

          const blob = await new Promise<Blob>((resolve) => {
            canvas.toBlob((blob) => resolve(blob!), "image/png", 0.8)
          })

          imagesFolder?.file(`${i + 1}.png`, blob)

          const metadata = {
            name: `${collectionName} #${i + 1}`,
            description: `A unique NFT from the ${collectionName} collection`,
            created_by: "",
            image: `ipfs://[CID]/images/${i + 1}.png`,
            attributes: sortedLayers.map((layer) => {
              const itemId = combination[layer.id]
              const item = layer.items.find((i) => i.id === itemId)
              return {
                trait_type: layer.name,
                value: item?.name || "Unknown",
              }
            }),
          }

          metadataFolder?.file(`${i + 1}.json`, JSON.stringify(metadata, null, 2))

          canvas.width = 1
          canvas.height = 1

          if (i % 10 === 0) {
            await new Promise((resolve) => setTimeout(resolve, 10))
          }
        } catch (error) {
          console.error(`Error generating NFT ${i + 1}:`, error)
        }
      }

      setExportProgress(98)
      setProgressDetails("Creating ZIP file...")

      const zipContent = await zip.generateAsync({
        type: "blob",
        compression: "STORE",
        streamFiles: false,
      })

      setExportProgress(100)
      setProgressDetails("Starting download...")

      const url = URL.createObjectURL(zipContent)
      const a = document.createElement("a")
      a.href = url
      a.download = `${collectionName.toLowerCase().replace(/\s+/g, "-")}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 1000)

      toast({
        title: "Success",
        description: `Collection with ${allCombinations.length} unique NFTs exported successfully!`,
      })
    } finally {
      abortControllerRef.current = null
    }
  }

  const cancelExport = () => {
    setExportCancelled(true)
    if (abortControllerRef.current) abortControllerRef.current.abort()
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current)

    // Reset flags
    isGeneratingRef.current = false
    isDownloadingRef.current = false

    setIsExporting(false)
    setBatchExportMode(false)
    setCurrentBatchData(null)
    setExportConfig(null)
    setCompletedBatches([])
    setBatchStatus("generating")
    setCurrentBatch(1)
    setTotalBatches(1)
    setExportProgress(0)
    setProgressDetails("")
    setAutoDownload(false)

    clearExportSession()
    setExportSession(null)

    toast({
      title: "Cancelled",
      description: "Export cancelled",
      variant: "destructive",
    })
  }

  const handleDownloadBatch = () => {
    if (currentBatchData) {
      downloadBatch(currentBatchData)
    }
  }

  const handleContinueToNext = () => {
    if (currentBatch < totalBatches) {
      generateNextBatch()
    }
  }

  const resumeSession = () => {
    if (exportSession && batchStatus === "paused") {
      if (exportSession.currentBatchData) {
        setBatchStatus("ready")
        setProgressDetails("Session resumed - batch ready for download")
        toast({
          title: "Session Resumed",
          description: `Batch ${currentBatch} is ready for download`,
        })
      } else {
        generateNextBatch()
      }
    }
  }

  const clearGeneratedHistory = useCallback(() => {
    setGeneratedCombinations(new Set())
    toast({
      title: "Success",
      description: "Generated combinations history cleared. You can now regenerate previous NFTs.",
    })
  }, [toast])

  const clearTraitUsageStats = useCallback(() => {
    setTraitUsageStats({})
    toast({
      title: "Success",
      description: "Trait usage statistics cleared. All traits will have equal priority again.",
    })
  }, [toast])

  // Project management
  const exportProject = useCallback(() => {
    if (layers.length === 0) {
      toast({
        title: "Cannot Export",
        description: "Your project is empty. Add some layers first.",
        variant: "destructive",
      })
      return
    }

    const projectState: ProjectState = {
      layers,
      traitMatchingRules,
      traitExclusionRules,
      manualMappings,
      rarityMode,
      traitUsageStats,
      generatedCombinations: Array.from(generatedCombinations),
      nextId,
      nextRuleId,
      nextExclusionId,
      nextMappingId,
    }

    const jsonString = JSON.stringify(projectState, null, 2)
    const blob = new Blob([jsonString], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "nft-art-engine-project.json"
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    toast({
      title: "Project Exported",
      description: "Your project has been saved successfully.",
    })
  }, [
    layers,
    traitMatchingRules,
    traitExclusionRules,
    manualMappings,
    rarityMode,
    traitUsageStats,
    generatedCombinations,
    nextId,
    nextRuleId,
    nextExclusionId,
    nextMappingId,
    toast,
  ])

  const importProject = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (!file) return

      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const text = e.target?.result
          if (typeof text !== "string") {
            throw new Error("Failed to read file.")
          }
          const projectState: ProjectState = JSON.parse(text)

          if (
            !projectState.layers ||
            !projectState.traitMatchingRules ||
            !projectState.traitExclusionRules ||
            !projectState.manualMappings
          ) {
            throw new Error("Invalid project file format.")
          }

          setLayers(projectState.layers)
          setTraitMatchingRules(projectState.traitMatchingRules)
          setTraitExclusionRules(projectState.traitExclusionRules)
          setManualMappings(projectState.manualMappings)
          setRarityMode(projectState.rarityMode || "equal")
          setTraitUsageStats(projectState.traitUsageStats || {})
          setGeneratedCombinations(new Set(projectState.generatedCombinations || []))
          setNextId(projectState.nextId || Date.now())
          setNextRuleId(projectState.nextRuleId || Date.now())
          setNextExclusionId(projectState.nextExclusionId || Date.now())
          setNextMappingId(projectState.nextMappingId || Date.now())

          setSelectedItems({})

          toast({
            title: "Project Imported",
            description: "Your project has been loaded successfully.",
          })
        } catch (error) {
          console.error("Failed to import project:", error)
          toast({
            title: "Import Failed",
            description: "The selected file is not a valid project file.",
            variant: "destructive",
          })
        } finally {
          if (event.target) {
            event.target.value = ""
          }
        }
      }
      reader.readAsText(file)
    },
    [toast],
  )

  const getLayerCountsSum = (layer: Layer) =>
    layer.items.reduce((s, it) => s + Math.max(0, Math.floor(it.count || 0)), 0)

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-purple-400 mb-2">NFT Layer Viewer</h1>
          <p className="text-gray-400">Enhanced matching with consistent rule application and balanced coverage</p>
        </div>

        {/* Session Recovery */}
        {exportSession && batchStatus === "paused" && (
          <Card className="bg-yellow-900/20 border-yellow-500/30">
            <CardHeader>
              <CardTitle className="text-yellow-400">Session Recovery</CardTitle>
              <CardDescription>
                Found a previous export session that was interrupted. You can resume where you left off.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <strong>Collection:</strong> {exportSession.collectionName}
                </div>
                <div>
                  <strong>Progress:</strong> {completedBatches.length} of {totalBatches} batches completed
                </div>
                <div>
                  <strong>Current Batch:</strong> {currentBatch}
                </div>
                <div>
                  <strong>Total NFTs:</strong> {exportSession.totalCount}
                </div>
              </div>
              <div className="flex space-x-4">
                <Button onClick={resumeSession} className="bg-yellow-600 hover:bg-yellow-700">
                  Resume Session
                </Button>
                <Button onClick={clearExportSession} variant="outline">
                  Start Fresh
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Project Management */}
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader>
            <CardTitle className="text-yellow-400">Project Management</CardTitle>
            <CardDescription>Save your entire project configuration to a file, or load a previous one.</CardDescription>
          </CardHeader>
          <CardContent className="flex space-x-4">
            <Button onClick={exportProject} className="bg-green-600 hover:bg-green-700">
              Export Project
            </Button>
            <Button asChild variant="outline">
              <Label>
                Import Project
                <input type="file" accept=".json" className="hidden" onChange={importProject} />
              </Label>
            </Button>
          </CardContent>
        </Card>

        {/* Upload */}
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader>
            <CardTitle className="text-purple-400">Step 1: Upload Layer Images</CardTitle>
            <CardDescription>Add images to create layers for your NFT collection</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <input
                type="file"
                multiple
                accept="image/*"
                ref={fileInputRef}
                style={{ display: "none" }}
                onChange={async (e) => {
                  if (e.target.files) {
                    const layerName = prompt("Enter layer name:")
                    if (layerName) {
                      await addLayer(layerName, e.target.files)
                      if (fileInputRef.current) {
                        fileInputRef.current.value = ""
                      }
                    }
                  }
                }}
              />
              <div className="flex space-x-4">
                <Button className="bg-purple-500 hover:bg-purple-700" onClick={() => fileInputRef.current?.click()}>
                  Upload Layer
                </Button>
                <Button className="bg-blue-500 hover:bg-blue-700" onClick={addTestLayer}>
                  Add Test Layer
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Manage Layers */}
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader>
            <CardTitle className="text-purple-400">Step 2: Manage Layers & Layer Order</CardTitle>
            <CardDescription>
              Organize layers, set stacking order, and configure rarity vs exact numbers
            </CardDescription>
          </CardHeader>
          <CardContent>
            {layers.length === 0 ? (
              <p className="text-gray-400">No layers added yet. Please upload layer images.</p>
            ) : (
              <div className="space-y-4">
                <div className="mb-4 p-3 bg-blue-900/20 border border-blue-500/30 rounded-lg">
                  <h4 className="font-semibold text-blue-400 mb-2">Layer Stacking Order (Top to Bottom)</h4>
                  <p className="text-sm text-gray-400">
                    Higher z-index = On top • Lower z-index = Behind • Use Up/Down buttons to reorder
                  </p>
                </div>

                {layers
                  .sort((a, b) => b.zIndex - a.zIndex)
                  .map((layer) => {
                    const isTopLayer = layer.zIndex === Math.max(...layers.map((l) => l.zIndex))
                    const isBottomLayer = layer.zIndex === Math.min(...layers.map((l) => l.zIndex))
                    const countsSum = getLayerCountsSum(layer)
                    const exportTotal = exportConfig?.totalCount

                    const countsStatus =
                      exportTotal !== undefined
                        ? countsSum === exportTotal
                          ? { text: "Counts match export size", cls: "text-green-400" }
                          : { text: `Counts: ${countsSum} / Export: ${exportTotal}`, cls: "text-yellow-400" }
                        : { text: `Counts total: ${countsSum}`, cls: "text-gray-300" }

                    return (
                      <Card
                        key={layer.id}
                        className={`bg-gray-700 border-gray-600 transition-all duration-200 ${
                          isTopLayer ? "ring-2 ring-green-500 bg-green-900/20" : ""
                        } ${isBottomLayer ? "ring-2 ring-orange-500 bg-orange-900/20" : ""} ${
                          !isTopLayer && !isBottomLayer ? "hover:bg-gray-600" : ""
                        }`}
                      >
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                          <div className="flex items-center space-x-3">
                            <div className="flex flex-col items-center">
                              <div
                                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                                  isTopLayer
                                    ? "bg-green-500 text-white"
                                    : isBottomLayer
                                      ? "bg-orange-500 text-white"
                                      : "bg-blue-500 text-white"
                                }`}
                              >
                                {layer.zIndex}
                              </div>
                              <div className="text-xs text-gray-400 mt-1">
                                {isTopLayer ? "TOP" : isBottomLayer ? "BOTTOM" : "MID"}
                              </div>
                            </div>

                            <div>
                              <CardTitle
                                className={`text-sm font-medium ${
                                  isTopLayer ? "text-green-400" : isBottomLayer ? "text-orange-400" : "text-white"
                                }`}
                              >
                                {layer.name}
                              </CardTitle>
                              <div className="text-xs text-gray-400">
                                {layer.items.length} items • Z-Index: {layer.zIndex}{" "}
                                {layer.exactCountMode ? "• Exact Numbers ON" : "• Weighted %"}
                              </div>
                              <div className={`text-xs ${countsStatus.cls}`}>{countsStatus.text}</div>
                            </div>
                          </div>

                          <div className="flex items-center space-x-2">
                            <div className="flex flex-col space-y-1">
                              <Button
                                size="sm"
                                onClick={() => moveLayer(layer.id, "up")}
                                disabled={isTopLayer}
                                className={`h-6 px-2 text-xs ${
                                  isTopLayer ? "opacity-50 cursor-not-allowed" : "hover:bg-green-600"
                                }`}
                              >
                                {"↑ Up"}
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => moveLayer(layer.id, "down")}
                                disabled={isBottomLayer}
                                className={`h-6 px-2 text-xs ${
                                  isBottomLayer ? "opacity-50 cursor-not-allowed" : "hover:bg-orange-600"
                                }`}
                              >
                                {"↓ Down"}
                              </Button>
                            </div>
                            <Button size="sm" variant="destructive" onClick={() => removeLayer(layer.id)}>
                              Remove
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <Tabs
                            value={layer.exactCountMode ? "counts" : "weighted"}
                            onValueChange={(val) => setLayerExactMode(layer.id, val === "counts")}
                            className="mt-2"
                          >
                            <TabsList className="mb-3">
                              <TabsTrigger value="weighted">Weighted %</TabsTrigger>
                              <TabsTrigger value="counts">Exact Numbers</TabsTrigger>
                            </TabsList>

                            <TabsContent value="weighted">
                              <div className="flex items-center space-x-4 mb-4">
                                <Label htmlFor={`rarityMode-${layer.id}`}>Rarity Mode:</Label>
                                <Select
                                  value={rarityMode}
                                  onValueChange={(value: "equal" | "weighted") => setRarityMode(value)}
                                >
                                  <SelectTrigger className="w-32">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="equal">Equal</SelectItem>
                                    <SelectItem value="weighted">Weighted</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>

                              {rarityMode === "weighted" && (
                                <div className="space-y-4">
                                  <div className="flex items-center justify-between">
                                    <Label className="text-lg font-semibold">Individual Trait Rarities</Label>
                                    <div className="flex space-x-2">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => applyRarityPreset(layer.id, "Equal Distribution")}
                                      >
                                        Equal
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => applyRarityPreset(layer.id, "Common/Rare (80/20)")}
                                      >
                                        80/20
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => applyRarityPreset(layer.id, "Pyramid (50/30/15/5)")}
                                      >
                                        Pyramid
                                      </Button>
                                      <Button size="sm" onClick={() => normalizeRarities(layer.id)}>
                                        Normalize to 100%
                                      </Button>
                                    </div>
                                  </div>

                                  <div className="bg-gray-600 rounded-lg p-4">
                                    <div className="grid grid-cols-1 gap-3">
                                      {layer.items.map((item) => {
                                        const rarity = item.rarity || 0
                                        const rarityCategory =
                                          rarity < 5
                                            ? { name: "Ultra Rare", color: "bg-red-500" }
                                            : rarity < 15
                                              ? { name: "Rare", color: "bg-purple-500" }
                                              : rarity < 30
                                                ? { name: "Uncommon", color: "bg-blue-500" }
                                                : { name: "Common", color: "bg-gray-500" }

                                        return (
                                          <div
                                            key={item.id}
                                            className="flex items-center justify-between p-3 bg-gray-700 rounded"
                                          >
                                            <div className="flex items-center space-x-3">
                                              <div className="font-medium text-white">{item.name}</div>
                                              <div
                                                className={`px-2 py-1 rounded text-xs font-semibold ${rarityCategory.color} text-white`}
                                              >
                                                {rarityCategory.name}
                                              </div>
                                            </div>
                                            <div className="flex items-center space-x-2">
                                              <Input
                                                type="number"
                                                className="w-20 text-center"
                                                value={(rarity || 0).toFixed(1)}
                                                min={0}
                                                max={100}
                                                step={0.1}
                                                onChange={(e) => {
                                                  const newRarity = Number.parseFloat(e.target.value) || 0
                                                  if (newRarity >= 0 && newRarity <= 100) {
                                                    updateItemRarity(layer.id, item.id, newRarity)
                                                  }
                                                }}
                                              />
                                              <span className="text-sm text-gray-300">%</span>
                                            </div>
                                          </div>
                                        )
                                      })}
                                    </div>

                                    <div className="mt-4 p-3 bg-gray-800 rounded">
                                      <div className="flex justify-between items-center">
                                        <span className="text-sm font-medium">Total Percentage:</span>
                                        <span
                                          className={`font-bold ${
                                            Math.abs(
                                              layer.items.reduce((sum, item) => sum + (item.rarity || 0), 0) - 100,
                                            ) < 0.1
                                              ? "text-green-400"
                                              : "text-red-400"
                                          }`}
                                        >
                                          {layer.items.reduce((sum, item) => sum + (item.rarity || 0), 0).toFixed(1)}%
                                        </span>
                                      </div>
                                      {Math.abs(layer.items.reduce((sum, item) => sum + (item.rarity || 0), 0) - 100) >=
                                        0.1 && (
                                        <p className="text-xs text-red-400 mt-1">
                                          {"⚠️ Total should equal 100% for accurate rarity distribution"}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </TabsContent>

                            <TabsContent value="counts">
                              <div className="space-y-4">
                                <div className="p-3 bg-gray-800 rounded">
                                  <div className="text-sm">
                                    Enter exact numbers per trait for the entire collection. For example, for a HEAD
                                    layer with 3 races, you can set Race A = 500, Race B = 300, Race C = 200 for a 1000
                                    NFT collection.
                                  </div>
                                  <div className="mt-2 text-sm">
                                    Total for this layer: <span className="font-semibold">{countsSum}</span>
                                    {exportConfig?.totalCount !== undefined && (
                                      <>
                                        {" "}
                                        • Planned Export:{" "}
                                        <span className="font-semibold">{exportConfig.totalCount}</span>
                                      </>
                                    )}
                                  </div>
                                </div>
                                <div className="bg-gray-600 rounded-lg p-4">
                                  <div className="grid grid-cols-1 gap-3">
                                    {layer.items.map((item) => {
                                      const count = Math.max(0, Math.floor(item.count || 0))
                                      return (
                                        <div
                                          key={item.id}
                                          className="flex items-center justify-between p-3 bg-gray-700 rounded"
                                        >
                                          <div className="flex items-center space-x-3">
                                            <div className="font-medium text-white">{item.name}</div>
                                          </div>
                                          <div className="flex items-center space-x-2">
                                            <Input
                                              type="number"
                                              className="w-24 text-center"
                                              value={count}
                                              min={0}
                                              step={1}
                                              onChange={(e) =>
                                                updateItemCount(layer.id, item.id, Number.parseInt(e.target.value) || 0)
                                              }
                                            />
                                            <span className="text-sm text-gray-300">count</span>
                                          </div>
                                        </div>
                                      )
                                    })}
                                  </div>

                                  {exportConfig?.totalCount !== undefined && (
                                    <div className="mt-4 p-3 bg-gray-800 rounded">
                                      <div className="text-sm">
                                        {countsSum === exportConfig.totalCount ? (
                                          <span className="text-green-400">Counts match the export size.</span>
                                        ) : (
                                          <span className="text-yellow-300">
                                            {
                                              "Counts do not match export size. They will be proportionally scaled when you start export."
                                            }
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </TabsContent>
                          </Tabs>
                        </CardContent>
                      </Card>
                    )
                  })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Rules Manager */}
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader>
            <CardTitle className="text-purple-400">Step 3: Trait Matching & Exclusion</CardTitle>
            <CardDescription>Define rules for how traits should match or be excluded</CardDescription>
          </CardHeader>
          <CardContent>
            <TraitRulesManager
              layers={layers}
              traitMatchingRules={traitMatchingRules}
              traitExclusionRules={traitExclusionRules}
              manualMappings={manualMappings}
              onAddMatchingRule={addTraitMatchingRule}
              onAddExclusionRule={addTraitExclusionRule}
              onRemoveExclusionRule={(ruleId) => {
                setTraitExclusionRules((prev) => prev.filter((rule) => rule.id !== ruleId))
                toast({ title: "Success", description: "Exclusion rule removed" })
              }}
              onRemoveMatchingRule={(ruleId) => {
                setTraitMatchingRules((prev) => prev.filter((rule) => rule.id !== ruleId))
                toast({ title: "Success", description: "Matching rule removed" })
              }}
              onAddManualMapping={addManualMapping}
              onRemoveManualMapping={removeManualMapping}
            />
          </CardContent>
        </Card>

        {/* Preview */}
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader>
            <CardTitle className="text-purple-400">Step 4: Preview</CardTitle>
            <CardDescription>Preview your NFT combinations</CardDescription>
          </CardHeader>
          <CardContent>
            <NFTPreview
              layers={layers}
              selectedItems={selectedItems}
              onSelectionChange={handleSelectionChange}
              onGenerateRandom={generateRandom}
              onGenerateWithRules={generateWithRules}
              onCalculateUniqueness={calculateUniqueness}
              uniquenessData={uniquenessData}
              rarityMode={rarityMode}
            />
          </CardContent>
        </Card>

        {/* Trait Usage */}
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader>
            <CardTitle className="text-purple-400">Step 4.5: Trait Usage Balance</CardTitle>
            <CardDescription>Monitor trait usage to ensure all uploaded traits are being used</CardDescription>
          </CardHeader>
          <CardContent>
            <TraitUsageStats layers={layers} traitUsageStats={traitUsageStats} onClearStats={clearTraitUsageStats} />
          </CardContent>
        </Card>

        {rarityMode === "weighted" && <RarityAnalysis layers={layers} rarityMode={rarityMode} />}

        {/* Export */}
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader>
            <CardTitle className="text-purple-400">Step 5: Export Collection</CardTitle>
            <CardDescription>Generate and download your NFT collection</CardDescription>
          </CardHeader>
          <CardContent>
            <ExportManager
              isExporting={isExporting}
              exportProgress={exportProgress}
              onExport={startBatchExport}
              onCancel={cancelExport}
              generatedCount={generatedCombinations.size}
              onClearHistory={clearGeneratedHistory}
              batchExportMode={batchExportMode}
              currentBatch={currentBatch}
              totalBatches={totalBatches}
              batchStatus={batchStatus}
              onDownloadBatch={handleDownloadBatch}
              onContinueToNext={handleContinueToNext}
              completedBatches={completedBatches}
              currentBatchNFTs={currentBatchData?.combinations.length || 0}
              progressDetails={progressDetails}
              autoDownload={autoDownload}
              onToggleAutoDownload={setAutoDownload}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

"use client"

import type React from "react"

import { useState, useRef, useCallback, useEffect } from "react"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TraitRulesManager } from "@/components/trait-rules-manager"
import { NFTPreview } from "@/components/nft-preview"
import { TraitUsageStats } from "@/components/trait-usage-stats"
import { RarityAnalysis } from "@/components/rarity-analysis"
import { ExportManager } from "@/components/export-manager"

interface LayerItem {
  id: number
  name: string
  dataUrl: string
  rarity?: number
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
  status: "generating" | "ready" | "downloading" | "completed" | "paused"
  currentBatchData?: BatchData
  autoDownload: boolean
}

export default function NFTLayerViewer() {
  const { toast } = useToast()
  const [layers, setLayers] = useState<Layer[]>([])
  const [traitMatchingRules, setTraitMatchingRules] = useState<TraitMatchingRule[]>([])
  const [traitExclusionRules, setTraitExclusionRules] = useState<TraitExclusionRule[]>([])
  const [manualMappings, setManualMappings] = useState<ManualMapping[]>([])
  const [selectedItems, setSelectedItems] = useState<Record<number, number>>({})
  const [exportProgress, setExportProgress] = useState(0)
  const [isExporting, setIsExporting] = useState(false)
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
  const workerRef = useRef<Worker | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null)

  const [generatedCombinations, setGeneratedCombinations] = useState<Set<string>>(new Set())

  // Enhanced batch export state with persistence
  const [batchExportMode, setBatchExportMode] = useState(false)
  const [currentBatch, setCurrentBatch] = useState(1)
  const [totalBatches, setTotalBatches] = useState(1)
  const [batchStatus, setBatchStatus] = useState<"generating" | "ready" | "downloading" | "completed" | "paused">(
    "generating",
  )
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

  // Session persistence functions
  const saveExportSession = useCallback((session: ExportSession) => {
    try {
      localStorage.setItem("nft-export-session", JSON.stringify(session))
      console.log("Export session saved:", session.id)
    } catch (error) {
      console.error("Failed to save export session:", error)
    }
  }, [])

  const loadExportSession = useCallback((): ExportSession | null => {
    try {
      const saved = localStorage.getItem("nft-export-session")
      if (saved) {
        const session = JSON.parse(saved) as ExportSession
        // Check if session is less than 24 hours old
        if (Date.now() - session.timestamp < 24 * 60 * 60 * 1000) {
          console.log("Export session loaded:", session.id)
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
    console.log("Export session cleared")
  }, [])

  // Load session on component mount
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

      // Restore generated combinations
      setGeneratedCombinations(new Set(savedSession.generatedCombinations))

      toast({
        title: "Session Restored",
        description: `Resumed export session: ${savedSession.collectionName} (Batch ${savedSession.currentBatch}/${savedSession.totalBatches})`,
      })
    }
  }, [layers.length, loadExportSession, toast])

  // Save session whenever it changes
  useEffect(() => {
    if (exportSession) {
      saveExportSession(exportSession)
    }
  }, [exportSession, saveExportSession])

  // Prevent page unload during export
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
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current)
      }
      if (workerRef.current) {
        workerRef.current.terminate()
      }
    }
  }, [])

  // Audio notification function
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

      // Play notification sequence
      playBeep(800, 0.15, 0)
      playBeep(1000, 0.15, 200)
      playBeep(1200, 0.3, 400)
    } catch (error) {
      console.log("Audio notification not available:", error)
    }
  }, [])

  // Layer management functions
  const addLayer = useCallback(
    async (layerName: string, files: FileList) => {
      if (!layerName.trim()) {
        toast({
          title: "Error",
          description: "Please enter a layer name",
          variant: "destructive",
        })
        return
      }

      if (files.length === 0) {
        toast({
          title: "Error",
          description: "Please select at least one image file",
          variant: "destructive",
        })
        return
      }

      const layerId = nextId
      setNextId((prev) => prev + 1)
      const zIndex = layers.length

      const layer: Layer = {
        id: layerId,
        name: layerName,
        items: [],
        zIndex: zIndex,
      }

      const items: LayerItem[] = []
      const fileArray = Array.from(files)
      let processedCount = 0

      for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i]

        if (!file.type.startsWith("image/")) {
          console.log(`Skipping non-image file: ${file.name}`)
          processedCount++
          continue
        }

        const itemName = file.name.replace(/\.[^/.]+$/, "")
        const itemId = Date.now() * 1000 + i + Math.random() * 1000

        try {
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = (e) => {
              const result = e.target?.result
              if (typeof result === "string") {
                resolve(result)
              } else {
                reject(new Error("Failed to read file as data URL"))
              }
            }
            reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`))
            reader.readAsDataURL(file)
          })

          items.push({
            id: Math.floor(itemId),
            name: itemName,
            dataUrl: dataUrl,
            rarity: 100 / fileArray.length,
          })

          console.log(`Successfully processed: ${itemName}`)
        } catch (error) {
          console.error(`Error processing file ${file.name}:`, error)
        }

        processedCount++
      }

      console.log(`Processed ${processedCount} files, successfully added ${items.length} items`)

      if (items.length > 0) {
        layer.items = items
        setLayers((prev) => [...prev, layer])

        toast({
          title: "Success",
          description: `Added ${items.length} of ${files.length} images to layer "${layerName}"`,
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
          name: "Red Square",
          dataUrl:
            "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iI2ZmMDAwMCIvPjwvc3ZnPg==",
          rarity: 33.33,
        },
        {
          id: Date.now() + 2,
          name: "Blue Circle",
          dataUrl:
            "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI0MCIgZmlsbD0iIzAwMDBmZiIvPjwvc3ZnPg==",
          rarity: 33.33,
        },
        {
          id: Date.now() + 3,
          name: "Green Triangle",
          dataUrl:
            "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIj48cG9seWdvbiBwb2ludHM9IjUwLDEwIDkwLDkwIDEwLDkwIiBmaWxsPSIjMDBmZjAwIi8+PC9zdmc+",
          rarity: 33.33,
        },
      ],
      zIndex: zIndex,
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
      setManualMappings((prev) =>
        prev.filter((mapping) => mapping.sourceLayerId !== layerId && mapping.targetLayerId !== layerId),
      )

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

  const applyMatchingRules = (sourceLayerId: number, sourceItemId: number, selected: Record<number, number>) => {
    console.log(`🔧 Applying matching rules for source layer ${sourceLayerId}, item ${sourceItemId}`)

    const sourceLayer = layers.find((l) => l.id === sourceLayerId)
    const sourceItem = sourceLayer?.items.find((i) => i.id === sourceItemId)

    if (!sourceItem) {
      console.log(`❌ Source item not found`)
      return
    }

    console.log(`🎯 Processing source item: "${sourceItem.name}"`)

    // Apply automatic matching rules
    const relevantRules = traitMatchingRules.filter((rule) => rule.sourceLayerId === sourceLayerId)
    console.log(`Found ${relevantRules.length} relevant matching rules`)

    relevantRules.forEach((rule) => {
      console.log(`🔍 Applying rule: ${rule.sourceLayerName} → ${rule.targetLayerName} (${rule.property})`)

      const targetLayer = layers.find((l) => l.id === rule.targetLayerId)
      if (!targetLayer) {
        console.log(`❌ Target layer not found for rule ${rule.id}`)
        return
      }

      // Use the improved findMatchingItem function
      const matchingItem = findMatchingItem(sourceItem, targetLayer.items, rule.property)

      if (matchingItem) {
        console.log(`✅ MATCH FOUND: "${sourceItem.name}" → "${matchingItem.name}"`)
        selected[rule.targetLayerId] = matchingItem.id
      } else {
        console.log(`❌ NO MATCH FOUND for "${sourceItem.name}" in ${rule.targetLayerName}`)
        console.log(
          `Available items in ${rule.targetLayerName}:`,
          targetLayer.items.map((item) => item.name),
        )

        // For color matching, try a more lenient approach before falling back
        if (rule.property.toLowerCase() === "color") {
          console.log(`🔍 Trying lenient color matching as fallback...`)

          // Extract source color more aggressively
          const sourceWords = sourceItem.name
            .toLowerCase()
            .split(/[\s\-_]+/)
            .filter((word) => word.length > 0)
          let fallbackColorMatch = null

          // Try each word from source as potential color
          for (const sourceWord of sourceWords) {
            const colorMatches = targetLayer.items.filter((item) => {
              const targetWords = item.name
                .toLowerCase()
                .split(/[\s\-_]+/)
                .filter((word) => word.length > 0)
              return targetWords.some(
                (targetWord) =>
                  targetWord === sourceWord || targetWord.includes(sourceWord) || sourceWord.includes(targetWord),
              )
            })

            if (colorMatches.length > 0) {
              fallbackColorMatch = colorMatches[Math.floor(Math.random() * colorMatches.length)]
              console.log(
                `🎨 Lenient color match found: "${sourceItem.name}" → "${fallbackColorMatch.name}" (via "${sourceWord}")`,
              )
              break
            }
          }

          if (fallbackColorMatch) {
            selected[rule.targetLayerId] = fallbackColorMatch.id
          } else {
            console.log(`⚠️ No color matches found even with lenient matching - skipping this rule`)
          }
        } else {
          // For non-color properties, try to find any valid item that won't violate exclusion rules
          const validItems = targetLayer.items.filter((item) => {
            return !traitExclusionRules.some((exclusionRule) => {
              if (exclusionRule.sourceLayerId === sourceLayerId && exclusionRule.targetLayerId === rule.targetLayerId) {
                if (exclusionRule.sourceItemId && exclusionRule.targetItemId) {
                  return exclusionRule.sourceItemId === sourceItemId && exclusionRule.targetItemId === item.id
                } else if (exclusionRule.property) {
                  const sourceProp = extractProperty(sourceItem.name, exclusionRule.property)
                  const targetProp = extractProperty(item.name, exclusionRule.property)
                  return sourceProp.toLowerCase() === targetProp.toLowerCase()
                }
              }
              return false
            })
          })

          if (validItems.length > 0) {
            const fallbackItem = validItems[Math.floor(Math.random() * validItems.length)]
            console.log(`🔄 Using fallback item: "${fallbackItem.name}"`)
            selected[rule.targetLayerId] = fallbackItem.id
          } else {
            console.log(`⚠️ No valid fallback items available`)
          }
        }
      }
    })

    // Apply manual mappings (these take absolute priority)
    const relevantMappings = manualMappings.filter(
      (mapping) => mapping.sourceLayerId === sourceLayerId && mapping.sourceItemId === sourceItemId,
    )

    console.log(`Found ${relevantMappings.length} relevant manual mappings`)

    relevantMappings.forEach((mapping) => {
      console.log(`👆 MANUAL MAPPING APPLIED: "${mapping.sourceItemName}" → "${mapping.targetItemName}"`)
      selected[mapping.targetLayerId] = mapping.targetItemId
    })
  }

  // Add the findMatchingItem function to the main component scope
  const findMatchingItem = (sourceItem: any, targetItems: any[], property: string) => {
    console.log(`Finding match for "${sourceItem.name}" using property "${property}"`)

    if (property === "name") {
      const sourcePrefix = sourceItem.name.split(/[-_]/)[0].toLowerCase().trim()
      console.log(`Source prefix: "${sourcePrefix}"`)

      const match = targetItems.find((item) => {
        const targetPrefix = item.name.split(/[-_]/)[0].toLowerCase().trim()
        const matches = sourcePrefix === targetPrefix
        console.log(`   Comparing "${sourcePrefix}" with "${targetPrefix}" (${item.name}): ${matches}`)
        return matches
      })

      console.log(`Match found:`, match?.name || "None")
      return match
    }

    // Enhanced color matching with grouping
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

    const extractColor = (itemName: string) => {
      const words = itemName
        .toLowerCase()
        .split(/[\s\-_]+/)
        .filter((word) => word.length > 0)

      // Find color words in the item name
      const foundColors = words.filter((word) => colors.includes(word))

      if (foundColors.length > 0) {
        return foundColors[0]
      }

      // Check for partial matches
      for (const word of words) {
        for (const color of colors) {
          if (word.includes(color) || color.includes(word)) {
            return color
          }
        }
      }

      return null
    }

    if (property.toLowerCase() === "color") {
      const sourceColor = extractColor(sourceItem.name)
      console.log(`🎨 Source color extracted: "${sourceColor}"`)

      if (!sourceColor) {
        console.log(`No color found in source item "${sourceItem.name}"`)
        return null
      }

      // Find ALL items with the same color
      const matchingItems = targetItems.filter((item) => {
        const targetColor = extractColor(item.name)
        const matches =
          sourceColor === targetColor ||
          (sourceColor === "grey" && targetColor === "gray") ||
          (sourceColor === "gray" && targetColor === "grey")

        if (matches) {
          console.log(
            `   ✅ Color group match: "${sourceItem.name}" (${sourceColor}) ↔ "${item.name}" (${targetColor})`,
          )
        }

        return matches
      })

      console.log(
        `🎨 Found ${matchingItems.length} items in ${sourceColor} color group:`,
        matchingItems.map((item) => item.name),
      )

      // Return a random item from the matching color group
      if (matchingItems.length > 0) {
        const randomMatch = matchingItems[Math.floor(Math.random() * matchingItems.length)]
        console.log(`🎲 Selected random match from color group: "${randomMatch.name}"`)
        return randomMatch
      }

      return null
    }

    // For other properties
    const sourceWords = sourceItem.name
      .toLowerCase()
      .split(/[\s\-_]+/)
      .filter((word) => word.length > 0)
    const propertyIndex = sourceWords.findIndex((word) => word.includes(property.toLowerCase()))
    const sourceProperty =
      propertyIndex >= 0 && propertyIndex < sourceWords.length - 1 ? sourceWords[propertyIndex + 1] : sourceWords[0]

    console.log(`🏷️ Looking for property "${property}" match: "${sourceProperty}"`)

    const matchingItems = targetItems.filter((item) => {
      const targetWords = item.name
        .toLowerCase()
        .split(/[\s\-_]+/)
        .filter((word) => word.length > 0)
      const targetPropertyIndex = targetWords.findIndex((word) => word.includes(property.toLowerCase()))
      const targetProperty =
        targetPropertyIndex >= 0 && targetPropertyIndex < targetWords.length - 1
          ? targetWords[targetPropertyIndex + 1]
          : targetWords[0]

      const matches = sourceProperty === targetProperty
      if (matches) {
        console.log(`   ✅ Property match: "${sourceProperty}" → "${targetProperty}" (${item.name})`)
      }
      return matches
    })

    // Return a random item from the matching group
    if (matchingItems.length > 0) {
      const randomMatch = matchingItems[Math.floor(Math.random() * matchingItems.length)]
      console.log(`🎲 Selected random match: "${randomMatch.name}"`)
      return randomMatch
    }

    console.log(`❌ No matches found for property "${property}"`)
    return null
  }

  const [traitUsageStats, setTraitUsageStats] = useState<Record<string, Record<number, number>>>({})

  const selectWeightedRandom = (items: LayerItem[], layerId: number, forceBalance = false): LayerItem | null => {
    if (items.length === 0) return null

    if (!forceBalance) {
      if (rarityMode === "equal" || items.every((item) => !item.rarity)) {
        const randomIndex = Math.floor(Math.random() * items.length)
        return items[randomIndex]
      }
      // Standard weighted selection
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

    // Advanced balancing with desirability score
    const layerStats = traitUsageStats[layerId] || {}
    const totalUsageInLayer = Object.values(layerStats).reduce((sum, count) => sum + count, 0)
    const averageUsage = totalUsageInLayer > 0 ? totalUsageInLayer / items.length : 0

    const scoredItems = items.map((item) => {
      const usage = layerStats[item.id] || 0
      let usageMultiplier = 1

      if (usage === 0) {
        usageMultiplier = 10 // Heavily prioritize unused items
      } else if (averageUsage > 0 && usage < averageUsage) {
        usageMultiplier = 1 + ((averageUsage - usage) / averageUsage) * 2 // Boost underused items
      }

      const baseWeight = rarityMode === "weighted" ? item.rarity || 1 : 1
      const score = baseWeight * usageMultiplier

      return { ...item, score }
    })

    const totalScore = scoredItems.reduce((sum, item) => sum + item.score, 0)
    if (totalScore === 0) {
      return items[Math.floor(Math.random() * items.length)]
    }

    let random = Math.random() * totalScore
    for (const item of scoredItems) {
      random -= item.score
      if (random <= 0) {
        return item
      }
    }

    return scoredItems[scoredItems.length - 1]
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

  const generateValidCombination = (useBalancing = false): Record<number, number> => {
    const maxAttempts = 200
    let attempts = 0

    while (attempts < maxAttempts) {
      attempts++
      console.log(`\n--- 🔄 Generation Attempt #${attempts} ---`)
      const combination: Record<number, number> = {}
      const processedLayers = new Set<number>()

      // Step 1: Identify source layers (those that drive matching)
      const sourceLayerIds = new Set([...traitMatchingRules, ...manualMappings].map((rule) => rule.sourceLayerId))

      // Step 2: Process source layers first, prioritizing those with fewer items
      const sourceLayers = layers
        .filter((l) => sourceLayerIds.has(l.id))
        .sort((a, b) => a.items.length - b.items.length)

      for (const sourceLayer of sourceLayers) {
        if (processedLayers.has(sourceLayer.id)) continue

        const item = selectWeightedRandom(sourceLayer.items, sourceLayer.id, useBalancing)
        if (item) {
          combination[sourceLayer.id] = item.id
          processedLayers.add(sourceLayer.id)
          console.log(`🎯 Source Layer [${sourceLayer.name}]: Picked "${item.name}"`)

          // Apply matching rules immediately
          applyMatchingRules(sourceLayer.id, item.id, combination)
          // Mark target layers of applied rules as processed
          traitMatchingRules
            .filter((r) => r.sourceLayerId === sourceLayer.id)
            .forEach((r) => processedLayers.add(r.targetLayerId))
          manualMappings
            .filter((m) => m.sourceLayerId === sourceLayer.id)
            .forEach((m) => processedLayers.add(m.targetLayerId))
        }
      }

      // Step 3: Process remaining "free" layers
      const freeLayers = layers.filter((l) => !processedLayers.has(l.id))
      for (const layer of freeLayers) {
        const item = selectWeightedRandom(layer.items, layer.id, useBalancing)
        if (item) {
          combination[layer.id] = item.id
          console.log(`🆓 Free Layer [${layer.name}]: Picked "${item.name}"`)
        }
      }

      // Step 4: Validate against exclusion rules
      let isValid = true
      for (const rule of traitExclusionRules) {
        const sourceItemId = combination[rule.sourceLayerId]
        const targetItemId = combination[rule.targetLayerId]

        if (!sourceItemId || !targetItemId) continue

        if (rule.sourceItemId && rule.targetItemId) {
          if (sourceItemId === rule.sourceItemId && targetItemId === rule.targetItemId) {
            isValid = false
            console.log(`❌ Exclusion VIOLATION: "${rule.sourceItemName}" + "${rule.targetItemName}"`)
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
              console.log(
                `❌ Exclusion VIOLATION: Property "${rule.property}" match between "${sourceItem.name}" and "${targetItem.name}"`,
              )
              break
            }
          }
        }
      }

      if (isValid) {
        console.log(`✅--- Valid Combination Found (Attempt ${attempts}) ---✅`)
        return combination
      }
    }

    console.warn(`⚠️ Max attempts reached. Returning a random combination as a fallback.`)
    return generateRandomCombination(useBalancing)
  }

  const generateWithRules = useCallback(() => {
    if (layers.length === 0) {
      toast({
        title: "Error",
        description: "No layers added yet",
        variant: "destructive",
      })
      return
    }

    const combination = generateValidCombination(true) // Use balancing
    updateTraitUsage(combination)
    setSelectedItems(combination)

    toast({
      title: "Success",
      description: "Random combination with rules generated (balanced)",
    })
  }, [layers, traitMatchingRules, traitExclusionRules, toast])

  const generateRandom = useCallback(() => {
    if (layers.length === 0) {
      toast({
        title: "Error",
        description: "No layers added yet",
        variant: "destructive",
      })
      return
    }

    const combination = generateRandomCombination(true) // Use balancing
    updateTraitUsage(combination)
    setSelectedItems(combination)

    toast({
      title: "Success",
      description: "Random combination generated (balanced)",
    })
  }, [layers, toast])

  const calculateUniqueness = useCallback(() => {
    if (layers.length === 0) {
      toast({
        title: "Error",
        description: "No layers added yet",
        variant: "destructive",
      })
      return
    }

    // Calculate total theoretical combinations
    const layersWithItems = layers.filter((layer) => layer.items.length > 0)
    let totalTheoreticalCombinations = 1
    layersWithItems.forEach((layer) => {
      totalTheoreticalCombinations *= layer.items.length
    })

    // Generate a sample of actual combinations to test constraints
    const sampleSize = Math.min(10000, totalTheoreticalCombinations)
    const validCombinations = new Set<string>()
    const maxAttempts = sampleSize * 3 // Allow more attempts to find valid combinations

    let attempts = 0
    while (validCombinations.size < sampleSize && attempts < maxAttempts) {
      attempts++

      // Generate a random combination
      const combination: Record<number, number> = {}
      layersWithItems.forEach((layer) => {
        if (layer.items.length > 0) {
          const selectedItem = selectWeightedRandom(layer.items, layer.id)
          combination[layer.id] = selectedItem.id
        }
      })

      // Check if combination violates exclusion rules
      let isValidCombination = true
      for (const rule of traitExclusionRules) {
        const sourceItemId = combination[rule.sourceLayerId]
        const targetItemId = combination[rule.targetLayerId]

        if (!sourceItemId || !targetItemId) continue

        if (rule.sourceItemId && rule.targetItemId) {
          // Specific item exclusion
          if (sourceItemId === rule.sourceItemId && targetItemId === rule.targetItemId) {
            isValidCombination = false
            break
          }
        } else if (rule.property) {
          // Property-based exclusion
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
        // Apply matching rules to get the final combination
        const finalCombination = { ...combination }
        const sourceLayers = new Set(traitMatchingRules.map((rule) => rule.sourceLayerId))

        layersWithItems.forEach((layer) => {
          if (sourceLayers.has(layer.id) && finalCombination[layer.id]) {
            applyMatchingRules(layer.id, finalCombination[layer.id], finalCombination)
          }
        })

        // Apply manual mappings
        layersWithItems.forEach((layer) => {
          if (finalCombination[layer.id]) {
            const relevantMappings = manualMappings.filter(
              (mapping) => mapping.sourceLayerId === layer.id && mapping.sourceItemId === finalCombination[layer.id],
            )
            relevantMappings.forEach((mapping) => {
              finalCombination[mapping.targetLayerId] = mapping.targetItemId
            })
          }
        })

        // Create hash for the final combination
        const hash = createCombinationHash(finalCombination)
        validCombinations.add(hash)
      }
    }

    // Calculate actual possible combinations
    let estimatedTotalValid
    if (validCombinations.size === sampleSize && attempts < maxAttempts) {
      // We found the full sample without hitting max attempts, so there are likely more
      estimatedTotalValid = totalTheoreticalCombinations
    } else {
      // Estimate based on success rate
      const successRate = validCombinations.size / attempts
      estimatedTotalValid = Math.round(totalTheoreticalCombinations * successRate)
    }

    // Calculate uniqueness percentage
    const uniquenessPercentage = Math.min(100, (estimatedTotalValid / Math.max(1, totalTheoreticalCombinations)) * 100)

    // Detailed breakdown
    const breakdown = {
      totalTheoreticalCombinations,
      estimatedValidCombinations: estimatedTotalValid,
      sampledValidCombinations: validCombinations.size,
      sampleSize: Math.min(sampleSize, attempts),
      exclusionRules: traitExclusionRules.length,
      matchingRules: traitMatchingRules.length,
      manualMappings: manualMappings.length,
      layerBreakdown: layersWithItems.map((layer) => ({
        name: layer.name,
        itemCount: layer.items.length,
        items: layer.items.map((item) => item.name),
      })),
    }

    console.log("Uniqueness Calculation Breakdown:", breakdown)

    setUniquenessData({
      totalCombinations: estimatedTotalValid,
      uniquenessPercentage,
    })

    toast({
      title: "Success",
      description: `Found ${validCombinations.size} unique combinations in sample of ${Math.min(sampleSize, attempts)}`,
    })
  }, [layers, traitMatchingRules, traitExclusionRules, manualMappings, toast])

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

  // Enhanced batch generation with progress tracking and cancellation support
  const generateBatchCombinations = async (
    batchSize: number,
    useRules: boolean,
    signal?: AbortSignal,
  ): Promise<Record<number, number>[]> => {
    const combinations: Record<number, number>[] = []
    const batchHashes = new Set<string>()
    const maxAttempts = batchSize * 15 // Increased attempts for better success rate

    let attempts = 0
    let lastProgressUpdate = Date.now()

    while (combinations.length < batchSize && attempts < maxAttempts) {
      // Check for cancellation
      if (signal?.aborted) {
        console.log("Batch generation cancelled")
        throw new Error("Generation cancelled")
      }

      attempts++

      // Update progress more frequently and with details
      const now = Date.now()
      if (now - lastProgressUpdate > 100) {
        // Update every 100ms
        const progress = Math.round((combinations.length / batchSize) * 100)
        setExportProgress(progress)
        setProgressDetails(`Generated ${combinations.length} of ${batchSize} NFTs (${attempts} attempts)`)
        lastProgressUpdate = now
      }

      let combination: Record<number, number>

      try {
        if (useRules) {
          combination = generateValidCombination(true)
        } else {
          combination = generateRandomCombination(true)
        }

        const hash = createCombinationHash(combination)

        // Check against both batch duplicates and global duplicates
        if (!batchHashes.has(hash) && !generatedCombinations.has(hash)) {
          combinations.push(combination)
          batchHashes.add(hash)
          updateTraitUsage(combination)
        }
      } catch (error) {
        console.warn("Error generating combination:", error)
        continue
      }

      // Yield control periodically to prevent freezing
      if (attempts % 25 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 1))
      }
    }

    // Update global generated combinations
    setGeneratedCombinations((prev) => new Set([...prev, ...batchHashes]))

    console.log(`Generated ${combinations.length} combinations in ${attempts} attempts`)
    return combinations
  }

  // Enhanced download function with better progress tracking
  const downloadBatch = async (batchData: BatchData) => {
    setBatchStatus("downloading")
    setExportProgress(0)
    setProgressDetails("Initializing download...")

    // Create abort controller for this download
    const abortController = new AbortController()
    abortControllerRef.current = abortController

    try {
      const { default: JSZip } = await import("jszip")
      const zip = new JSZip()
      const imagesFolder = zip.folder("images")
      const metadataFolder = zip.folder("metadata")

      console.log(`Creating ZIP for batch ${batchData.batchNumber} with ${batchData.combinations.length} NFTs`)

      for (let i = 0; i < batchData.combinations.length; i++) {
        if (abortController.signal.aborted) {
          throw new Error("Download cancelled")
        }

        // Update progress during NFT generation (0-80%)
        const nftProgress = Math.round((i / batchData.combinations.length) * 80)
        setExportProgress(nftProgress)
        setProgressDetails(`Generating NFT ${i + 1} of ${batchData.combinations.length}...`)

        const combination = batchData.combinations[i]
        const nftNumber = batchData.startingNumber + i

        try {
          // Create canvas with optimized settings
          const canvas = document.createElement("canvas")
          canvas.width = batchData.imageSize
          canvas.height = batchData.imageSize
          const ctx = canvas.getContext("2d", {
            alpha: false,
            willReadFrequently: false,
            desynchronized: true, // Better performance
          })!

          ctx.fillStyle = "white"
          ctx.fillRect(0, 0, batchData.imageSize, batchData.imageSize)

          const sortedLayers = layers.filter((layer) => combination[layer.id]).sort((a, b) => a.zIndex - b.zIndex)

          // Load and draw images with better error handling
          for (const layer of sortedLayers) {
            const itemId = combination[layer.id]
            const item = layer.items.find((i) => i.id === itemId)
            if (!item) continue

            await new Promise<void>((resolve, reject) => {
              const img = new Image()
              const timeout = setTimeout(() => {
                reject(new Error(`Timeout loading image for ${item.name}`))
              }, 10000) // 10 second timeout

              img.onload = () => {
                clearTimeout(timeout)
                try {
                  ctx.drawImage(img, 0, 0, batchData.imageSize, batchData.imageSize)
                  resolve()
                } catch (error) {
                  reject(error)
                }
              }
              img.onerror = () => {
                clearTimeout(timeout)
                reject(new Error(`Failed to load image for ${item.name}`))
              }
              img.crossOrigin = "anonymous"
              img.src = item.dataUrl
            })
          }

          // Convert to blob with optimized quality
          const blob = await new Promise<Blob>((resolve) => {
            canvas.toBlob((blob) => resolve(blob!), "image/png", 0.8) // Reduced quality for speed
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

          // Clean up canvas
          canvas.width = 1
          canvas.height = 1

          // Yield control every 5 NFTs
          if (i % 5 === 0 && i > 0) {
            await new Promise((resolve) => setTimeout(resolve, 10))
          }
        } catch (error) {
          console.error(`Error generating NFT ${nftNumber}:`, error)
          // Continue with next NFT instead of failing entire batch
        }
      }

      if (abortController.signal.aborted) {
        throw new Error("Download cancelled")
      }

      // Update progress for ZIP creation (80-95%)
      setExportProgress(82)
      setProgressDetails("Preparing ZIP file...")
      console.log(`Finished generating ${batchData.combinations.length} NFTs, starting ZIP creation...`)

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
      console.log("Creating ZIP file...")

      const zipContent = await zip.generateAsync(
        {
          type: "blob",
          compression: "STORE", // No compression for speed
          streamFiles: false, // Disable streaming for faster generation
        },
        (metadata) => {
          // Update progress during ZIP creation (85-98%)
          const zipProgress = 85 + metadata.percent * 0.13
          setExportProgress(Math.round(zipProgress))
          setProgressDetails(`Creating ZIP file... ${metadata.percent.toFixed(1)}%`)
        },
      )

      setExportProgress(99)
      setProgressDetails("Starting download...")
      console.log("ZIP created, starting download...")

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

      // Update session state
      const updatedCompletedBatches = [...completedBatches, batchData.batchNumber]
      setCompletedBatches(updatedCompletedBatches)
      setBatchStatus("completed")
      setExportProgress(100)
      setProgressDetails("Download completed!")

      // Update export session
      if (exportSession) {
        const updatedSession: ExportSession = {
          ...exportSession,
          completedBatches: updatedCompletedBatches,
          status: currentBatch >= totalBatches ? "completed" : "completed",
          generatedCombinations: Array.from(generatedCombinations),
          timestamp: Date.now(),
        }
        setExportSession(updatedSession)
      }

      // Play notification sound
      playNotificationSound()

      toast({
        title: "Success",
        description: `Batch ${batchData.batchNumber} downloaded successfully! (NFTs ${batchData.startingNumber}-${endNumber})`,
      })

      // Auto-continue to next batch if enabled and not the last batch
      if (autoDownload && currentBatch < totalBatches) {
        setTimeout(() => {
          generateNextBatch()
        }, 2000) // 2 second delay before next batch
      }
    } catch (error) {
      console.error("Download error:", error)
      if (error instanceof Error && error.message === "Download cancelled") {
        setBatchStatus("ready")
        setProgressDetails("Download cancelled")
        toast({
          title: "Cancelled",
          description: "Download was cancelled",
          variant: "destructive",
        })
      } else {
        toast({
          title: "Error",
          description: `Failed to download batch ${batchData.batchNumber}: ${error}`,
          variant: "destructive",
        })
        setBatchStatus("ready") // Reset to ready state on error
      }
    } finally {
      abortControllerRef.current = null
    }
  }

  const generateNextBatch = async () => {
    if (!exportConfig) return

    const nextBatchNumber = currentBatch + 1
    const remainingNFTs = exportConfig.totalCount - completedBatches.length * exportConfig.batchSize
    const currentBatchSize = Math.min(exportConfig.batchSize, remainingNFTs)
    const startingNumber = (nextBatchNumber - 1) * exportConfig.batchSize + 1

    setCurrentBatch(nextBatchNumber)
    setBatchStatus("generating")
    setExportProgress(0)
    setProgressDetails("Starting batch generation...")

    console.log(`Generating batch ${nextBatchNumber} with ${currentBatchSize} NFTs`)

    // Create abort controller for this generation
    const abortController = new AbortController()
    abortControllerRef.current = abortController

    // Update export session
    if (exportSession) {
      const updatedSession: ExportSession = {
        ...exportSession,
        currentBatch: nextBatchNumber,
        status: "generating",
        timestamp: Date.now(),
      }
      setExportSession(updatedSession)
    }

    try {
      const combinations = await generateBatchCombinations(
        currentBatchSize,
        exportConfig.useRules,
        abortController.signal,
      )

      if (combinations.length === 0) {
        toast({
          title: "Error",
          description: `Could not generate enough unique combinations for batch ${nextBatchNumber}`,
          variant: "destructive",
        })
        setBatchExportMode(false)
        clearExportSession()
        return
      }

      const batchData: BatchData = {
        combinations,
        batchNumber: nextBatchNumber,
        collectionName: exportConfig.collectionName,
        imageSize: exportConfig.imageSize,
        startingNumber,
      }

      setCurrentBatchData(batchData)
      setBatchStatus("ready")
      setExportProgress(100)
      setProgressDetails(`Batch ${nextBatchNumber} ready for download`)

      // Update export session with batch data
      const updatedSession: ExportSession = {
        ...exportSession,
        status: "ready",
        currentBatchData: batchData,
        generatedCombinations: Array.from(generatedCombinations),
        timestamp: Date.now(),
      }
      setExportSession(updatedSession)

      toast({
        title: "Batch Ready",
        description: `Batch ${nextBatchNumber} generated successfully with ${combinations.length} unique NFTs!`,
      })

      // Auto-download if enabled
      if (autoDownload) {
        setTimeout(() => {
          downloadBatch(batchData)
        }, 1000) // 1 second delay before auto-download
      }
    } catch (error) {
      if (error instanceof Error && error.message === "Generation cancelled") {
        console.log("Batch generation was cancelled")
        return
      }

      console.error("Batch generation error:", error)
      toast({
        title: "Error",
        description: `Failed to generate batch ${nextBatchNumber}: ${error}`,
        variant: "destructive",
      })
      setBatchExportMode(false)
      clearExportSession()
    } finally {
      abortControllerRef.current = null
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

    const totalPossibleCombinations = layers.reduce((total, layer) => total * layer.items.length, 1)

    if (exportCount > totalPossibleCombinations) {
      toast({
        title: "Warning",
        description: `Requested ${exportCount} NFTs but only ${totalPossibleCombinations} unique combinations possible. Reducing to maximum possible.`,
        variant: "destructive",
      })
      exportCount = totalPossibleCombinations
    }

    if (splitIntoMultiple) {
      // Start batch export mode
      const numBatches = Math.ceil(exportCount / batchSize)
      const sessionId = `export-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

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

      console.log(`Starting batch export: ${exportCount} NFTs in ${numBatches} batches of ${batchSize} each`)

      // Create abort controller for first batch
      const abortController = new AbortController()
      abortControllerRef.current = abortController

      // Generate first batch
      try {
        const firstBatchSize = Math.min(batchSize, exportCount)
        const combinations = await generateBatchCombinations(firstBatchSize, useRules, abortController.signal)

        if (combinations.length === 0) {
          toast({
            title: "Error",
            description: "Could not generate enough unique combinations for first batch",
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
          imageSize,
          startingNumber: 1,
        }

        setCurrentBatchData(batchData)
        setBatchStatus("ready")
        setExportProgress(100)
        setProgressDetails("First batch ready for download")

        // Update session with first batch data
        const updatedSession: ExportSession = {
          ...newExportSession,
          status: "ready",
          currentBatchData: batchData,
          generatedCombinations: Array.from(generatedCombinations),
        }
        setExportSession(updatedSession)

        toast({
          title: "First Batch Ready",
          description: `Batch 1 generated successfully with ${combinations.length} unique NFTs!`,
        })
      } catch (error) {
        if (error instanceof Error && error.message === "Generation cancelled") {
          console.log("First batch generation was cancelled")
          return
        }

        console.error("First batch generation error:", error)
        toast({
          title: "Error",
          description: `Failed to generate first batch: ${error}`,
          variant: "destructive",
        })
        setBatchExportMode(false)
        clearExportSession()
      } finally {
        abortControllerRef.current = null
      }
    } else {
      // Single export mode (existing functionality)
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
          description: "Error generating collection: " + (error as Error).message,
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
    const { default: JSZip } = await import("jszip")
    const zip = new JSZip()
    const imagesFolder = zip.folder("images")
    const metadataFolder = zip.folder("metadata")

    console.log(`Starting export of ${exportCount} NFTs`)

    // Create abort controller
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
            canvas.toBlob((blob) => resolve(blob!), "image/png", 0.8) // Reduced quality for speed
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

      if (!abortController.signal.aborted) {
        setExportProgress(96)
        setProgressDetails("Preparing ZIP file...")

        zip.file(
          "README.txt",
          `NFT Collection: ${collectionName}
Generated on: ${new Date().toLocaleString()}
Total NFTs: ${allCombinations.length}
Image Size: ${imageSize}x${imageSize}px

⚠️ IMPORTANT: All NFTs in this collection are guaranteed to be unique.

IPFS Instructions:
1. Upload the 'images' folder to IPFS
2. Get the CID (hash) from IPFS for the images folder
3. Replace [CID] in ALL metadata JSON files with your actual images CID
4. Upload the 'metadata' folder to IPFS
5. Use the metadata folder CID for your NFT contract`,
        )

        setExportProgress(98)
        setProgressDetails("Creating ZIP file...")

        const zipContent = await zip.generateAsync({
          type: "blob",
          compression: "STORE", // No compression for speed
          streamFiles: false, // Disable streaming for faster generation
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
      }
    } finally {
      abortControllerRef.current = null
    }
  }

  const cancelExport = () => {
    setExportCancelled(true)

    // Cancel any ongoing operations
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    // Clear intervals
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current)
    }

    // Reset states
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

    // Clear session
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
        // Resume generation
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

  // Project management functions
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

          // Validate the imported data
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

          // Clear any existing selections
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
          // Reset file input to allow importing the same file again
          if (event.target) {
            event.target.value = ""
          }
        }
      }
      reader.readAsText(file)
    },
    [toast],
  )

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-purple-400 mb-2">NFT Layer Viewer</h1>
          <p className="text-gray-400">Enhanced with persistent sessions and optimized batch processing</p>
        </div>

        {/* Session Recovery Card */}
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

        <Card className="bg-gray-800 border-gray-700">
          <CardHeader>
            <CardTitle className="text-purple-400">Step 2: Manage Layers & Layer Order</CardTitle>
            <CardDescription>Organize your layers and set their stacking order</CardDescription>
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
                  .sort((a, b) => b.zIndex - a.zIndex) // Sort by z-index descending (top to bottom)
                  .map((layer, visualIndex) => {
                    const isTopLayer = layer.zIndex === Math.max(...layers.map((l) => l.zIndex))
                    const isBottomLayer = layer.zIndex === Math.min(...layers.map((l) => l.zIndex))

                    return (
                      <Card
                        key={layer.id}
                        className={`
              bg-gray-700 border-gray-600 transition-all duration-200
              ${isTopLayer ? "ring-2 ring-green-500 bg-green-900/20" : ""}
              ${isBottomLayer ? "ring-2 ring-orange-500 bg-orange-900/20" : ""}
              ${!isTopLayer && !isBottomLayer ? "hover:bg-gray-600" : ""}
            `}
                      >
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                          <div className="flex items-center space-x-3">
                            <div className="flex flex-col items-center">
                              <div
                                className={`
                    w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold
                    ${
                      isTopLayer
                        ? "bg-green-500 text-white"
                        : isBottomLayer
                          ? "bg-orange-500 text-white"
                          : "bg-blue-500 text-white"
                    }
                  `}
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
                                {layer.items.length} items • Z-Index: {layer.zIndex}
                                {isTopLayer && " • Renders on top"}
                                {isBottomLayer && " • Renders behind"}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center space-x-2">
                            <div className="flex flex-col space-y-1">
                              <Button
                                size="sm"
                                onClick={() => moveLayer(layer.id, "up")}
                                disabled={isTopLayer}
                                className={`
                      h-6 px-2 text-xs
                      ${isTopLayer ? "opacity-50 cursor-not-allowed" : "hover:bg-green-600"}
                    `}
                              >
                                ↑ Up
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => moveLayer(layer.id, "down")}
                                disabled={isBottomLayer}
                                className={`
                      h-6 px-2 text-xs
                      ${isBottomLayer ? "opacity-50 cursor-not-allowed" : "hover:bg-orange-600"}
                    `}
                              >
                                ↓ Down
                              </Button>
                            </div>
                            <Button size="sm" variant="destructive" onClick={() => removeLayer(layer.id)}>
                              Remove
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="flex items-center space-x-4">
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
                            <div className="space-y-4 mt-4">
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
                                        ? { name: "Ultra Rare", color: "bg-red-500", textColor: "text-red-400" }
                                        : rarity < 15
                                          ? { name: "Rare", color: "bg-purple-500", textColor: "text-purple-400" }
                                          : rarity < 30
                                            ? { name: "Uncommon", color: "bg-blue-500", textColor: "text-blue-400" }
                                            : { name: "Common", color: "bg-gray-500", textColor: "text-gray-400" }

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
                                            value={rarity.toFixed(1)}
                                            min="0"
                                            max="100"
                                            step="0.1"
                                            onChange={(e) => {
                                              const newRarity = Number.parseFloat(e.target.value) || 0
                                              if (newRarity >= 0 && newRarity <= 100) {
                                                updateItemRarity(layer.id, item.id, newRarity)
                                              }
                                            }}
                                          />
                                          <span className="text-sm text-gray-400">%</span>
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
                                        Math.abs(layer.items.reduce((sum, item) => sum + (item.rarity || 0), 0) - 100) <
                                        0.1
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
                                      ⚠️ Total should equal 100% for accurate rarity distribution
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    )
                  })}
              </div>
            )}
          </CardContent>
        </Card>

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
              onRemoveExclusionRule={removeTraitExclusionRule}
              onRemoveMatchingRule={(ruleId) => {
                setTraitMatchingRules((prev) => prev.filter((rule) => rule.id !== ruleId))
                toast({ title: "Success", description: "Matching rule removed" })
              }}
              onAddManualMapping={addManualMapping}
              onRemoveManualMapping={removeManualMapping}
            />
          </CardContent>
        </Card>

        <Card className="bg-gray-800 border-gray-700">
          <CardHeader>
            <CardTitle className="text-purple-400">Step 4: Preview</CardTitle>
            <CardDescription>Preview your NFT combinations</CardDescription>
          </CardHeader>
          <CardContent>
            <NFTPreview
              layers={layers}
              selectedItems={selectedItems}
              onSelectionChange={setSelectedItems}
              onGenerateRandom={generateRandom}
              onGenerateWithRules={generateWithRules}
              onCalculateUniqueness={calculateUniqueness}
              uniquenessData={uniquenessData}
              rarityMode={rarityMode}
            />
          </CardContent>
        </Card>

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

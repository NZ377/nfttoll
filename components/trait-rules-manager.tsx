"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Separator } from "@/components/ui/separator"
import { Trash2, X, Plus } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { colorFamilyFromName } from "@/lib/color-utils"

interface Layer {
  id: number
  name: string
  items: { id: number; name: string; dataUrl: string; rarity?: number }[]
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

interface TraitRulesManagerProps {
  layers: Layer[]
  traitMatchingRules: TraitMatchingRule[]
  traitExclusionRules: TraitExclusionRule[]
  manualMappings: ManualMapping[]
  onAddMatchingRule: (sourceLayerId: number, targetLayerId: number, property: string) => void
  onAddExclusionRule: (
    sourceLayerId: number,
    targetLayerId: number,
    property?: string,
    sourceItemId?: number,
    targetItemId?: number,
  ) => void
  onRemoveExclusionRule: (ruleId: number) => void
  onRemoveMatchingRule: (ruleId: number) => void
  onAddManualMapping: (mapping: ManualMapping) => void
  onRemoveManualMapping: (mappingId: number) => void
}

export function TraitRulesManager({
  layers,
  traitMatchingRules,
  traitExclusionRules,
  manualMappings,
  onAddMatchingRule,
  onAddExclusionRule,
  onRemoveExclusionRule,
  onRemoveMatchingRule,
  onAddManualMapping,
  onRemoveManualMapping,
}: TraitRulesManagerProps) {
  const [matchingSourceLayer, setMatchingSourceLayer] = useState("")
  const [matchingTargetLayer, setMatchingTargetLayer] = useState("")
  const [matchingProperty, setMatchingProperty] = useState("color")
  const [customProperty, setCustomProperty] = useState("")

  const [exclusionSourceLayer, setExclusionSourceLayer] = useState("")
  const [exclusionTargetLayer, setExclusionTargetLayer] = useState("")
  const [exclusionProperty, setExclusionProperty] = useState("color")
  const [exclusionCustomProperty, setExclusionCustomProperty] = useState("")
  const [exclusionSourceItem, setExclusionSourceItem] = useState("")
  const [exclusionTargetItem, setExclusionTargetItem] = useState("")
  const [exclusionType, setExclusionType] = useState<"property" | "specific">("property")
  const [exclusionSourceItems, setExclusionSourceItems] = useState<string[]>([])
  const [exclusionTargetItems, setExclusionTargetItems] = useState<string[]>([])

  const [manualSourceLayer, setManualSourceLayer] = useState("")
  const [manualTargetLayer, setManualTargetLayer] = useState("")
  const [manualSourceItem, setManualSourceItem] = useState("")
  const [manualTargetItem, setManualTargetItem] = useState("")
  const [manualSourceItems, setManualSourceItems] = useState<string[]>([])
  const [manualTargetItems, setManualTargetItems] = useState<string[]>([])
  const [manualMatchingType, setManualMatchingType] = useState<"single" | "multiple">("single")

  const findMatchingItem = (sourceItem: any, targetItems: any[], property: string) => {
    console.log(`Finding match for "${sourceItem.name}" using property "${property}"`)

    if (property === "name") {
      const sourcePrefix = sourceItem.name.split(/[-_]/)[0].toLowerCase().trim()
      console.log(`Source prefix: "${sourcePrefix}"`)
      const match = targetItems.find((item) => {
        const targetPrefix = item.name.split(/[-_]/)[0].toLowerCase().trim()
        console.log(`Comparing "${sourcePrefix}" with "${targetPrefix}"`)
        return sourcePrefix === targetPrefix
      })
      console.log(`Match found:`, match?.name || "None")
      return match
    }

    if (property.toLowerCase() === "color") {
      const sourceFamily = colorFamilyFromName(sourceItem.name)
      console.log(`Source color family: "${sourceFamily}"`)
      if (!sourceFamily) return null

      const matchingItems = targetItems.filter((item) => colorFamilyFromName(item.name) === sourceFamily)
      console.log(
        `Found ${matchingItems.length} matching items for family "${sourceFamily}":`,
        matchingItems.map((i) => i.name),
      )

      if (matchingItems.length > 0) {
        const randomMatch = matchingItems[Math.floor(Math.random() * matchingItems.length)]
        console.log(`Selected random match: "${randomMatch.name}"`)
        return randomMatch
      }

      console.log(`❌ No family matches found for "${sourceFamily}"`)
      return null
    }

    // Other properties
    const sourceWords = sourceItem.name
      .toLowerCase()
      .split(/[\s\-_]+/)
      .filter((word: string) => word.length > 0)
    console.log(`Source words for property matching:`, sourceWords)

    const propertyIndex = sourceWords.findIndex((word: string) => word.includes(property.toLowerCase()))
    let sourceProperty

    if (propertyIndex >= 0) {
      sourceProperty =
        propertyIndex < sourceWords.length - 1 ? sourceWords[propertyIndex + 1] : sourceWords[propertyIndex]
    } else {
      sourceProperty = sourceWords[0]
    }

    console.log(`Source property "${property}": "${sourceProperty}"`)

    const matchingItems = targetItems.filter((item) => {
      const targetWords = item.name
        .toLowerCase()
        .split(/[\s\-_]+/)
        .filter((word: string) => word.length > 0)
      const targetPropertyIndex = targetWords.findIndex((word: string) => word.includes(property.toLowerCase()))

      let targetProperty
      if (targetPropertyIndex >= 0) {
        targetProperty =
          targetPropertyIndex < targetWords.length - 1
            ? targetWords[targetPropertyIndex + 1]
            : targetWords[targetPropertyIndex]
      } else {
        targetProperty = targetWords[0]
      }

      const matches = sourceProperty === targetProperty
      if (matches) {
        console.log(`✅ Property match: "${sourceProperty}" → "${targetProperty}" (${item.name})`)
      }

      return matches
    })

    console.log(
      `Found ${matchingItems.length} matching items for property "${property}":`,
      matchingItems.map((item: any) => item.name),
    )

    if (matchingItems.length > 0) {
      const randomMatch = matchingItems[Math.floor(Math.random() * matchingItems.length)]
      console.log(`Selected random match: "${randomMatch.name}"`)
      return randomMatch
    }

    console.log(`❌ No property matches found for "${property}"`)
    return null
  }

  const handleAddMatchingRule = () => {
    const sourceId = Number.parseInt(matchingSourceLayer)
    const targetId = Number.parseInt(matchingTargetLayer)
    const property = matchingProperty === "custom" ? customProperty : matchingProperty

    if (
      !sourceId ||
      !targetId ||
      !property ||
      matchingSourceLayer === "placeholder" ||
      matchingTargetLayer === "placeholder"
    )
      return

    onAddMatchingRule(sourceId, targetId, property)

    // Reset form
    setMatchingSourceLayer("")
    setMatchingTargetLayer("")
    setMatchingProperty("color")
    setCustomProperty("")
  }

  const handleAddManualMapping = () => {
    if (manualMatchingType === "single") {
      const sourceLayerId = Number.parseInt(manualSourceLayer)
      const targetLayerId = Number.parseInt(manualTargetLayer)
      const sourceItemId = Number.parseInt(manualSourceItem)
      const targetItemId = Number.parseInt(manualTargetItem)

      if (
        !sourceLayerId ||
        !targetLayerId ||
        !sourceItemId ||
        !targetItemId ||
        manualSourceLayer === "placeholder" ||
        manualTargetLayer === "placeholder" ||
        manualSourceItem === "placeholder" ||
        manualTargetItem === "placeholder"
      )
        return

      const sourceLayer = layers.find((l) => l.id === sourceLayerId)
      const targetLayer = layers.find((l) => l.id === targetLayerId)
      const sourceItem = sourceLayer?.items.find((i) => i.id === sourceItemId)
      const targetItem = targetLayer?.items.find((i) => i.id === targetItemId)

      if (!sourceLayer || !targetLayer || !sourceItem || !targetItem) return

      const mapping = {
        id: Date.now(),
        sourceLayerId,
        sourceItemId,
        targetLayerId,
        targetItemId,
        sourceLayerName: sourceLayer.name,
        targetLayerName: targetLayer.name,
        sourceItemName: sourceItem.name,
        targetItemName: targetItem.name,
      }

      onAddManualMapping(mapping)
    } else {
      // Handle multiple mappings
      const sourceLayerId = Number.parseInt(manualSourceLayer)
      const targetLayerId = Number.parseInt(manualTargetLayer)

      if (!sourceLayerId || !targetLayerId || manualSourceItems.length === 0 || manualTargetItems.length === 0) return

      const sourceLayer = layers.find((l) => l.id === sourceLayerId)
      const targetLayer = layers.find((l) => l.id === targetLayerId)

      if (!sourceLayer || !targetLayer) return

      // Create mappings for all combinations
      manualSourceItems.forEach((sourceItemIdStr) => {
        manualTargetItems.forEach((targetItemIdStr) => {
          const sourceItemId = Number.parseInt(sourceItemIdStr)
          const targetItemId = Number.parseInt(targetItemIdStr)
          const sourceItem = sourceLayer.items.find((i) => i.id === sourceItemId)
          const targetItem = targetLayer.items.find((i) => i.id === targetItemId)

          if (sourceItem && targetItem) {
            const mapping = {
              id: Date.now() + Math.random() * 1000,
              sourceLayerId,
              sourceItemId,
              targetLayerId,
              targetItemId,
              sourceLayerName: sourceLayer.name,
              targetLayerName: targetLayer.name,
              sourceItemName: sourceItem.name,
              targetItemName: targetItem.name,
            }

            onAddManualMapping(mapping)
          }
        })
      })
    }

    // Reset form
    setManualSourceLayer("")
    setManualTargetLayer("")
    setManualSourceItem("")
    setManualTargetItem("")
    setManualSourceItems([])
    setManualTargetItems([])
  }

  const handleAddExclusionRule = () => {
    const sourceId = Number.parseInt(exclusionSourceLayer)
    const targetId = Number.parseInt(exclusionTargetLayer)

    if (!sourceId || !targetId || exclusionSourceLayer === "placeholder" || exclusionTargetLayer === "placeholder")
      return

    if (exclusionType === "property") {
      const property = exclusionProperty === "custom" ? exclusionCustomProperty : exclusionProperty
      if (!property) return
      onAddExclusionRule(sourceId, targetId, property)
    } else {
      // Handle multiple item selections
      if (exclusionSourceItems.length === 0 || exclusionTargetItems.length === 0) {
        // Show error message
        return
      }

      // Create exclusion rules for all combinations
      exclusionSourceItems.forEach((sourceItemIdStr) => {
        exclusionTargetItems.forEach((targetItemIdStr) => {
          const sourceItemId = Number.parseInt(sourceItemIdStr)
          const targetItemId = Number.parseInt(targetItemIdStr)
          onAddExclusionRule(sourceId, targetId, undefined, sourceItemId, targetItemId)
        })
      })
    }

    // Reset form
    setExclusionSourceLayer("")
    setExclusionTargetLayer("")
    setExclusionProperty("color")
    setExclusionCustomProperty("")
    setExclusionSourceItems([])
    setExclusionTargetItems([])
  }

  const sourceLayerForExclusion = layers.find((l) => l.id === Number.parseInt(exclusionSourceLayer))
  const targetLayerForExclusion = layers.find((l) => l.id === Number.parseInt(exclusionTargetLayer))
  const sourceLayerForManual = layers.find((l) => l.id === Number.parseInt(manualSourceLayer))
  const targetLayerForManual = layers.find((l) => l.id === Number.parseInt(manualTargetLayer))

  useEffect(() => {
    setExclusionSourceItems([])
  }, [exclusionSourceLayer])

  useEffect(() => {
    setExclusionTargetItems([])
  }, [exclusionTargetLayer])

  useEffect(() => {
    setManualSourceItems([])
  }, [manualSourceLayer])

  useEffect(() => {
    setManualTargetItems([])
  }, [manualTargetLayer])

  return (
    <Tabs defaultValue="matching" className="w-full">
      <TabsList className="grid w-full grid-cols-3 bg-gray-700">
        <TabsTrigger value="matching">Trait Matching</TabsTrigger>
        <TabsTrigger value="exclusion">Trait Exclusion</TabsTrigger>
        <TabsTrigger value="view">View Rules</TabsTrigger>
      </TabsList>

      <TabsContent value="matching" className="space-y-4">
        <div className="bg-gray-700 rounded-lg p-4 space-y-4">
          <h3 className="font-semibold text-purple-400">Trait Matching Rules</h3>
          <p className="text-sm text-gray-400">
            Match traits automatically by name patterns or manually select specific combinations
          </p>

          {/* Auto-Match Section */}
          <div className="bg-gray-600 rounded-lg p-4 space-y-3">
            <h4 className="font-medium text-green-400">🤖 Automatic Matching</h4>
            <p className="text-xs text-gray-400">
              Automatically match traits with similar names (e.g., "Pink-Head" matches "Pink-Body")
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Source Layer</Label>
                <Select value={matchingSourceLayer} onValueChange={setMatchingSourceLayer}>
                  <SelectTrigger className="bg-gray-600 border-gray-500">
                    <SelectValue placeholder="Select source layer" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="placeholder">Select source layer</SelectItem>
                    {layers.map((layer) => (
                      <SelectItem key={layer.id} value={layer.id.toString()}>
                        {layer.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Target Layer</Label>
                <Select value={matchingTargetLayer} onValueChange={setMatchingTargetLayer}>
                  <SelectTrigger className="bg-gray-600 border-gray-500">
                    <SelectValue placeholder="Select target layer" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="placeholder">Select target layer</SelectItem>
                    {layers.map((layer) => (
                      <SelectItem key={layer.id} value={layer.id.toString()}>
                        {layer.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Match By</Label>
                <Select value={matchingProperty} onValueChange={setMatchingProperty}>
                  <SelectTrigger className="bg-gray-600 border-gray-500">
                    <SelectValue value={matchingProperty} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="name">Name Pattern (Auto)</SelectItem>
                    <SelectItem value="color">Color</SelectItem>
                    <SelectItem value="style">Style</SelectItem>
                    <SelectItem value="type">Type</SelectItem>
                    <SelectItem value="custom">Custom Property</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {matchingProperty === "custom" && (
                <div>
                  <Label>Custom Property</Label>
                  <Input
                    value={customProperty}
                    onChange={(e) => setCustomProperty(e.target.value)}
                    placeholder="Enter custom property name"
                    className="bg-gray-600 border-gray-500"
                  />
                </div>
              )}

              <div className="flex items-end">
                <Button onClick={handleAddMatchingRule} className="bg-green-600 hover:bg-green-700 w-full">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Auto Rule
                </Button>
              </div>
            </div>

            {/* Preview Auto Matches */}
            {matchingSourceLayer &&
              matchingTargetLayer &&
              matchingSourceLayer !== "placeholder" &&
              matchingTargetLayer !== "placeholder" && (
                <div className="mt-4 p-3 bg-gray-800 rounded">
                  <h5 className="text-sm font-medium text-yellow-400 mb-2">Preview Auto Matches:</h5>
                  <div className="text-xs space-y-1 max-h-40 overflow-y-auto">
                    {(() => {
                      const sourceLayer = layers.find((l) => l.id === Number.parseInt(matchingSourceLayer))
                      const targetLayer = layers.find((l) => l.id === Number.parseInt(matchingTargetLayer))
                      if (!sourceLayer || !targetLayer) return null

                      const matches = sourceLayer.items.map((sourceItem) => {
                        const matchedTarget = findMatchingItem(
                          sourceItem,
                          targetLayer.items,
                          matchingProperty === "custom" ? customProperty : matchingProperty,
                        )
                        return { source: sourceItem.name, target: matchedTarget?.name || "No match" }
                      })

                      return matches.map((match, i) => (
                        <div key={i} className="flex justify-between items-center py-1">
                          <span className="text-green-400 text-xs truncate max-w-32">{match.source}</span>
                          <span className="text-gray-400 mx-2">→</span>
                          <span
                            className={`text-xs truncate max-w-32 ${match.target === "No match" ? "text-red-400" : "text-blue-400"}`}
                          >
                            {match.target}
                          </span>
                        </div>
                      ))
                    })()}
                  </div>
                  <div className="mt-2 text-xs text-gray-500">
                    {(() => {
                      const sourceLayer = layers.find((l) => l.id === Number.parseInt(matchingSourceLayer))
                      const targetLayer = layers.find((l) => l.id === Number.parseInt(matchingTargetLayer))
                      if (!sourceLayer || !targetLayer) return null

                      const matches = sourceLayer.items.filter((sourceItem) => {
                        const matchedTarget = findMatchingItem(
                          sourceItem,
                          targetLayer.items,
                          matchingProperty === "custom" ? customProperty : matchingProperty,
                        )
                        return matchedTarget !== undefined
                      })

                      return `${matches.length}/${sourceLayer.items.length} traits will have matches`
                    })()}
                  </div>
                </div>
              )}
          </div>

          {/* Manual Match Section */}
          <div className="bg-gray-600 rounded-lg p-4 space-y-3">
            <h4 className="font-medium text-blue-400">👆 Manual Matching</h4>
            <p className="text-xs text-gray-400">Manually select specific traits to match together</p>

            <div>
              <Label>Matching Type</Label>
              <Select
                value={manualMatchingType}
                onValueChange={(value: "single" | "multiple") => setManualMatchingType(value)}
              >
                <SelectTrigger className="bg-gray-600 border-gray-500">
                  <SelectValue value={manualMatchingType} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="single">Single Pair (1-to-1)</SelectItem>
                  <SelectItem value="multiple">Multiple Pairs (Many-to-Many)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Source Layer</Label>
                <Select value={manualSourceLayer} onValueChange={setManualSourceLayer}>
                  <SelectTrigger className="bg-gray-600 border-gray-500">
                    <SelectValue placeholder="Select source layer" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="placeholder">Select source layer</SelectItem>
                    {layers.map((layer) => (
                      <SelectItem key={layer.id} value={layer.id.toString()}>
                        {layer.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Target Layer</Label>
                <Select value={manualTargetLayer} onValueChange={setManualTargetLayer}>
                  <SelectTrigger className="bg-gray-600 border-gray-500">
                    <SelectValue placeholder="Select target layer" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="placeholder">Select target layer</SelectItem>
                    {layers.map((layer) => (
                      <SelectItem key={layer.id} value={layer.id.toString()}>
                        {layer.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {manualMatchingType === "single" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Source Item</Label>
                  {manualSourceLayer && manualSourceLayer !== "placeholder" && (
                    <Select value={manualSourceItem} onValueChange={setManualSourceItem}>
                      <SelectTrigger className="bg-gray-600 border-gray-500">
                        <SelectValue placeholder="Select source item" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="placeholder">Select source item</SelectItem>
                        {layers
                          .find((l) => l.id === Number.parseInt(manualSourceLayer))
                          ?.items.map((item) => (
                            <SelectItem key={item.id} value={item.id.toString()}>
                              {item.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                <div>
                  <Label>Target Item</Label>
                  {manualTargetLayer && manualTargetLayer !== "placeholder" && (
                    <Select value={manualTargetItem} onValueChange={setManualTargetItem}>
                      <SelectTrigger className="bg-gray-600 border-gray-500">
                        <SelectValue placeholder="Select target item" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="placeholder">Select target item</SelectItem>
                        {layers
                          .find((l) => l.id === Number.parseInt(manualTargetLayer))
                          ?.items.map((item) => (
                            <SelectItem key={item.id} value={item.id.toString()}>
                              {item.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <Label>Source Items (Select Multiple)</Label>
                  <div className="bg-gray-600 rounded-lg p-3 max-h-40 overflow-y-auto">
                    {sourceLayerForManual?.items.map((item) => (
                      <div key={item.id} className="flex items-center space-x-2 py-1">
                        <Checkbox
                          id={`manual-source-${item.id}`}
                          checked={manualSourceItems.includes(item.id.toString())}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setManualSourceItems((prev) => [...prev, item.id.toString()])
                            } else {
                              setManualSourceItems((prev) => prev.filter((id) => id !== item.id.toString()))
                            }
                          }}
                        />
                        <Label htmlFor={`manual-source-${item.id}`} className="text-sm cursor-pointer">
                          {item.name}
                        </Label>
                      </div>
                    ))}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">Selected: {manualSourceItems.length} items</div>
                </div>

                <div>
                  <Label>Target Items (Select Multiple)</Label>
                  <div className="bg-gray-600 rounded-lg p-3 max-h-40 overflow-y-auto">
                    {targetLayerForManual?.items.map((item) => (
                      <div key={item.id} className="flex items-center space-x-2 py-1">
                        <Checkbox
                          id={`manual-target-${item.id}`}
                          checked={manualTargetItems.includes(item.id.toString())}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setManualTargetItems((prev) => [...prev, item.id.toString()])
                            } else {
                              setManualTargetItems((prev) => prev.filter((id) => id !== item.id.toString()))
                            }
                          }}
                        />
                        <Label htmlFor={`manual-target-${item.id}`} className="text-sm cursor-pointer">
                          {item.name}
                        </Label>
                      </div>
                    ))}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">Selected: {manualTargetItems.length} items</div>
                </div>

                {manualMatchingType === "multiple" && sourceLayerForManual && (
                  <div className="flex space-x-2 mb-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setManualSourceItems(sourceLayerForManual.items.map((item) => item.id.toString()))}
                    >
                      Select All Source
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setManualSourceItems([])}>
                      Clear Source
                    </Button>
                  </div>
                )}

                {manualMatchingType === "multiple" && targetLayerForManual && (
                  <div className="flex space-x-2 mb-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setManualTargetItems(targetLayerForManual.items.map((item) => item.id.toString()))}
                    >
                      Select All Target
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setManualTargetItems([])}>
                      Clear Target
                    </Button>
                  </div>
                )}
              </div>
            )}

            <Button onClick={handleAddManualMapping} className="bg-blue-600 hover:bg-blue-700">
              <Plus className="w-4 h-4 mr-2" />
              Add Manual Match{manualMatchingType === "multiple" ? "es" : ""}
            </Button>
          </div>
        </div>
      </TabsContent>

      <TabsContent value="exclusion" className="space-y-4">
        <div className="bg-gray-700 rounded-lg p-4 space-y-4">
          <h3 className="font-semibold text-purple-400">Add Exclusion Rule</h3>
          <p className="text-sm text-gray-400">Prevent certain traits from appearing together in the same NFT</p>

          <div className="space-y-4">
            <div>
              <Label>Exclusion Type</Label>
              <Select value={exclusionType} onValueChange={(value: "property" | "specific") => setExclusionType(value)}>
                <SelectTrigger className="bg-gray-600 border-gray-500">
                  <SelectValue value={exclusionType} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="property">Property-based (e.g., no matching colors)</SelectItem>
                  <SelectItem value="specific">Specific items (e.g., "Red Hat" + "Blue Shirt")</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Source Layer</Label>
                <Select value={exclusionSourceLayer} onValueChange={setExclusionSourceLayer}>
                  <SelectTrigger className="bg-gray-600 border-gray-500">
                    <SelectValue placeholder="Select source layer" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="placeholder">Select source layer</SelectItem>
                    {layers.map((layer) => (
                      <SelectItem key={layer.id} value={layer.id.toString()}>
                        {layer.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Target Layer</Label>
                <Select value={exclusionTargetLayer} onValueChange={setExclusionTargetLayer}>
                  <SelectTrigger className="bg-gray-600 border-gray-500">
                    <SelectValue placeholder="Select target layer" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="placeholder">Select target layer</SelectItem>
                    {layers.map((layer) => (
                      <SelectItem key={layer.id} value={layer.id.toString()}>
                        {layer.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {exclusionType === "property" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Exclude Property</Label>
                  <Select value={exclusionProperty} onValueChange={setExclusionProperty}>
                    <SelectTrigger className="bg-gray-600 border-gray-500">
                      <SelectValue value={exclusionProperty} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="color">Color</SelectItem>
                      <SelectItem value="style">Style</SelectItem>
                      <SelectItem value="type">Type</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {exclusionProperty === "custom" && (
                  <div>
                    <Label>Custom Property</Label>
                    <Input
                      value={exclusionCustomProperty}
                      onChange={(e) => setExclusionCustomProperty(e.target.value)}
                      placeholder="Enter custom property name"
                      className="bg-gray-600 border-gray-500"
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <Label>Source Items (Select Multiple)</Label>
                  <div className="bg-gray-600 rounded-lg p-3 max-h-40 overflow-y-auto">
                    {sourceLayerForExclusion?.items.map((item) => (
                      <div key={item.id} className="flex items-center space-x-2 py-1">
                        <Checkbox
                          id={`source-${item.id}`}
                          checked={exclusionSourceItems.includes(item.id.toString())}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setExclusionSourceItems((prev) => [...prev, item.id.toString()])
                            } else {
                              setExclusionSourceItems((prev) => prev.filter((id) => id !== item.id.toString()))
                            }
                          }}
                        />
                        <Label htmlFor={`source-${item.id}`} className="text-sm cursor-pointer">
                          {item.name}
                        </Label>
                      </div>
                    ))}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">Selected: {exclusionSourceItems.length} items</div>
                </div>

                <div>
                  <Label>Target Items (Select Multiple)</Label>
                  <div className="bg-gray-600 rounded-lg p-3 max-h-40 overflow-y-auto">
                    {targetLayerForExclusion?.items.map((item) => (
                      <div key={item.id} className="flex items-center space-x-2 py-1">
                        <Checkbox
                          id={`target-${item.id}`}
                          checked={exclusionTargetItems.includes(item.id.toString())}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setExclusionTargetItems((prev) => [...prev, item.id.toString()])
                            } else {
                              setExclusionTargetItems((prev) => prev.filter((id) => id !== item.id.toString()))
                            }
                          }}
                        />
                        <Label htmlFor={`target-${item.id}`} className="text-sm cursor-pointer">
                          {item.name}
                        </Label>
                      </div>
                    ))}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">Selected: {exclusionTargetItems.length} items</div>
                </div>
              </div>
            )}
          </div>

          {exclusionType === "specific" && sourceLayerForExclusion && (
            <div className="flex space-x-2 mb-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setExclusionSourceItems(sourceLayerForExclusion.items.map((item) => item.id.toString()))}
              >
                Select All Source
              </Button>
              <Button size="sm" variant="outline" onClick={() => setExclusionSourceItems([])}>
                Clear Source
              </Button>
            </div>
          )}

          {exclusionType === "specific" && targetLayerForExclusion && (
            <div className="flex space-x-2 mb-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setExclusionTargetItems(targetLayerForExclusion.items.map((item) => item.id.toString()))}
              >
                Select All Target
              </Button>
              <Button size="sm" variant="outline" onClick={() => setExclusionTargetItems([])}>
                Clear Target
              </Button>
            </div>
          )}

          <Button onClick={handleAddExclusionRule} className="bg-red-600 hover:bg-red-700">
            <X className="w-4 h-4 mr-2" />
            Add Exclusion Rule
          </Button>
        </div>
      </TabsContent>

      <TabsContent value="view" className="space-y-4">
        <div className="space-y-4">
          {/* Auto Matching Rules */}
          <div>
            <h3 className="font-semibold text-green-400 mb-3">🤖 Automatic Matching Rules</h3>
            {traitMatchingRules.length === 0 ? (
              <p className="text-gray-400">No automatic matching rules added yet.</p>
            ) : (
              <div className="space-y-2">
                {traitMatchingRules.map((rule) => (
                  <div key={rule.id} className="bg-gray-700 rounded p-3 flex justify-between items-center">
                    <span className="text-sm">
                      Auto-match by <span className="text-green-400 font-semibold">{rule.property}</span> from{" "}
                      <span className="text-green-400 font-semibold">{rule.sourceLayerName}</span> to{" "}
                      <span className="text-green-400 font-semibold">{rule.targetLayerName}</span>
                    </span>
                    <Button size="sm" variant="destructive" onClick={() => onRemoveMatchingRule(rule.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Separator className="bg-gray-600" />

          {/* Manual Mappings */}
          <div>
            <h3 className="font-semibold text-blue-400 mb-3">👆 Manual Mappings</h3>
            {manualMappings.length === 0 ? (
              <p className="text-gray-400">No manual mappings added yet.</p>
            ) : (
              <div className="space-y-2">
                {manualMappings.map((mapping) => (
                  <div key={mapping.id} className="bg-gray-700 rounded p-3 flex justify-between items-center">
                    <span className="text-sm">
                      <span className="text-blue-400 font-semibold">"{mapping.sourceItemName}"</span> always matches{" "}
                      <span className="text-blue-400 font-semibold">"{mapping.targetItemName}"</span>
                      <div className="text-xs text-gray-400 mt-1">
                        {mapping.sourceLayerName} → {mapping.targetLayerName}
                      </div>
                    </span>
                    <Button size="sm" variant="destructive" onClick={() => onRemoveManualMapping(mapping.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Separator className="bg-gray-600" />

          {/* Exclusion Rules */}
          <div>
            <h3 className="font-semibold text-red-400 mb-3">❌ Exclusion Rules</h3>
            {traitExclusionRules.length === 0 ? (
              <p className="text-gray-400">No exclusion rules added yet.</p>
            ) : (
              <div className="space-y-2">
                {traitExclusionRules.map((rule) => (
                  <div key={rule.id} className="bg-gray-700 rounded p-3 flex justify-between items-center">
                    <span className="text-sm">
                      {rule.property ? (
                        <>
                          Exclude matching <span className="text-red-400 font-semibold">{rule.property}</span> between{" "}
                          <span className="text-red-400 font-semibold">{rule.sourceLayerName}</span> and{" "}
                          <span className="text-red-400 font-semibold">{rule.targetLayerName}</span>
                        </>
                      ) : (
                        <>
                          Exclude <span className="text-red-400 font-semibold">"{rule.sourceItemName}"</span> with{" "}
                          <span className="text-red-400 font-semibold">"{rule.targetItemName}"</span>
                          <div className="text-xs text-gray-400 mt-1">
                            {rule.sourceLayerName} → {rule.targetLayerName}
                          </div>
                        </>
                      )}
                    </span>
                    <Button size="sm" variant="destructive" onClick={() => onRemoveExclusionRule(rule.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </TabsContent>
    </Tabs>
  )
}

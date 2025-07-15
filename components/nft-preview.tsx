"use client"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Shuffle, Calculator } from "lucide-react"

interface Layer {
  id: number
  name: string
  items: { id: number; name: string; dataUrl: string; rarity?: number }[]
  zIndex: number
}

interface NFTPreviewProps {
  layers: Layer[]
  selectedItems: Record<number, number>
  onSelectionChange: (selected: Record<number, number>) => void
  onGenerateRandom: () => void
  onGenerateWithRules: () => void
  onCalculateUniqueness: () => void
  uniquenessData: { totalCombinations: number; uniquenessPercentage: number } | null
  rarityMode: "equal" | "weighted"
}

export function NFTPreview({
  layers,
  selectedItems,
  onSelectionChange,
  onGenerateRandom,
  onGenerateWithRules,
  onCalculateUniqueness,
  uniquenessData,
  rarityMode,
}: NFTPreviewProps) {
  const handleLayerSelection = (layerId: number, itemId: string) => {
    const newSelected = { ...selectedItems }
    if (itemId === "" || itemId === "none") {
      delete newSelected[layerId]
    } else {
      newSelected[layerId] = Number.parseInt(itemId)
    }
    onSelectionChange(newSelected)
  }

  const sortedLayers = [...layers].sort((a, b) => a.zIndex - b.zIndex)
  const selectedLayerItems = sortedLayers
    .filter((layer) => selectedItems[layer.id])
    .map((layer) => {
      const item = layer.items.find((i) => i.id === selectedItems[layer.id])
      return item ? { ...item, zIndex: layer.zIndex } : null
    })
    .filter(Boolean)
    .sort((a, b) => a!.zIndex - b!.zIndex)

  return (
    <div className="space-y-6">
      {/* Preview Box */}
      <div className="flex justify-center">
        <div className="relative w-96 h-96 bg-gray-700 border-2 border-dashed border-gray-500 rounded-lg overflow-hidden">
          {selectedLayerItems.map((item, index) => (
            <img
              key={`${item!.id}-${index}`}
              src={item!.dataUrl || "/placeholder.svg"}
              alt={item!.name}
              className="absolute inset-0 w-full h-full object-contain"
              style={{ zIndex: item!.zIndex }}
            />
          ))}
          {selectedLayerItems.length === 0 && (
            <div className="flex items-center justify-center h-full text-gray-400">Select traits to preview</div>
          )}

          {/* Layer Order Indicator */}
          {selectedLayerItems.length > 0 && (
            <div className="absolute top-2 right-2 bg-black/70 rounded p-2 text-xs">
              <div className="text-yellow-400 font-semibold mb-1">Layer Order:</div>
              {selectedLayerItems
                .sort((a, b) => b!.zIndex - a!.zIndex)
                .map((item, index) => {
                  const layer = sortedLayers.find((l) => l.items.some((i) => i.id === item!.id))
                  return (
                    <div key={item!.id} className="flex items-center space-x-2 text-white">
                      <span
                        className={`
                        w-4 h-4 rounded-full text-xs flex items-center justify-center font-bold
                        ${
                          index === 0
                            ? "bg-green-500"
                            : index === selectedLayerItems.length - 1
                              ? "bg-orange-500"
                              : "bg-blue-500"
                        }
                      `}
                      >
                        {item!.zIndex}
                      </span>
                      <span className="truncate max-w-20">{layer?.name}</span>
                    </div>
                  )
                })}
            </div>
          )}
        </div>
      </div>

      {/* Layer Selectors */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sortedLayers.map((layer) => (
          <div key={layer.id} className="space-y-2">
            <Label>
              {layer.name} (z-index: {layer.zIndex})
            </Label>
            <Select
              value={selectedItems[layer.id]?.toString() || ""}
              onValueChange={(value) => handleLayerSelection(layer.id, value)}
            >
              <SelectTrigger className="bg-gray-600 border-gray-500">
                <SelectValue placeholder={`Select ${layer.name}`} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {layer.items.map((item) => (
                  <SelectItem key={item.id} value={item.id.toString()}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-2 justify-center">
        <Button onClick={onGenerateRandom} className="bg-blue-600 hover:bg-blue-700">
          <Shuffle className="w-4 h-4 mr-2" />
          Random Combination
        </Button>
        <Button onClick={onGenerateWithRules} className="bg-green-600 hover:bg-green-700">
          <Shuffle className="w-4 h-4 mr-2" />
          Random With Rules
        </Button>
        <Button onClick={onCalculateUniqueness} className="bg-purple-600 hover:bg-purple-700">
          <Calculator className="w-4 h-4 mr-2" />
          Calculate Uniqueness
        </Button>
      </div>

      {/* Uniqueness Display */}
      {uniquenessData && (
        <Card className="bg-gray-700 border-gray-600">
          <CardHeader>
            <CardTitle className="text-purple-400">Collection Analysis</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className="bg-gray-600 rounded p-3">
                <div className="text-gray-400 text-xs">Theoretical Maximum</div>
                <div className="font-bold text-lg">
                  {layers.reduce((total, layer) => total * layer.items.length, 1).toLocaleString()}
                </div>
                <div className="text-xs text-gray-400">All possible combinations</div>
              </div>
              <div className="bg-gray-600 rounded p-3">
                <div className="text-gray-400 text-xs">Estimated Valid</div>
                <div className="font-bold text-lg text-green-400">
                  {uniquenessData.totalCombinations.toLocaleString()}
                </div>
                <div className="text-xs text-gray-400">After applying rules</div>
              </div>
              <div className="bg-gray-600 rounded p-3">
                <div className="text-gray-400 text-xs">Uniqueness Score</div>
                <div className="font-bold text-lg text-purple-400">
                  {uniquenessData.uniquenessPercentage.toFixed(1)}%
                </div>
                <div className="text-xs text-gray-400">Collection variety</div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Collection Variety</span>
                <span>{uniquenessData.uniquenessPercentage.toFixed(1)}%</span>
              </div>
              <Progress value={uniquenessData.uniquenessPercentage} className="h-3" />
            </div>

            {/* Layer Breakdown */}
            <div className="mt-4">
              <h4 className="font-medium text-yellow-400 mb-2">Layer Contribution:</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                {layers.map((layer) => (
                  <div key={layer.id} className="bg-gray-600 rounded p-2">
                    <div className="font-medium">{layer.name}</div>
                    <div className="text-gray-400">{layer.items.length} variants</div>
                    <div className="text-xs text-blue-400">
                      {layer.items
                        .map((item) => item.name)
                        .join(", ")
                        .substring(0, 30)}
                      {layer.items.map((item) => item.name).join(", ").length > 30 ? "..." : ""}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="text-sm text-gray-400">
              {uniquenessData.uniquenessPercentage < 30 && (
                <p className="text-red-400">
                  ⚠️ Low variety: Consider adding more traits or reducing restrictive rules.
                </p>
              )}
              {uniquenessData.uniquenessPercentage >= 30 && uniquenessData.uniquenessPercentage < 70 && (
                <p className="text-yellow-400">
                  ✓ Good variety: Your collection has balanced consistency and uniqueness.
                </p>
              )}
              {uniquenessData.uniquenessPercentage >= 70 && (
                <p className="text-green-400">
                  🎉 Excellent variety: Your collection offers great diversity and uniqueness!
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

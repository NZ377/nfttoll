"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { RotateCcw } from "lucide-react"

interface Layer {
  id: number
  name: string
  items: { id: number; name: string; dataUrl: string; rarity?: number }[]
  zIndex: number
}

interface TraitUsageStatsProps {
  layers: Layer[]
  traitUsageStats: Record<string, Record<number, number>>
  onClearStats: () => void
}

export function TraitUsageStats({ layers, traitUsageStats, onClearStats }: TraitUsageStatsProps) {
  if (layers.length === 0) return null

  const hasUsageData = Object.keys(traitUsageStats).length > 0

  return (
    <Card className="bg-gray-700 border-gray-600">
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="text-green-400">Trait Usage Statistics</CardTitle>
          {hasUsageData && (
            <Button onClick={onClearStats} variant="outline" size="sm">
              <RotateCcw className="w-4 h-4 mr-2" />
              Reset Stats
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!hasUsageData ? (
          <p className="text-gray-400 text-center py-4">
            Generate some NFTs to see trait usage statistics. The system will automatically balance trait usage to
            ensure all traits get used.
          </p>
        ) : (
          <div className="space-y-6">
            {layers.map((layer) => {
              const layerStats = traitUsageStats[layer.id] || {}
              const totalUsage = Object.values(layerStats).reduce((sum, count) => sum + count, 0)
              const maxUsage = Math.max(...Object.values(layerStats), 1)

              if (totalUsage === 0) return null

              return (
                <div key={layer.id} className="space-y-3">
                  <div className="flex justify-between items-center">
                    <h4 className="font-semibold text-white">{layer.name}</h4>
                    <span className="text-sm text-gray-400">Total: {totalUsage} uses</span>
                  </div>

                  <div className="space-y-2">
                    {layer.items.map((item) => {
                      const usage = layerStats[item.id] || 0
                      const percentage = totalUsage > 0 ? (usage / totalUsage) * 100 : 0
                      const relativeUsage = maxUsage > 0 ? (usage / maxUsage) * 100 : 0
                      const isUnused = usage === 0
                      const isUnderused = usage > 0 && usage < (totalUsage / layer.items.length) * 0.5

                      return (
                        <div key={item.id} className="space-y-1">
                          <div className="flex justify-between items-center text-sm">
                            <span
                              className={`${isUnused ? "text-red-400" : isUnderused ? "text-yellow-400" : "text-white"}`}
                            >
                              {item.name}
                              {isUnused && " (UNUSED)"}
                              {isUnderused && " (UNDERUSED)"}
                            </span>
                            <span className="text-gray-400">
                              {usage} times ({percentage.toFixed(1)}%)
                            </span>
                          </div>
                          <Progress value={relativeUsage} className={`h-2 ${isUnused ? "opacity-50" : ""}`} />
                        </div>
                      )
                    })}
                  </div>

                  {/* Layer Summary */}
                  <div className="bg-gray-600 rounded p-2 text-xs">
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <div className="text-red-400 font-semibold">
                          {layer.items.filter((item) => (layerStats[item.id] || 0) === 0).length}
                        </div>
                        <div className="text-gray-400">Unused</div>
                      </div>
                      <div>
                        <div className="text-yellow-400 font-semibold">
                          {
                            layer.items.filter((item) => {
                              const usage = layerStats[item.id] || 0
                              return usage > 0 && usage < (totalUsage / layer.items.length) * 0.5
                            }).length
                          }
                        </div>
                        <div className="text-gray-400">Underused</div>
                      </div>
                      <div>
                        <div className="text-green-400 font-semibold">
                          {
                            layer.items.filter((item) => {
                              const usage = layerStats[item.id] || 0
                              return usage >= (totalUsage / layer.items.length) * 0.5
                            }).length
                          }
                        </div>
                        <div className="text-gray-400">Well Used</div>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}

            <div className="mt-6 p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg">
              <h5 className="font-semibold text-blue-400 mb-2">🎯 Smart Balancing Active</h5>
              <p className="text-sm text-gray-300">
                The system automatically prioritizes unused and underused traits when generating new NFTs. This ensures
                all your uploaded traits get fair representation in your collection.
              </p>
              <div className="mt-2 text-xs text-gray-400">
                • <span className="text-red-400">Red traits</span> will be heavily prioritized
                <br />• <span className="text-yellow-400">Yellow traits</span> will be moderately prioritized
                <br />• <span className="text-green-400">Green traits</span> have normal priority
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

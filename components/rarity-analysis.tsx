"use client"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

interface LayerItem {
  id: number
  name: string
  dataUrl: string
  rarity?: number
}

interface Layer {
  id: number
  name: string
  items: LayerItem[]
  zIndex: number
}

interface RarityAnalysisProps {
  layers: Layer[]
  rarityMode: "equal" | "weighted"
}

export function RarityAnalysis({ layers, rarityMode }: RarityAnalysisProps) {
  if (rarityMode === "equal" || layers.length === 0) return null

  const calculateCollectionRarity = () => {
    const analysis = layers.map((layer) => {
      const items = layer.items
        .map((item) => ({
          name: item.name,
          rarity: item.rarity || 0,
          category:
            item.rarity && item.rarity < 5
              ? "Ultra Rare"
              : item.rarity && item.rarity < 15
                ? "Rare"
                : item.rarity && item.rarity < 30
                  ? "Uncommon"
                  : "Common",
          expectedIn1000: Math.round((item.rarity || 0) * 10),
          expectedIn10000: Math.round((item.rarity || 0) * 100),
        }))
        .sort((a, b) => a.rarity - b.rarity)

      const totalRarity = layer.items.reduce((sum, item) => sum + (item.rarity || 0), 0)
      const rarityTiers = {
        ultraRare: items.filter((item) => item.rarity < 5).length,
        rare: items.filter((item) => item.rarity >= 5 && item.rarity < 15).length,
        uncommon: items.filter((item) => item.rarity >= 15 && item.rarity < 30).length,
        common: items.filter((item) => item.rarity >= 30).length,
      }

      return {
        layerName: layer.name,
        items,
        totalRarity,
        rarityTiers,
        isBalanced: Math.abs(totalRarity - 100) < 0.1,
      }
    })

    return analysis
  }

  const analysis = calculateCollectionRarity()

  return (
    <Card className="bg-gray-700 border-gray-600">
      <CardHeader>
        <CardTitle className="text-yellow-400">Advanced Rarity Analysis</CardTitle>
        <CardDescription>Detailed breakdown of trait rarities and expected distribution</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {analysis.map((layer) => (
          <div key={layer.layerName} className="space-y-4">
            <div className="flex justify-between items-center">
              <h4 className="font-semibold text-lg">{layer.layerName}</h4>
              <div className="flex items-center space-x-2">
                <Badge variant={layer.isBalanced ? "default" : "destructive"}>
                  Total: {layer.totalRarity.toFixed(1)}%
                </Badge>
                {!layer.isBalanced && <span className="text-xs text-red-400">⚠️ Unbalanced</span>}
              </div>
            </div>

            {/* Rarity Tier Summary */}
            <div className="grid grid-cols-4 gap-2 text-xs">
              <div className="bg-red-500/20 border border-red-500/30 rounded p-2 text-center">
                <div className="text-red-400 font-semibold">Ultra Rare</div>
                <div className="text-white">{layer.rarityTiers.ultraRare} traits</div>
                <div className="text-gray-400">&lt; 5%</div>
              </div>
              <div className="bg-purple-500/20 border border-purple-500/30 rounded p-2 text-center">
                <div className="text-purple-400 font-semibold">Rare</div>
                <div className="text-white">{layer.rarityTiers.rare} traits</div>
                <div className="text-gray-400">5-15%</div>
              </div>
              <div className="bg-blue-500/20 border border-blue-500/30 rounded p-2 text-center">
                <div className="text-blue-400 font-semibold">Uncommon</div>
                <div className="text-white">{layer.rarityTiers.uncommon} traits</div>
                <div className="text-gray-400">15-30%</div>
              </div>
              <div className="bg-gray-500/20 border border-gray-500/30 rounded p-2 text-center">
                <div className="text-gray-400 font-semibold">Common</div>
                <div className="text-white">{layer.rarityTiers.common} traits</div>
                <div className="text-gray-400">&gt; 30%</div>
              </div>
            </div>

            {/* Individual Trait Details */}
            <div className="space-y-2">
              <h5 className="font-medium text-gray-300">Expected Distribution</h5>
              <div className="grid grid-cols-1 gap-2 text-sm">
                {layer.items.map((item) => (
                  <div key={item.name} className="bg-gray-600 rounded p-3 flex justify-between items-center">
                    <div className="flex items-center space-x-3">
                      <span className="font-medium">{item.name}</span>
                      <span
                        className={`px-2 py-1 rounded text-xs font-semibold ${
                          item.rarity < 5
                            ? "bg-red-500 text-white"
                            : item.rarity < 15
                              ? "bg-purple-500 text-white"
                              : item.rarity < 30
                                ? "bg-blue-500 text-white"
                                : "bg-gray-500 text-white"
                        }`}
                      >
                        {item.category}
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">{item.rarity.toFixed(1)}%</div>
                      <div className="text-xs text-gray-400">
                        ~{item.expectedIn1000}/1K • ~{item.expectedIn10000}/10K
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}

        <div className="mt-6 p-4 bg-gray-600 rounded-lg">
          <h5 className="font-semibold mb-3 text-green-400">Rarity Guide</h5>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div>
              <strong className="text-red-400">Ultra Rare (&lt; 5%):</strong>
              <p className="text-gray-300">Legendary traits that appear very rarely. Perfect for special editions.</p>
            </div>
            <div>
              <strong className="text-purple-400">Rare (5-15%):</strong>
              <p className="text-gray-300">Valuable traits that collectors seek. Good for premium variants.</p>
            </div>
            <div>
              <strong className="text-blue-400">Uncommon (15-30%):</strong>
              <p className="text-gray-300">Moderately rare traits that add variety without being too common.</p>
            </div>
            <div>
              <strong className="text-gray-400">Common (&gt; 30%):</strong>
              <p className="text-gray-300">Base traits that form the foundation of your collection.</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

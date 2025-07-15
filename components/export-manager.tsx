"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Download, AlertTriangle, Trash2 } from "lucide-react"

interface ExportManagerProps {
  isExporting: boolean
  exportProgress: number
  onExport: (
    exportCount: number,
    collectionName: string,
    imageSize: number,
    useRules: boolean,
    batchSize: number,
    splitIntoMultiple?: boolean,
  ) => void
  onCancel: () => void
  generatedCount: number
  onClearHistory: () => void
  batchExportMode: boolean
  currentBatch: number
  totalBatches: number
}

export function ExportManager({
  isExporting,
  exportProgress,
  onExport,
  onCancel,
  generatedCount,
  onClearHistory,
  batchExportMode,
  currentBatch,
  totalBatches,
}: ExportManagerProps) {
  const [exportCount, setExportCount] = useState(10)
  const [collectionName, setCollectionName] = useState("My NFT Collection")
  const [imageSize, setImageSize] = useState(1024)
  const [useRules, setUseRules] = useState(true)
  const [batchSize, setBatchSize] = useState(100)
  const [splitIntoMultiple, setSplitIntoMultiple] = useState(false)

  const handleExport = () => {
    onExport(exportCount, collectionName, imageSize, useRules, batchSize, splitIntoMultiple)
  }

  const showWarning = exportCount >= 1000
  const showSplitOption = exportCount > 1500

  return (
    <div className="space-y-4">
      {/* Duplicate Prevention Status */}
      {generatedCount > 0 && (
        <Card className="bg-gray-700 border-gray-600">
          <CardHeader>
            <CardTitle className="text-green-400">Duplicate Prevention Active</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Badge variant="outline" className="text-green-400 border-green-400">
                  {generatedCount.toLocaleString()} NFTs Generated
                </Badge>
                <p className="text-sm text-gray-400 mt-1">
                  All future exports will automatically avoid generating these combinations again.
                </p>
              </div>
              <Button onClick={onClearHistory} variant="outline" size="sm" className="border-red-500 text-red-400">
                <Trash2 className="w-4 h-4 mr-2" />
                Clear History
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="collection-name">Collection Name</Label>
          <Input
            id="collection-name"
            value={collectionName}
            onChange={(e) => setCollectionName(e.target.value)}
            className="bg-gray-600 border-gray-500"
          />
        </div>
        <div>
          <Label htmlFor="export-count">Number of NFTs</Label>
          <Input
            id="export-count"
            type="number"
            min="1"
            max="10000"
            value={exportCount}
            onChange={(e) => setExportCount(Number.parseInt(e.target.value) || 1)}
            className="bg-gray-600 border-gray-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <Label htmlFor="image-size">Image Size</Label>
          <Select value={imageSize.toString()} onValueChange={(value) => setImageSize(Number.parseInt(value))}>
            <SelectTrigger className="bg-gray-600 border-gray-500">
              <SelectValue value={imageSize.toString()} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="512">512 x 512 px</SelectItem>
              <SelectItem value="1024">1024 x 1024 px</SelectItem>
              <SelectItem value="2048">2048 x 2048 px</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="batch-size">Batch Size</Label>
          <Select value={batchSize.toString()} onValueChange={(value) => setBatchSize(Number.parseInt(value))}>
            <SelectTrigger className="bg-gray-600 border-gray-500">
              <SelectValue value={batchSize.toString()} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="50">50 NFTs per batch (Fast)</SelectItem>
              <SelectItem value="100">100 NFTs per batch (Balanced)</SelectItem>
              <SelectItem value="250">250 NFTs per batch (Large)</SelectItem>
              <SelectItem value="500">500 NFTs per batch (Very Large)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center space-x-2 pt-6">
          <Checkbox id="use-rules" checked={useRules} onCheckedChange={(checked) => setUseRules(checked as boolean)} />
          <Label htmlFor="use-rules">Apply Matching Rules</Label>
        </div>
      </div>

      {/* Split into Multiple Collections Option */}
      {showSplitOption && (
        <div className="space-y-3">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="split-multiple"
              checked={splitIntoMultiple}
              onCheckedChange={(checked) => setSplitIntoMultiple(checked as boolean)}
            />
            <Label htmlFor="split-multiple" className="text-yellow-400 font-semibold">
              Split into Multiple Collections (Recommended for {exportCount}+ NFTs)
            </Label>
          </div>
          {splitIntoMultiple && (
            <Alert className="border-green-500 bg-green-500/10">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <strong>Smart Splitting Enabled:</strong> Your collection will be split into{" "}
                {Math.ceil(exportCount / 1500)} separate ZIP files of ~1500 NFTs each. Each batch will be guaranteed
                unique with no duplicates across all files.
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {showWarning && !splitIntoMultiple && (
        <Alert className="border-yellow-500 bg-yellow-500/10">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>Large Collection Warning:</strong> Generating {exportCount} NFTs in a single file may cause browser
            memory issues. Consider enabling "Split into Multiple Collections" above.
          </AlertDescription>
        </Alert>
      )}

      {/* Batch Export Progress */}
      {batchExportMode && (
        <Card className="bg-gray-700 border-gray-600">
          <CardHeader>
            <CardTitle className="text-blue-400">Batch Export in Progress</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm">
              <span>
                Processing Batch {currentBatch} of {totalBatches}
              </span>
              <span>{exportProgress}%</span>
            </div>
            <Progress value={exportProgress} className="h-3" />
            <p className="text-sm text-gray-400">
              Each batch will download automatically when complete. No duplicates will be generated across batches.
            </p>
          </CardContent>
        </Card>
      )}

      {isExporting && !batchExportMode && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Generating Collection...</span>
            <span>{exportProgress}%</span>
          </div>
          <Progress value={exportProgress} className="h-3" />
          <div className="flex justify-center">
            <Button onClick={onCancel} variant="destructive" size="sm">
              Cancel Export
            </Button>
          </div>
        </div>
      )}

      {!isExporting && (
        <div className="flex gap-2 justify-center">
          <Button onClick={handleExport} className="bg-purple-600 hover:bg-purple-700">
            <Download className="w-4 h-4 mr-2" />
            Generate Collection
          </Button>
        </div>
      )}
    </div>
  )
}

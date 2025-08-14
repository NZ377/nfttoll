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
import { Download, AlertTriangle, Trash2, Play, CheckCircle } from "lucide-react"

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
  batchStatus: "generating" | "ready" | "downloading" | "completed" | "paused"
  onDownloadBatch: () => void
  onContinueToNext: () => void
  completedBatches: number[]
  currentBatchNFTs?: number
  progressDetails?: string
  autoDownload?: boolean
  onToggleAutoDownload?: (enabled: boolean) => void
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
  batchStatus,
  onDownloadBatch,
  onContinueToNext,
  completedBatches,
  currentBatchNFTs = 0,
  progressDetails = "",
  autoDownload = false,
  onToggleAutoDownload,
}: ExportManagerProps) {
  const [exportCount, setExportCount] = useState(100)
  const [collectionName, setCollectionName] = useState("My NFT Collection")
  const [imageSize, setImageSize] = useState(1024)
  const [useRules, setUseRules] = useState(true)
  const [batchSize, setBatchSize] = useState(50)
  const [splitIntoMultiple, setSplitIntoMultiple] = useState(false)

  const handleExport = () => {
    onExport(exportCount, collectionName, imageSize, useRules, batchSize, splitIntoMultiple)
  }

  const showSplitOption = exportCount > 25
  const showWarning = exportCount >= 100 && !splitIntoMultiple

  const getBatchStatusColor = (status: string) => {
    switch (status) {
      case "generating":
        return "text-blue-400"
      case "ready":
        return "text-yellow-400"
      case "downloading":
        return "text-purple-400"
      case "completed":
        return "text-green-400"
      default:
        return "text-gray-400"
    }
  }

  const getBatchStatusText = (status: string) => {
    switch (status) {
      case "generating":
        return "Generating NFTs..."
      case "ready":
        return "Batch Ready for Download"
      case "downloading":
        return "Downloading..."
      case "completed":
        return "Batch Completed"
      default:
        return "Unknown Status"
    }
  }

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
              <Button
                onClick={onClearHistory}
                variant="outline"
                size="sm"
                className="border-red-500 text-red-400 bg-transparent"
                disabled={batchExportMode}
              >
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
            disabled={batchExportMode}
          />
        </div>
        <div>
          <Label htmlFor="export-count">Number of NFTs</Label>
          <Input
            id="export-count"
            type="number"
            min={1}
            max={10000}
            value={exportCount}
            onChange={(e) => setExportCount(Number.parseInt(e.target.value) || 1)}
            className="bg-gray-600 border-gray-500"
            disabled={batchExportMode}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <Label htmlFor="image-size">Image Size</Label>
          <Select
            value={imageSize.toString()}
            onValueChange={(value) => setImageSize(Number.parseInt(value))}
            disabled={batchExportMode}
          >
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
          <Select
            value={batchSize.toString()}
            onValueChange={(value) => setBatchSize(Number.parseInt(value))}
            disabled={batchExportMode}
          >
            <SelectTrigger className="bg-gray-600 border-gray-500">
              <SelectValue value={batchSize.toString()} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="25">25 NFTs per batch (Recommended)</SelectItem>
              <SelectItem value="50">50 NFTs per batch (Good)</SelectItem>
              <SelectItem value="75">75 NFTs per batch (Large)</SelectItem>
              <SelectItem value="100">100 NFTs per batch (Very Large)</SelectItem>
            </SelectContent>
          </Select>
          {batchSize > 75 && <p className="text-xs text-yellow-400 mt-1">⚠️ Large batches may take longer to process</p>}
        </div>
        <div className="flex items-center space-x-2 pt-6">
          <Checkbox
            id="use-rules"
            checked={useRules}
            onCheckedChange={(checked) => setUseRules(checked as boolean)}
            disabled={batchExportMode}
          />
          <Label htmlFor="use-rules">Apply Matching Rules</Label>
        </div>
      </div>

      {showSplitOption && !batchExportMode && (
        <div className="space-y-3">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="split-multiple"
              checked={splitIntoMultiple}
              onCheckedChange={(checked) => setSplitIntoMultiple(checked as boolean)}
            />
            <Label htmlFor="split-multiple" className="text-yellow-400 font-semibold">
              Enable Batch Generation (Recommended for {exportCount}+ NFTs)
            </Label>
          </div>
          {splitIntoMultiple && (
            <Alert className="border-green-500 bg-green-500/10">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <strong>Batch Mode Enabled:</strong> Your collection will be generated in batches of {batchSize} NFTs
                each. You'll have control over when each batch downloads. Total batches:{" "}
                {Math.ceil(exportCount / batchSize)}
                <div className="mt-3 flex items-center space-x-2">
                  <Checkbox
                    id="auto-download"
                    checked={autoDownload}
                    onCheckedChange={(checked) => onToggleAutoDownload?.(checked as boolean)}
                  />
                  <Label htmlFor="auto-download" className="text-sm">
                    Auto-download and continue to next batch (Recommended for large collections)
                  </Label>
                </div>
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {showWarning && (
        <Alert className="border-yellow-500 bg-yellow-500/10">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>Large Collection Warning:</strong> Generating {exportCount} NFTs in a single file may cause browser
            memory issues. Consider enabling "Batch Generation" above for better performance.
          </AlertDescription>
        </Alert>
      )}

      {/* Batch Export Progress */}
      {batchExportMode && (
        <Card className="bg-gray-700 border-gray-600">
          <CardHeader>
            <CardTitle className="text-blue-400">Batch Generation Progress</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Overall Progress */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>
                  Overall Progress: {completedBatches.length} of {totalBatches} batches completed
                </span>
                <span>{Math.round((completedBatches.length / totalBatches) * 100)}%</span>
              </div>
              <Progress value={(completedBatches.length / totalBatches) * 100} className="h-2" />
            </div>

            <div className="p-4 bg-gray-800 rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold">
                  Batch {currentBatch} of {totalBatches}
                </h4>
                <span className={`text-sm font-medium ${getBatchStatusColor(batchStatus)}`}>
                  {getBatchStatusText(batchStatus)}
                </span>
              </div>

              {/* Generating */}
              {batchStatus === "generating" && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>{progressDetails || `Generating ${currentBatchNFTs} NFTs...`}</span>
                    <span>{exportProgress}%</span>
                  </div>
                  <Progress value={exportProgress} className="h-2" />
                  <div className="flex justify-center">
                    <Button onClick={onCancel} variant="destructive" size="sm">
                      Cancel Generation
                    </Button>
                  </div>
                </div>
              )}

              {/* Ready */}
              {batchStatus === "ready" && (
                <div className="space-y-3">
                  <div className="flex items-center space-x-2 text-green-400">
                    <CheckCircle className="w-4 h-4" />
                    <span className="text-sm">
                      Batch {currentBatch} generated successfully ({currentBatchNFTs} NFTs)
                    </span>
                  </div>
                  <div className="flex justify-center space-x-3">
                    <Button onClick={onDownloadBatch} className="bg-green-600 hover:bg-green-700">
                      <Download className="w-4 h-4 mr-2" />
                      Download Batch {currentBatch}
                    </Button>
                    <Button onClick={onCancel} variant="destructive" size="sm">
                      Cancel Export
                    </Button>
                  </div>
                </div>
              )}

              {/* Downloading */}
              {batchStatus === "downloading" && (
                <div className="space-y-2">
                  <div className="flex items-center space-x-2 text-purple-400">
                    <Download className="w-4 h-4 animate-bounce" />
                    <span className="text-sm">{progressDetails || "Processing..."}</span>
                  </div>
                  <Progress value={exportProgress} className="h-2" />
                  <div className="text-xs text-gray-400 text-center">{exportProgress}% complete</div>
                  <div className="flex justify-center">
                    <Button onClick={onCancel} variant="destructive" size="sm">
                      Cancel Download
                    </Button>
                  </div>
                </div>
              )}

              {/* Completed */}
              {batchStatus === "completed" && currentBatch < totalBatches && (
                <div className="space-y-3">
                  <div className="flex items-center space-x-2 text-green-400">
                    <CheckCircle className="w-4 h-4" />
                    <span className="text-sm">Batch {currentBatch} downloaded successfully!</span>
                  </div>
                  {autoDownload ? (
                    <div className="text-center space-y-2">
                      <div className="text-sm text-blue-400">🤖 Auto-continuing to next batch in 2 seconds...</div>
                      <Button onClick={onCancel} variant="destructive" size="sm">
                        Stop Auto-Export
                      </Button>
                    </div>
                  ) : (
                    <div className="flex justify-center space-x-3">
                      <Button onClick={onContinueToNext} className="bg-blue-600 hover:bg-blue-700">
                        <Play className="w-4 h-4 mr-2" />
                        Generate Next Batch ({currentBatch + 1}/{totalBatches})
                      </Button>
                      <Button onClick={onCancel} variant="destructive" size="sm">
                        Stop Export
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* All Completed */}
              {batchStatus === "completed" && currentBatch >= totalBatches && (
                <div className="text-center space-y-2">
                  <div className="flex items-center justify-center space-x-2 text-green-400">
                    <CheckCircle className="w-5 h-5" />
                    <span className="text-lg font-semibold">All Batches Completed!</span>
                  </div>
                  <p className="text-sm text-gray-400">
                    Successfully generated {exportCount} unique NFTs across {totalBatches} batches
                  </p>
                </div>
              )}
            </div>

            {/* Completed Batches Summary */}
            {completedBatches.length > 0 && (
              <div className="p-3 bg-gray-800 rounded">
                <h5 className="text-sm font-medium text-gray-300 mb-2">Completed Batches:</h5>
                <div className="flex flex-wrap gap-2">
                  {completedBatches.map((batchNum) => (
                    <Badge key={batchNum} variant="outline" className="text-green-400 border-green-400">
                      Batch {batchNum}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Single Export Progress */}
      {isExporting && !batchExportMode && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>{progressDetails || "Generating Collection..."}</span>
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

      {/* Start Export Button */}
      {!isExporting && !batchExportMode && (
        <div className="flex gap-2 justify-center">
          <Button onClick={handleExport} className="bg-purple-600 hover:bg-purple-700">
            <Download className="w-4 h-4 mr-2" />
            {splitIntoMultiple ? "Start Batch Generation" : "Generate Collection"}
          </Button>
        </div>
      )}
    </div>
  )
}

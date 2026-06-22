"use client"

import { useState, useRef } from "react"
import { X, Upload, CheckCircle, Loader2 } from "lucide-react"
import { Upload as TusUpload } from "tus-js-client"

const CATEGORIES = [
  { id: "project-demo", label: "🏗️ Project Demo" },
  { id: "tutorial", label: "📚 Tutorial" },
  { id: "defi", label: "🏦 DeFi" },
  { id: "bridges", label: "🌉 Bridges & Cross-chain" },
  { id: "infrastructure", label: "⚙️ Infrastructure" },
  { id: "governance", label: "🗳️ Governance" },
  { id: "nft", label: "🖼️ NFTs" },
  { id: "ai-agents", label: "🤖 AI & Agents" },
  { id: "ama", label: "🎙️ AMA" },
  { id: "talks", label: "🎤 Talks & Panels" },
  { id: "irl", label: "📍 IRL Moments" },
  { id: "random", label: "🎲 Random" },
]

interface UploadModalProps {
  userId: string
  onClose: () => void
  onSuccess: () => void
}

type UploadStatus = "idle" | "uploading" | "processing" | "done" | "error"

export default function UploadModal({ userId, onClose, onSuccess }: UploadModalProps) {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [ratePerSec, setRatePerSec] = useState("0.00005")
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState<UploadStatus>("idle")
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) setFile(f)
  }

  const toggleCategory = (id: string) => {
    setSelectedCategories((prev) => {
      if (prev.includes(id)) return prev.filter((c) => c !== id)
      if (prev.length >= 3) return prev
      return [...prev, id]
    })
  }

  const pollUntilReady = async (videoId: string, cloudflareUid: string) => {
    setStatus("processing")
    let attempts = 0
    while (attempts < 60) {
      await new Promise(r => setTimeout(r, 3000))
      const res = await fetch("/api/stream/video-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_id: videoId, cloudflare_uid: cloudflareUid }),
      })
      const data = await res.json()
      if (data.ready) {
        setStatus("done")
        setTimeout(() => {
          onSuccess()
          onClose()
        }, 1500)
        return
      }
      attempts++
    }
    setError("Video processing timed out. It may still be processing; check back later.")
    setStatus("error")
  }

  const handleUpload = async () => {
    if (!file || !title.trim()) {
      setError("Please select a file and enter a title")
      return
    }

    const rate = parseFloat(ratePerSec)
    if (isNaN(rate) || rate < 0.00005 || rate > 0.0001) {
      setError("Rate must be between $0.00005 and $0.0001 per second")
      return
    }

    setError(null)
    setStatus("uploading")
    setProgress(0)

    try {
      // Get one-time upload URL
      const res = await fetch("/api/stream/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          title: title.trim(),
          description: description.trim(),
          rate_per_sec: rate,
          categories: selectedCategories,
          file_size: file.size,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? "Failed to get upload URL")
      }

      const { uploadURL, videoUID, videoId } = await res.json()

      // Resumable upload via tus. The route already provisioned the upload, so
      // we point tus at that one-time URL (no creation POST here). Chunked +
      // auto-retrying, so large files (well over 200MB) and flaky networks work.
      await new Promise<void>((resolve, reject) => {
        const upload = new TusUpload(file, {
          uploadUrl: uploadURL,
          // Cloudflare requires a finite, 256KiB-aligned chunk size; 50 MiB
          // keeps the upload resumable rather than one giant PATCH.
          chunkSize: 50 * 1024 * 1024,
          retryDelays: [0, 3000, 5000, 10000, 20000],
          onProgress: (bytesSent, bytesTotal) => {
            if (bytesTotal > 0) setProgress(Math.round((bytesSent / bytesTotal) * 100))
          },
          onError: (err) => reject(err instanceof Error ? err : new Error("Upload failed")),
          onSuccess: () => resolve(),
        })
        upload.start()
      })

      // Poll until Cloudflare finishes processing
      await pollUntilReady(videoId, videoUID)
    } catch (err: unknown) {
      console.error("Upload failed:", err)
      setError(err instanceof Error ? err.message : "Upload failed")
      setStatus("error")
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-lg mx-4 rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-white/10 transition-colors"
        >
          <X size={18} />
        </button>

        <h2 className="text-lg font-bold mb-5">Upload Video</h2>

        <div className="flex flex-col gap-4">
          {/* Title */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">
              Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. My DeFi Protocol Walkthrough"
              disabled={status !== "idle" && status !== "error"}
              className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">
              Description
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What is this video about?"
              rows={3}
              disabled={status !== "idle" && status !== "error"}
              className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50 resize-none"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Categories</label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => toggleCategory(cat.id)}
                  className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    selectedCategories.includes(cat.id)
                      ? "border-primary/30 bg-primary/10 text-primary"
                      : "border-sa-border bg-transparent text-muted-foreground hover:border-sa-border-hover hover:text-foreground"
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Select up to 3 categories ({selectedCategories.length}/3)
            </p>
          </div>

          {/* Rate */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">
              Rate per second (USDC): $0.00005 to $0.0001
            </label>
            <input
              type="number"
              value={ratePerSec}
              onChange={e => setRatePerSec(e.target.value)}
              step="0.00001"
              min="0.00005"
              max="0.0001"
              disabled={status !== "idle" && status !== "error"}
              className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
            />
          </div>

          {/* File picker */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">
              Video File *
            </label>
            <div
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border hover:border-primary/50 transition-colors cursor-pointer py-8 px-4"
            >
              <Upload size={24} className="text-muted-foreground" />
              {file ? (
                <p className="text-sm font-medium">{file.name}</p>
              ) : (
                <p className="text-sm text-muted-foreground">Click to select video file</p>
              )}
              <p className="text-xs text-muted-foreground">MP4, MOV, WebM. Long-form OK — up to 1 hour, large files supported.</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          {/* Progress */}
          {status === "uploading" && (
            <div className="flex flex-col gap-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Uploading...</span>
                <span>{progress}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {status === "processing" && (
            <div className="flex items-center gap-3 rounded-xl bg-primary/10 border border-primary/20 px-4 py-3">
              <Loader2 size={16} className="animate-spin text-primary" />
              <p className="text-sm">Processing video... this may take a minute.</p>
            </div>
          )}

          {status === "done" && (
            <div className="flex items-center gap-3 rounded-xl bg-green-500/10 border border-green-500/20 px-4 py-3">
              <CheckCircle size={16} className="text-green-400" />
              <p className="text-sm text-green-400">Video published successfully!</p>
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={status === "uploading" || status === "processing"}
              className="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium hover:bg-white/5 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleUpload}
              disabled={!file || !title.trim() || status === "uploading" || status === "processing" || status === "done"}
              className="flex-1 rounded-xl bg-primary text-primary-foreground py-2.5 text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {status === "uploading" ? `Uploading ${progress}%` : status === "processing" ? "Processing..." : "Upload"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

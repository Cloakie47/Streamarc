"use client";

import { useState } from "react";
import { X, Plus, Trash2, Save } from "lucide-react";

interface Chapter {
  time: number;
  title: string;
}

interface ChapterEditorProps {
  videoId: string;
  videoTitle: string;
  durationSecs: number;
  userId: string;
  existingChapters?: Chapter[] | null;
  onClose: () => void;
  onSave: () => void;
}

function secondsToTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function timeToSeconds(time: string): number {
  const parts = time.split(":");
  if (parts.length === 2) {
    return Number.parseInt(parts[0], 10) * 60 + Number.parseInt(parts[1], 10);
  }
  return Number.parseInt(time, 10) || 0;
}

export default function ChapterEditor({
  videoId,
  videoTitle,
  durationSecs,
  userId,
  existingChapters,
  onClose,
  onSave,
}: ChapterEditorProps) {
  const [chapters, setChapters] = useState<Chapter[]>(
    existingChapters && existingChapters.length > 0
      ? existingChapters
      : [{ time: 0, title: "Introduction" }],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addChapter = () => {
    const lastTime = chapters[chapters.length - 1]?.time ?? 0;
    setChapters([...chapters, { time: lastTime + 30, title: "" }]);
  };

  const removeChapter = (i: number) => {
    if (chapters.length <= 1) return;
    setChapters(chapters.filter((_, idx) => idx !== i));
  };

  const updateChapter = (i: number, field: "time" | "title", value: string) => {
    setChapters(
      chapters.map((c, idx) => {
        if (idx !== i) return c;
        if (field === "time") {
          const secs = timeToSeconds(value);
          const clamped = Math.min(secs, durationSecs > 0 ? durationSecs : secs);
          return { ...c, time: clamped };
        }
        return { ...c, title: value };
      }),
    );
  };

  const handleSave = async () => {
    if (chapters.some((c) => !c.title.trim())) {
      setError("All chapters must have a title");
      return;
    }
    if (chapters.some((c) => durationSecs > 0 && c.time > durationSecs)) {
      setError(`Chapter time cannot exceed video duration (${secondsToTime(durationSecs)})`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const sorted = [...chapters].sort((a, b) => a.time - b.time);
      const res = await fetch("/api/stream/save-chapters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_id: videoId, chapters: sorted, user_id: userId }),
      });
      if (!res.ok) throw new Error("Failed to save");
      onSave();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-lg mx-4 rounded-2xl border border-border bg-card p-6 shadow-2xl max-h-[80vh] flex flex-col">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-white/10 transition-colors border-none bg-transparent cursor-pointer"
        >
          <X size={18} />
        </button>

        <h2 className="text-lg font-bold mb-1">Edit Chapters</h2>
        <p className="text-xs text-muted-foreground mb-4 line-clamp-1">{videoTitle}</p>

        <div className="flex flex-col gap-2 overflow-y-auto flex-1 pr-1">
          {chapters.map((chapter, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="text"
                value={secondsToTime(chapter.time)}
                onChange={(e) => updateChapter(i, "time", e.target.value)}
                placeholder="0:00"
                className="w-16 rounded-lg border border-border bg-background px-2 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/50 text-center"
              />
              <input
                type="text"
                value={chapter.title}
                onChange={(e) => updateChapter(i, "title", e.target.value)}
                placeholder="Chapter title"
                className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <button
                type="button"
                onClick={() => removeChapter(i)}
                disabled={chapters.length <= 1}
                className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors disabled:opacity-30 bg-transparent border-none cursor-pointer"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-col gap-3">
          <button
            type="button"
            onClick={addChapter}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors bg-transparent border-none cursor-pointer self-start"
          >
            <Plus size={16} />
            Add chapter
          </button>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium hover:bg-white/5 transition-colors cursor-pointer bg-transparent"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="flex-1 rounded-xl bg-primary text-primary-foreground py-2.5 text-sm font-bold hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center gap-2 cursor-pointer border-none"
            >
              <Save size={16} />
              {saving ? "Saving..." : "Save Chapters"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

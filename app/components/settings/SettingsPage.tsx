"use client";

import { useState, useRef } from "react";
import { Camera, Save, Twitter, MessageCircle } from "lucide-react";

export interface UserProfile {
  id: string;
  email: string | null;
  display_name: string | null;
  channel_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  x_handle: string | null;
  reddit_handle: string | null;
  telegram_handle: string | null;
}

export default function SettingsPage({ user }: { user: UserProfile }) {
  const [displayName, setDisplayName] = useState(user.display_name ?? "");
  const [channelName, setChannelName] = useState(user.channel_name ?? "");
  const [bio, setBio] = useState(user.bio ?? "");
  const [xHandle, setXHandle] = useState(user.x_handle ?? "");
  const [redditHandle, setRedditHandle] = useState(user.reddit_handle ?? "");
  const [telegramHandle, setTelegramHandle] = useState(user.telegram_handle ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [avatarUrl, setAvatarUrl] = useState(user.avatar_url ?? "");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("user_id", user.id);

      const res = await fetch("/api/users/avatar", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      setAvatarUrl(data.url);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/users/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: user.id,
          display_name: displayName,
          channel_name: channelName,
          bio,
          x_handle: xHandle,
          reddit_handle: redditHandle,
          telegram_handle: telegramHandle,
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const emailLabel = user.email ?? "";

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 flex flex-col gap-8">
      <h1 className="text-2xl font-bold tracking-tight">Profile Settings</h1>

      {/* Banner */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Banner Image
        </label>
        <div className="relative w-full h-32 rounded-2xl overflow-hidden border border-border bg-gradient-to-br from-primary/20 to-transparent flex items-center justify-center cursor-pointer hover:opacity-80 transition-opacity">
          {user.banner_url ? (
            <img src={user.banner_url} alt="Banner" className="w-full h-full object-cover" />
          ) : (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Camera size={24} />
              <span className="text-xs">Upload banner (2048×1152px, max 6MB)</span>
            </div>
          )}
        </div>
      </div>

      {/* Avatar */}
      <div className="flex items-center gap-4">
        <div className="relative" onClick={() => avatarInputRef.current?.click()}>
          <div className="relative w-20 h-20 rounded-full bg-primary/20 border border-border flex items-center justify-center overflow-hidden cursor-pointer hover:opacity-80 transition-opacity">
            {avatarUrl ? (
              <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <span className="text-2xl font-bold text-primary">
                {(displayName || user.email || "").slice(0, 1).toUpperCase()}
              </span>
            )}
            {uploadingAvatar && (
              <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
                <span className="text-xs text-white">Uploading...</span>
              </div>
            )}
          </div>
          <div className="absolute bottom-0 right-0 w-6 h-6 rounded-full bg-primary flex items-center justify-center pointer-events-none">
            <Camera size={12} className="text-primary-foreground" />
          </div>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            onChange={handleAvatarUpload}
            className="hidden"
          />
        </div>
        <div>
          <p className="text-sm font-medium">{emailLabel}</p>
          <p className="text-xs text-muted-foreground">Profile picture (98×98px min, max 4MB)</p>
        </div>
      </div>

      {/* Fields */}
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Display Name
          </label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
            className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Channel Name
          </label>
          <input
            type="text"
            value={channelName}
            onChange={(e) => setChannelName(e.target.value)}
            placeholder="Your channel name"
            className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <p className="text-xs text-muted-foreground">This is your public creator name shown on videos</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Bio</label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Tell viewers about yourself..."
            rows={4}
            className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
          />
        </div>

        <div className="flex flex-col gap-3">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Social Links
          </label>

          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
              <Twitter size={16} />
            </div>
            <input
              type="text"
              value={xHandle}
              onChange={(e) => setXHandle(e.target.value)}
              placeholder="X (Twitter) handle"
              className="flex-1 rounded-xl border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold">r/</span>
            </div>
            <input
              type="text"
              value={redditHandle}
              onChange={(e) => setRedditHandle(e.target.value)}
              placeholder="Reddit username"
              className="flex-1 rounded-xl border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
              <MessageCircle size={16} />
            </div>
            <input
              type="text"
              value={telegramHandle}
              onChange={(e) => setTelegramHandle(e.target.value)}
              placeholder="Telegram username"
              className="flex-1 rounded-xl border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {saved && <p className="text-sm text-green-400">Profile saved successfully!</p>}

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="btn btn-primary flex items-center gap-2 self-start"
      >
        <Save size={16} />
        {saving ? "Saving..." : "Save Changes"}
      </button>
    </div>
  );
}

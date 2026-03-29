"use client";

import FilterBar from "../layout/FilterBar";
import Hero from "./Hero";
import AdBanner from "./AdBanner";
import VideoShelf from "./VideoShelf";

export default function BrowsePage({
  onWatch,
  onSignup,
}: {
  onWatch: (videoId?: string) => void;
  onSignup: () => void;
}) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <FilterBar />
      <div className="flex-1 overflow-y-auto scrollbar-none">
        <div className="space-y-6 pb-8">
          <Hero onWatch={() => onWatch()} onSignup={onSignup} />
          <AdBanner />
          <VideoShelf onPlay={(videoId) => onWatch(videoId)} />
        </div>
      </div>
    </div>
  );
}
import Link from 'next/link';
import { RadioTower } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#0d0f12] text-slate-200 p-4 text-center">
      <RadioTower className="w-16 h-16 text-vlc-orange mb-4 animate-pulse" />
      <h2 className="text-2xl font-bold font-mono text-white mb-2">404 - Broadcast Frequency Not Found</h2>
      <p className="text-sm text-slate-400 max-w-md mb-6">
        The channel or media track you are tuning into is currently off the air or does not exist.
      </p>
      <Link
        href="/"
        className="px-4 py-2 bg-vlc-orange hover:bg-vlc-darkOrange text-black font-bold text-xs rounded-lg transition-colors"
      >
        Return to Main Broadcast
      </Link>
    </div>
  );
}

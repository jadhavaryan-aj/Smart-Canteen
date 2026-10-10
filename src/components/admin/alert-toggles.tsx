import { Bell, BellOff, Volume2, VolumeX } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import { useAdminRealtime } from './admin-realtime';

export function AlertToggles() {
  const { soundEnabled, setSoundEnabled, desktopEnabled, setDesktopEnabled } = useAdminRealtime();
  return (
    <div className="flex items-center gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={soundEnabled ? 'secondary' : 'ghost'}
            size="icon-sm"
            aria-pressed={soundEnabled}
            aria-label={soundEnabled ? 'Turn off new-order sound' : 'Turn on new-order sound'}
            onClick={() => void setSoundEnabled(!soundEnabled)}
          >
            {soundEnabled ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{soundEnabled ? 'Sound on for new orders' : 'Sound off'}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={desktopEnabled ? 'secondary' : 'ghost'}
            size="icon-sm"
            aria-pressed={desktopEnabled}
            aria-label={desktopEnabled ? 'Turn off browser notifications' : 'Turn on browser notifications'}
            onClick={() => void setDesktopEnabled(!desktopEnabled)}
          >
            {desktopEnabled ? <Bell className="size-4" /> : <BellOff className="size-4" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {desktopEnabled
            ? 'Browser notifications on (when this tab is in the background)'
            : 'Browser notifications off'}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

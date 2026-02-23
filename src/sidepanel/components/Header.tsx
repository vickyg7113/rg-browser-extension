import React from 'react';
import { Menu } from 'lucide-react';
import wingmanIcon from '../../icons/wingman-new.svg';

interface TabInfo {
  title: string;
  favIconUrl?: string;
  hostname: string;
  url: string;
}

interface HeaderProps {
  showTabInfo?: boolean;
  tabInfo?: TabInfo | null;
  onMenuClick?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  showTabInfo = false,
  tabInfo,
  onMenuClick,
}) => {
  return (
    <div className="border-b border-gray-200 bg-gray-50 px-4 py-3 relative">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <img
            src={wingmanIcon}
            alt="Wingman"
            className="w-8 h-8"
          />
          <span className="font-medium text-[#222222]">Wingman</span>
        </div>
        {(showTabInfo || onMenuClick) && (
          <div className="flex items-center gap-2">
            {showTabInfo && tabInfo && (
              <>
                {/* Green dot indicator */}
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                {/* Website icon */}
                {tabInfo.favIconUrl ? (
                  <img
                    src={tabInfo.favIconUrl}
                    alt={tabInfo.title}
                    className="w-5 h-5"
                    onError={(e) => {
                      // Fallback if favicon fails to load
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="w-5 h-5 bg-gray-300 rounded"></div>
                )}
                {/* Website name */}
                {/* <span className="text-sm font-medium text-gray-700 max-w-[150px] truncate">
                  {tabInfo.title}
                </span> */}
              </>
            )}
            {onMenuClick && (
              <button
                onClick={onMenuClick}
                className="text-gray-500 hover:text-gray-700 p-1 rounded hover:bg-gray-100 transition-colors"
                title="Menu"
              >
                <Menu className="w-6 h-6" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

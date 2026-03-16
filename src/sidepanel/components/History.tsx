import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
    isToday,
    isYesterday,
    isThisWeek,
    isThisMonth,
} from "date-fns";
import { useWingman, NEW_CHAT_ID } from "../hooks/WingmanContext";
import type { HistoryItem } from "../hooks/WingmanContext";
import { useState, useRef, useCallback, useEffect } from "react";

export default function History() {
    const {
        historyData,
        setActiveTabId,
        activeTabId,
        loadMoreHistory,
        isLoadingMore,
        isLoadingInitial,
        handleHistoryItemClick,
        isProcessing,
        loadInitialHistory
    } = useWingman();

    useEffect(() => {
        loadInitialHistory();
    }, [loadInitialHistory]);

    const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);
    const [clickedItemId, setClickedItemId] = useState<string | null>(null);

    const observer = useRef<IntersectionObserver>();
    const lastItemRef = useCallback(
        (node: HTMLDivElement) => {
            if (isLoadingMore) return;

            if (observer.current) observer.current.disconnect();

            observer.current = new IntersectionObserver((entries) => {
                if (entries[0].isIntersecting) {
                    loadMoreHistory();
                }
            });

            if (node) observer.current.observe(node);
        },
        [isLoadingMore, loadMoreHistory]
    );

    const groupHistoryByDate = (items: HistoryItem[]) => {
        return items.reduce((groups, item) => {
            const date = new Date(item.updated_on);
            let groupKey = "Older";

            if (isToday(date)) {
                groupKey = "Today";
            } else if (isYesterday(date)) {
                groupKey = "Yesterday";
            } else if (isThisWeek(date)) {
                groupKey = "This Week";
            } else if (isThisMonth(date)) {
                groupKey = "This Month";
            }

            if (!groups[groupKey]) {
                groups[groupKey] = [];
            }
            groups[groupKey].push(item);
            return groups;
        }, {} as Record<string, HistoryItem[]>);
    };

    // Deduplicate history items by id to prevent duplicate rendering
    const uniqueHistoryData = historyData.filter((item, index, self) =>
        index === self.findIndex((t) => t.id === item.id)
    );

    const groupedHistory = groupHistoryByDate(uniqueHistoryData);

    const handleItemClick = (item: HistoryItem) => {
        handleHistoryItemClick(item);
    };

    const handleMoreClick = (e: React.MouseEvent, itemId: string) => {
        e.stopPropagation();
        setClickedItemId(itemId);
    };

    const handleDropdownClose = () => {
        setClickedItemId(null);
    };

    if (isLoadingInitial) {
        return (
            <div className="flex items-center justify-center py-8 text-gray-500 text-sm">
                Loading history...
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {Object.entries(groupedHistory).map(([date, items], index, array) => (
                <div key={date}>
                    <div className="space-y-2">
                        <Badge
                            variant="outline"
                            className="font-normal bg-white border-gray-200 text-gray-600 mx-4"
                        >
                            {date}
                        </Badge>
                        <div className="space-y-1 px-1">
                            {items.map((item, itemIndex) => (
                                <div
                                    key={item.id}
                                    ref={
                                        index === array.length - 1 &&
                                            itemIndex === items.length - 1
                                            ? lastItemRef
                                            : undefined
                                    }
                                    className={`
                    flex items-center justify-between rounded-lg py-2 px-3
                    ${isProcessing ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
                    ${activeTabId === item.id ? "bg-gray-100" : "hover:bg-gray-50"}
                  `}
                                    onClick={() => !isProcessing && handleItemClick(item)}
                                    onMouseEnter={() =>
                                        !isProcessing && !clickedItemId && setHoveredItemId(item.id)
                                    }
                                    onMouseLeave={() =>
                                        !isProcessing && !clickedItemId && setHoveredItemId(null)
                                    }
                                >
                                    <span title={item.title} className="text-sm text-gray-700 truncate flex-1 mr-2">
                                        {item.title}
                                    </span>
                                    {(hoveredItemId === item.id || clickedItemId === item.id) && (
                                        <DropdownMenu
                                            open={clickedItemId === item.id}
                                            onOpenChange={handleDropdownClose}
                                        >
                                            <DropdownMenuTrigger className="focus:outline-none">
                                                <MoreHorizontal className="h-5 w-5 text-muted-foreground" />
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem>Edit</DropdownMenuItem>
                                                <DropdownMenuItem className="text-red-600">
                                                    Delete
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                    {index < array.length - 1 && (
                        <div className="border-b border-gray-100 mt-4" />
                    )}
                </div>
            ))}
            {isLoadingMore && (
                <div className="text-center py-2 text-gray-500">
                    Loading more...
                </div>
            )}
        </div>
    );
}

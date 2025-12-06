import { useState } from "react";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { CalendarIcon, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface DateRange {
  from: Date;
  to: Date;
}

interface DateRangeFilterProps {
  dateRange: DateRange;
  onDateRangeChange: (range: DateRange) => void;
}

type PresetKey = "this-week" | "this-month" | "last-month" | "last-3-months" | "last-6-months" | "custom";

const presets: { key: PresetKey; label: string }[] = [
  { key: "this-week", label: "This Week" },
  { key: "this-month", label: "This Month" },
  { key: "last-month", label: "Last Month" },
  { key: "last-3-months", label: "Last 3 Months" },
  { key: "last-6-months", label: "Last 6 Months" },
  { key: "custom", label: "Custom Range" },
];

export const DateRangeFilter = ({ dateRange, onDateRangeChange }: DateRangeFilterProps) => {
  const [activePreset, setActivePreset] = useState<PresetKey>("last-6-months");
  const [isCustomOpen, setIsCustomOpen] = useState(false);

  const handlePresetClick = (preset: PresetKey) => {
    const now = new Date();
    let from: Date;
    let to: Date = now;

    switch (preset) {
      case "this-week":
        from = startOfWeek(now, { weekStartsOn: 0 });
        to = endOfWeek(now, { weekStartsOn: 0 });
        break;
      case "this-month":
        from = startOfMonth(now);
        to = endOfMonth(now);
        break;
      case "last-month":
        from = startOfMonth(subMonths(now, 1));
        to = endOfMonth(subMonths(now, 1));
        break;
      case "last-3-months":
        from = startOfMonth(subMonths(now, 2));
        to = now;
        break;
      case "last-6-months":
        from = startOfMonth(subMonths(now, 5));
        to = now;
        break;
      case "custom":
        setIsCustomOpen(true);
        setActivePreset("custom");
        return;
      default:
        from = startOfMonth(subMonths(now, 5));
    }

    setActivePreset(preset);
    onDateRangeChange({ from, to });
  };

  const getPresetLabel = () => {
    if (activePreset === "custom") {
      return `${format(dateRange.from, "MMM d, yyyy")} - ${format(dateRange.to, "MMM d, yyyy")}`;
    }
    return presets.find((p) => p.key === activePreset)?.label || "Select Range";
  };

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="min-w-[180px] justify-between">
            <span>{getPresetLabel()}</span>
            <ChevronDown className="h-4 w-4 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[180px]">
          {presets.map((preset) => (
            <DropdownMenuItem
              key={preset.key}
              onClick={() => handlePresetClick(preset.key)}
              className={cn(activePreset === preset.key && "bg-accent")}
            >
              {preset.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {activePreset === "custom" && (
        <Popover open={isCustomOpen} onOpenChange={setIsCustomOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="icon">
              <CalendarIcon className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="range"
              selected={{ from: dateRange.from, to: dateRange.to }}
              onSelect={(range) => {
                if (range?.from && range?.to) {
                  onDateRangeChange({ from: range.from, to: range.to });
                } else if (range?.from) {
                  onDateRangeChange({ from: range.from, to: range.from });
                }
              }}
              numberOfMonths={2}
              className="p-3 pointer-events-auto"
            />
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
};

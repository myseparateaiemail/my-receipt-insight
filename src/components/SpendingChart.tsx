import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, TrendingUp, TrendingDown } from "lucide-react";
import { useSpendingAnalytics } from "@/hooks/useSpendingAnalytics";
import { Skeleton } from "@/components/ui/skeleton";

export const SpendingChart = () => {
  const { data, isLoading } = useSpendingAnalytics();

  if (isLoading) {
    return (
      <Card className="bg-gradient-to-br from-card to-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            Monthly Spending Trends
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-48 flex items-end justify-between gap-2">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="w-full" style={{ height: `${Math.random() * 80 + 20}%` }} />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Use real data or fallback to empty state
  const monthlyData = data?.monthlyTrends || [];
  
  // Ensure we have at least some data structure to display, even if empty
  const displayData = monthlyData.length > 0 
    ? monthlyData.slice(-6) // Show last 6 months
    : Array(6).fill(null).map((_, i) => {
        // Fallback for empty state showing placeholders
        const d = new Date();
        d.setMonth(d.getMonth() - (5 - i));
        return {
          month: d.toLocaleDateString("en-US", { month: "short" }),
          total: 0
        };
      });

  const maxSpending = Math.max(...displayData.map(d => d.total), 10); // Avoid divide by zero
  
  // Calculate trend
  const lastMonth = displayData[displayData.length - 1];
  const prevMonth = displayData[displayData.length - 2];
  let trendPercent = 0;
  
  if (lastMonth && prevMonth && prevMonth.total > 0) {
    trendPercent = ((lastMonth.total - prevMonth.total) / prevMonth.total) * 100;
  }
  
  const averageSpending = Math.round(
    displayData.reduce((sum, item) => sum + item.total, 0) / (displayData.filter(d => d.total > 0).length || 1)
  );

  return (
    <Card className="bg-gradient-to-br from-card to-primary/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          Monthly Spending Trends
        </CardTitle>
      </CardHeader>
      <CardContent>
        {monthlyData.length === 0 ? (
           <div className="h-48 flex flex-col items-center justify-center text-muted-foreground">
             <p>No spending data available yet.</p>
             <p className="text-sm">Scan receipts to see your trends!</p>
           </div>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-between items-end h-48 gap-2">
              {displayData.map((monthData, index) => {
                const height = Math.max((monthData.total / maxSpending) * 100, 4); // Min height 4% for visibility
                return (
                  <div key={index} className="flex flex-col items-center gap-2 flex-1 group">
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity text-xs text-muted-foreground font-medium">
                      ${monthData.total.toFixed(0)}
                    </div>
                    <div 
                      className="w-full bg-gradient-to-t from-primary to-primary-glow rounded-t-md min-h-[4px] transition-all duration-700 ease-out hover:from-primary/80 hover:to-primary-glow/80"
                      style={{ height: `${height}%` }}
                    />
                    <div className="text-xs text-muted-foreground whitespace-nowrap overflow-hidden text-ellipsis w-full text-center">
                      {monthData.month}
                    </div>
                  </div>
                );
              })}
            </div>
            
            <div className="flex items-center justify-between pt-4 border-t border-border">
              {monthlyData.length > 1 ? (
                <div className={`flex items-center gap-2 ${trendPercent > 0 ? 'text-destructive' : 'text-success'}`}>
                  {trendPercent > 0 ? (
                    <TrendingUp className="h-4 w-4" />
                  ) : (
                    <TrendingDown className="h-4 w-4" />
                  )}
                  <span className="text-sm font-medium">
                    {Math.abs(trendPercent).toFixed(1)}% {trendPercent > 0 ? 'increase' : 'decrease'}
                  </span>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">Not enough data for trend</div>
              )}
              <div className="text-sm text-muted-foreground">
                Average: ${averageSpending}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, DollarSign, ShoppingCart, Calendar, Target } from "lucide-react";
import { useSpendingAnalytics } from "@/hooks/useSpendingAnalytics";
import { Skeleton } from "@/components/ui/skeleton";
import { startOfMonth, subMonths } from "date-fns";

export const DashboardStats = () => {
  // We want stats specifically for "This Month" vs "Last Month"
  // The default hook returns 6 months, so we can calculate from there.
  const { data, isLoading } = useSpendingAnalytics();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-32 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  // Calculate stats from real data
  const monthlyTrends = data?.monthlyTrends || [];
  
  // Get current month and last month data
  // Note: monthlyTrends format is likely "MMM YY" strings, so we rely on the order returned (chronological)
  // or we could parse dates. Assuming useSpendingAnalytics returns chronological order.
  const currentMonthData = monthlyTrends[monthlyTrends.length - 1] || { total: 0, count: 0 };
  const lastMonthData = monthlyTrends[monthlyTrends.length - 2] || { total: 0, count: 0 };

  const thisMonthTotal = currentMonthData.total;
  const lastMonthTotal = lastMonthData.total;

  const totalChangePercent = lastMonthTotal > 0 
    ? ((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 100 
    : 0;

  // Receipts count
  // Since monthlyTrends doesn't have receipt count per month explicitly in the interface defined in hook (it has categories total), 
  // we might need to rely on the total summary or approximate. 
  // Wait, the hook returns `receiptCount` which is TOTAL for the period.
  // To get "Receipts Scanned This Month", we might be limited by the hook's current return signature.
  // Ideally, `monthlyTrends` should include receipt count. 
  // For now, let's use the TOTAL `receiptCount` from the hook for the period (last 6 months) 
  // or just show total receipts if the backend supports it.
  // Actually, looking at `useSpendingAnalytics.ts`, `receiptCount` is `(receipts || []).length`. 
  // This is the total count over the requested date range (default 6 months).
  
  // Let's refine the hook usage or just display "Total Receipts" instead of "This Month" for now if granular data isn't available easily without refactoring the hook.
  // Or better, let's assume the user wants to see the total stats available.
  
  const stats = [
    {
      title: "This Month",
      value: `$${thisMonthTotal.toFixed(2)}`,
      change: `${totalChangePercent > 0 ? '+' : ''}${totalChangePercent.toFixed(1)}%`,
      trend: totalChangePercent >= 0 ? "up" : "down",
      icon: DollarSign,
      description: "vs last month"
    },
    {
      title: "Avg per Trip",
      value: `$${(data?.averagePerReceipt || 0).toFixed(2)}`,
      change: "0%", // We don't have historical avg per trip easily calculated yet
      trend: "neutral", 
      icon: ShoppingCart,
      description: "last 6 months"
    },
    {
      title: "Receipts Scanned",
      value: (data?.receiptCount || 0).toString(),
      change: "", 
      trend: "neutral",
      icon: Calendar,
      description: "total (last 6 mo)"
    },
    {
      title: "Top Category",
      value: data?.topCategory || "None",
      change: "",
      trend: "neutral",
      icon: Target,
      description: "highest spend"
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {stats.map((stat, index) => (
        <Card key={index} className="relative overflow-hidden bg-gradient-to-br from-card to-muted/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {stat.title}
            </CardTitle>
            <div className={`p-2 rounded-lg ${
              stat.trend === 'up' ? 'bg-destructive/10' : stat.trend === 'down' ? 'bg-success/10' : 'bg-primary/10'
            }`}>
              <stat.icon className={`h-4 w-4 ${
                stat.trend === 'up' ? 'text-destructive' : stat.trend === 'down' ? 'text-success' : 'text-primary'
              }`} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground mb-1 truncate">
              {stat.value}
            </div>
            <div className="flex items-center gap-2">
              {stat.change && (
                <div className={`flex items-center gap-1 text-sm ${
                  stat.trend === 'up' ? 'text-destructive' : stat.trend === 'down' ? 'text-success' : 'text-muted-foreground'
                }`}>
                  {stat.trend === 'up' && <TrendingUp className="h-3 w-3" />}
                  {stat.trend === 'down' && <TrendingDown className="h-3 w-3" />}
                  {stat.change}
                </div>
              )}
              <span className="text-sm text-muted-foreground">
                {stat.description}
              </span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

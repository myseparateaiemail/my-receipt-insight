import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Lightbulb, TrendingDown, Star, AlertTriangle, Info, Store } from "lucide-react";
import { useSpendingAnalytics } from "@/hooks/useSpendingAnalytics";
import { Skeleton } from "@/components/ui/skeleton";

export const InsightsPanel = () => {
  const { data, isLoading } = useSpendingAnalytics();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-primary" />
            Smart Insights
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-4">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const insights = [];

  // 1. Top Category Insight
  if (data?.categoryBreakdown && data.categoryBreakdown.length > 0) {
    const topCategory = data.categoryBreakdown[0];
    if (topCategory.total > 0) {
      insights.push({
        type: "spending",
        icon: TrendingDown, 
        title: "Top Spending Category",
        description: `You spent $${topCategory.total.toFixed(2)} on ${topCategory.category}, which is your highest expense.`,
        impact: "High",
        category: topCategory.category
      });
    }
  }

  // 2. Receipt Frequency / Count Insight
  if (data?.receiptCount === 1) {
    insights.push({
      type: "onboarding",
      icon: Star,
      title: "Off to a Great Start!",
      description: "You've scanned your first receipt. Scan more to unlock detailed trends.",
      impact: "Info",
      category: "General"
    });
  } else if ((data?.receiptCount || 0) > 1) {
    const totalSpent = data?.totalSpent || 0;
    const avg = data?.averagePerReceipt || 0;
    insights.push({
      type: "habit",
      icon: Star,
      title: "Shopping Habits",
      description: `You've scanned ${data?.receiptCount} receipts total, averaging $${avg.toFixed(0)} per trip.`,
      impact: "Info",
      category: "General"
    });
  }
  
  // 3. Top Store Insight
  if (data?.topStore && data.topStore !== "None" && data.topStore !== "Unknown") {
    insights.push({
        type: "store",
        icon: Store,
        title: "Favorite Store",
        description: `Your most visited store is ${data.topStore}.`,
        impact: "Info",
        category: "Shopping"
    });
  }

  // 4. Fallback or additional random tip if we have data
  if (data?.receiptCount === 0) {
    insights.push({
      type: "empty",
      icon: Info,
      title: "No Data Yet",
      description: "Scan your first receipt to see smart insights here!",
      impact: "Info",
      category: "Getting Started"
    });
  }

  const getImpactColor = (impact: string) => {
    switch (impact) {
      case 'High':
        return 'bg-destructive/10 text-destructive border-destructive/20';
      case 'Medium':
        return 'bg-warning/10 text-warning border-warning/20';
      case 'Info':
        return 'bg-primary/10 text-primary border-primary/20';
      default:
        return 'bg-muted text-muted-foreground border-border';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-primary" />
          Smart Insights
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {insights.map((insight, index) => (
            <div 
              key={index}
              className="p-4 rounded-lg border border-border bg-gradient-to-r from-card to-muted/10"
            >
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <insight.icon className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-foreground">{insight.title}</h4>
                    <Badge 
                      variant="outline" 
                      className={getImpactColor(insight.impact)}
                    >
                      {insight.impact}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {insight.description}
                  </p>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">
                      {insight.category}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

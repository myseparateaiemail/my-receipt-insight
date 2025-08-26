import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Lightbulb, TrendingDown, Star, AlertTriangle } from "lucide-react";

export const InsightsPanel = () => {
  const insights = [
    {
      type: "savings",
      icon: TrendingDown,
      title: "Switch to Store Brand",
      description: "Save $12/month by choosing store brand cereals",
      impact: "High",
      category: "Breakfast Items"
    },
    {
      type: "popular",
      icon: Star,
      title: "Frequently Bought",
      description: "Organic bananas appear in 85% of your receipts",
      impact: "Info",
      category: "Produce"
    },
    {
      type: "waste",
      icon: AlertTriangle,
      title: "Potential Waste",
      description: "You buy bread every 3 days - consider buying less frequently",
      impact: "Medium",
      category: "Bakery"
    }
  ];

  const getImpactColor = (impact: string) => {
    switch (impact) {
      case 'High':
        return 'bg-warning/10 text-warning border-warning/20';
      case 'Medium':
        return 'bg-info/10 text-info border-info/20';
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
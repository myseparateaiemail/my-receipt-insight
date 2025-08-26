import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, DollarSign, ShoppingCart, Calendar, Target } from "lucide-react";

export const DashboardStats = () => {
  const stats = [
    {
      title: "This Month",
      value: "$487.23",
      change: "+12.3%",
      trend: "up",
      icon: DollarSign,
      description: "vs last month"
    },
    {
      title: "Avg per Trip",
      value: "$64.20",
      change: "-5.1%",
      trend: "down", 
      icon: ShoppingCart,
      description: "vs last month"
    },
    {
      title: "Receipts Scanned",
      value: "23",
      change: "+8",
      trend: "up",
      icon: Calendar,
      description: "this month"
    },
    {
      title: "Savings Goal",
      value: "73%",
      change: "+15%",
      trend: "up",
      icon: Target,
      description: "on track"
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
            <div className="p-2 rounded-lg bg-primary/10">
              <stat.icon className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground mb-1">
              {stat.value}
            </div>
            <div className="flex items-center gap-2">
              <div className={`flex items-center gap-1 text-sm ${
                stat.trend === 'up' ? 'text-success' : 'text-warning'
              }`}>
                {stat.trend === 'up' ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                {stat.change}
              </div>
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